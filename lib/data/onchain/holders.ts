/**
 * On-chain holders reader — Tier 1 (authoritative) source for investor lists.
 *
 * For each EVM deployment of a token we:
 *  1. Scan `Transfer` event logs in chunked block ranges
 *  2. Collect the union of `from` + `to` addresses (candidate holders)
 *  3. Batched `balanceOf()` for every candidate in one HTTP request
 *  4. Keep only non-zero balances
 *  5. Aggregate the same EOA across chains
 *
 * This bypasses Centrifuge's indexer entirely — when the indexer goes
 * stale or loses a token's positions, this reader still returns the
 * correct holder set.
 *
 * ─── ⚠ Production requires a paid RPC ────────────────────────────
 *
 * A full historical Transfer scan of a token with 1–2M blocks of history
 * makes 100–300 eth_getLogs calls per chain. Free-tier public RPCs
 * (drpc.org, llamarpc, publicnode) rate-limit in this regime and lose
 * 5–20% of chunks even with retry/backoff, which silently truncates the
 * holder list.
 *
 * To run this reliably, set a paid RPC URL via the per-chain env var:
 *   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
 *   ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
 *   OPTIMISM_RPC_URL=...
 *   (etc.)
 *
 * Until those are configured, this reader is not wired into the API
 * routes — the indexer's tokenInstancePositions remains the primary
 * source for "Top Holders" UI. This module is the opt-in fallback.
 *
 * Cost profile (per token, cold cache, paid RPC):
 *   - 1 eth_blockNumber per chain
 *   - N chunked eth_getLogs per chain (N = rangeBlocks / chunkSize)
 *   - ⌈M/batchSize⌉ batched eth_call (balanceOf) per chain
 *
 * Intended to be called server-side from a cached API route (TTL ≥ 10min).
 */

import { ALL_TOKENS, CHAINS, type ChainKey, type TokenDef } from './registry';
import {
  batchEthCall,
  decodeUint,
  encodeAddress,
  formatTokenAmount,
  getLatestBlock,
  getLogs,
  SEL,
  TRANSFER_TOPIC,
  type LogEntry,
} from './rpc';

/** Per-chain balance for a single holder. */
export interface HolderChainBalance {
  chain: ChainKey;
  chainId: number;
  balance: number;
}

/** Aggregated holder record, summed across chains. */
export interface HolderRecord {
  address: string;
  totalBalance: number;
  totalUsd: number;
  perChain: HolderChainBalance[];
}

/** Per-chain scan diagnostics. Surfaced in the response so the UI can
 *  flag incomplete data instead of rendering a silent-but-wrong holder list. */
export interface HoldersChainDiagnostics {
  chain: ChainKey;
  chainId: number;
  address: string;
  /** Block range that was actually scanned. */
  fromBlock: number;
  toBlock: number;
  candidatesScanned: number;
  holdersFound: number;
  /** True if one or more chunks failed — the result for this chain is partial. */
  partial: boolean;
  failed: boolean;
}

export interface HoldersSnapshot {
  symbol: string;
  holders: HolderRecord[];
  totalHolders: number;
  diagnostics: HoldersChainDiagnostics[];
  /** True if any chain returned partial or failed data. */
  degraded: boolean;
  fetchedAt: number;
}

export interface GetHoldersOpts {
  /** NAV (USD per share) for USD value on each holder record. */
  navUsd?: number;
  /**
   * Block range to scan if `fromBlock` is not configured in the registry.
   * Default: 2,000,000 (about 47 days on Base, 7 months on Ethereum).
   */
  defaultLookback?: number;
  /** Chunk size for eth_getLogs. Default 10,000 (standard public-RPC cap). */
  chunkSize?: number;
  /** Max concurrent getLogs requests per chain. Default 5. */
  concurrency?: number;
  /** Max addresses per balanceOf batch. Default 400. */
  balanceBatchSize?: number;
}

const DEFAULT_LOOKBACK = 2_000_000;
const DEFAULT_CHUNK = 10_000;
// Keep concurrency low — free-tier public RPCs rate-limit aggressively
// around 5–10 parallel requests. 2 with retry is more reliable than 5 without.
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_BALANCE_BATCH = 400;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/**
 * Pick the 20-byte address out of a Transfer event topic (which is 32 bytes,
 * address is right-aligned and left-padded with zeros).
 */
function topicToAddress(topic: string): string {
  if (!topic || topic.length < 42) return ZERO_ADDR;
  return ('0x' + topic.slice(-40)).toLowerCase();
}

/**
 * Run an async task pool — simple p-limit, N tasks at a time.
 */
async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Scan one chain for a single token deployment — returns unique candidate
 * addresses plus block range diagnostics.
 */
async function scanChainCandidates(
  chain: ChainKey,
  address: string,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  concurrency: number,
): Promise<{ candidates: Set<string>; partial: boolean; failed: boolean }> {
  const chunks: Array<{ from: number; to: number }> = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    chunks.push({ from: start, to: Math.min(start + chunkSize - 1, toBlock) });
  }

  if (chunks.length === 0) {
    return { candidates: new Set(), partial: false, failed: true };
  }

  const logsByChunk = await parallelLimit(chunks, concurrency, async (chunk) => {
    const logs = await getLogs(chain, {
      address,
      topics: [TRANSFER_TOPIC],
      fromBlock: chunk.from,
      toBlock: chunk.to,
    });
    return logs;
  });

  const candidates = new Set<string>();
  let failedChunks = 0;

  for (const logs of logsByChunk) {
    if (logs == null) {
      failedChunks += 1;
      continue;
    }
    for (const log of logs as LogEntry[]) {
      // Transfer(address indexed from, address indexed to, uint256 value)
      // topics: [sig, from, to]
      if (log.topics.length < 3) continue;
      const from = topicToAddress(log.topics[1]);
      const to = topicToAddress(log.topics[2]);
      if (from !== ZERO_ADDR) candidates.add(from);
      if (to !== ZERO_ADDR) candidates.add(to);
    }
  }

  // All chunks failed? Call this a hard failure.
  if (failedChunks === chunks.length) {
    return { candidates, partial: false, failed: true };
  }
  return {
    candidates,
    partial: failedChunks > 0,
    failed: false,
  };
}

/**
 * Batched balanceOf for a list of candidate addresses on a single chain.
 * Splits into sub-batches to respect RPC request-size limits.
 */
async function readBalances(
  chain: ChainKey,
  tokenAddress: string,
  candidates: string[],
  decimals: number,
  batchSize: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (candidates.length === 0) return out;

  const batches: string[][] = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    batches.push(candidates.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const calls = batch.map((addr) => ({
      to: tokenAddress,
      data: SEL.balanceOf + encodeAddress(addr),
    }));
    const results = await batchEthCall(chain, calls, { timeoutMs: 20_000 });
    results.forEach((raw, idx) => {
      if (raw == null) return;
      const bal = formatTokenAmount(decodeUint(raw), decimals);
      if (bal > 0) out.set(batch[idx].toLowerCase(), bal);
    });
  }

  return out;
}

/**
 * Read on-chain holders for a single token across every chain it's deployed on.
 */
export async function getOnchainHolders(
  symbol: string,
  opts: GetHoldersOpts = {},
): Promise<HoldersSnapshot | null> {
  const def = ALL_TOKENS[symbol];
  if (!def) return null;

  const {
    navUsd = 0,
    defaultLookback = DEFAULT_LOOKBACK,
    chunkSize = DEFAULT_CHUNK,
    concurrency = DEFAULT_CONCURRENCY,
    balanceBatchSize = DEFAULT_BALANCE_BATCH,
  } = opts;

  const chainKeys = Object.keys(def.deployments) as ChainKey[];
  if (chainKeys.length === 0) return null;

  // Step 1: resolve block ranges for every chain in parallel.
  const ranges = await Promise.all(
    chainKeys.map(async (chain) => {
      const latest = await getLatestBlock(chain);
      if (latest == null) {
        return { chain, fromBlock: 0, toBlock: 0, latestOk: false };
      }
      const configured = def.fromBlock?.[chain];
      const fromBlock =
        configured != null ? configured : Math.max(0, latest - defaultLookback);
      return { chain, fromBlock, toBlock: latest, latestOk: true };
    }),
  );

  // Step 2: scan candidates per chain (sequential chain order is fine — chunks
  // within a chain are parallel, and different chains hit different RPCs).
  const chainWork = await Promise.all(
    ranges.map(async (r) => {
      const address = def.deployments[r.chain]!;
      if (!r.latestOk) {
        const diag: HoldersChainDiagnostics = {
          chain: r.chain,
          chainId: CHAINS[r.chain].id,
          address,
          fromBlock: 0,
          toBlock: 0,
          candidatesScanned: 0,
          holdersFound: 0,
          partial: false,
          failed: true,
        };
        return { chain: r.chain, balances: new Map<string, number>(), diag };
      }

      const { candidates, partial, failed } = await scanChainCandidates(
        r.chain,
        address,
        r.fromBlock,
        r.toBlock,
        chunkSize,
        concurrency,
      );

      const balances = failed
        ? new Map<string, number>()
        : await readBalances(
            r.chain,
            address,
            Array.from(candidates),
            def.decimals,
            balanceBatchSize,
          );

      const diag: HoldersChainDiagnostics = {
        chain: r.chain,
        chainId: CHAINS[r.chain].id,
        address,
        fromBlock: r.fromBlock,
        toBlock: r.toBlock,
        candidatesScanned: candidates.size,
        holdersFound: balances.size,
        partial,
        failed,
      };
      return { chain: r.chain, balances, diag };
    }),
  );

  // Step 3: merge per-chain balances into unified HolderRecord[].
  const byAddress = new Map<string, HolderRecord>();
  for (const { chain, balances } of chainWork) {
    for (const [addr, bal] of balances.entries()) {
      const existing = byAddress.get(addr);
      if (existing) {
        existing.totalBalance += bal;
        existing.totalUsd += bal * navUsd;
        existing.perChain.push({ chain, chainId: CHAINS[chain].id, balance: bal });
      } else {
        byAddress.set(addr, {
          address: addr,
          totalBalance: bal,
          totalUsd: bal * navUsd,
          perChain: [{ chain, chainId: CHAINS[chain].id, balance: bal }],
        });
      }
    }
  }

  const holders = Array.from(byAddress.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance,
  );
  const diagnostics = chainWork.map((w) => w.diag);
  const degraded = diagnostics.some((d) => d.partial || d.failed);

  return {
    symbol: def.symbol,
    holders,
    totalHolders: holders.length,
    diagnostics,
    degraded,
    fetchedAt: Date.now(),
  };
}

/**
 * Read holders for every token in the registry. Returns a record keyed by
 * symbol. Failed tokens are simply omitted. Best-effort parallel.
 */
export async function getAllOnchainHolders(
  navBySymbol: Record<string, number>,
): Promise<Record<string, HoldersSnapshot>> {
  const symbols = Object.keys(ALL_TOKENS);
  const entries = await Promise.all(
    symbols.map(async (sym) => {
      const snap = await getOnchainHolders(sym, { navUsd: navBySymbol[sym] ?? 0 });
      return [sym, snap] as const;
    }),
  );
  const out: Record<string, HoldersSnapshot> = {};
  for (const [sym, snap] of entries) {
    if (snap) out[sym] = snap;
  }
  return out;
}

/** Look up a token def (re-exported for symmetry with supply.ts). */
export function getTokenDef(symbol: string): TokenDef | undefined {
  return ALL_TOKENS[symbol];
}
