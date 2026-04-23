/**
 * On-chain supply reader — Tier 1 (authoritative) source for TVL.
 *
 * Reads `totalSupply()` directly from every deployment of a token across
 * chains. One batched JSON-RPC call per chain, parallelized across chains.
 * Gracefully degrades: if a single chain fails, we still return the supply
 * from the chains that responded.
 *
 * This replaces reliance on Centrifuge's `tokenInstance.totalIssuance` —
 * when the indexer drops a token's supply to 0 (as happened with deSPXA,
 * deCRDX, SPXA), the on-chain reader still reports the correct number.
 */

import { globalCache } from '@/lib/sdk/cache';
import {
  ALL_TOKENS,
  CHAINS,
  DERWA_TOKENS,
  INSTITUTIONAL_TOKENS,
  type ChainKey,
  type TokenDef,
} from './registry';
import {
  batchEthCall,
  decodeUint,
  formatTokenAmount,
  SEL,
} from './rpc';

const CACHE_KEY = 'centrifuge:onchain:supplies';
/**
 * Cross-route on-chain snapshot cache TTL. We want every route hit within
 * this window to see the same numbers so /api/pools and /api/derwa can't
 * disagree because they fetched at different times. 4 minutes aligns with
 * the 5-minute TTL on the per-route caches so the supplies snapshot is
 * never the stale one — every route TTL expiry forces a fresh supplies
 * read.
 */
const SUPPLIES_TTL_MS = 240_000;

export interface ChainSupply {
  chain: ChainKey;
  chainId: number;
  address: string;
  supply: number;
  tvlUsd: number;
  /** True if this chain's RPC failed — we don't want to count missing data as $0. */
  failed: boolean;
}

export interface TokenSupplySnapshot {
  symbol: string;
  totalSupply: number;
  totalTvlUsd: number;
  perChain: ChainSupply[];
  /** Number of chains that returned successfully. */
  chainsOk: number;
  /** Number of chains that failed (RPC error, timeout, etc.). */
  chainsFailed: number;
  /** Timestamp in ms when this snapshot was taken. */
  fetchedAt: number;
}

/**
 * Read totalSupply() from every EVM deployment of a token, in parallel
 * across chains. Uses navUsd to convert shares to USD TVL.
 */
export async function getOnchainTokenSupply(
  symbol: string,
  navUsd: number,
): Promise<TokenSupplySnapshot | null> {
  const def = ALL_TOKENS[symbol];
  if (!def) return null;

  const chainKeys = Object.keys(def.deployments) as ChainKey[];
  if (chainKeys.length === 0) return null;

  // One batched RPC per chain. We're only making one call per chain (just
  // totalSupply) so the batch is of size 1 — but using batchEthCall keeps the
  // error-handling uniform and leaves headroom to add decimals/symbol reads.
  const results = await Promise.all(
    chainKeys.map(async (chain) => {
      const addr = def.deployments[chain]!;
      const [rawSupply] = await batchEthCall(chain, [
        { to: addr, data: SEL.totalSupply },
      ]);
      return { chain, addr, rawSupply };
    }),
  );

  const perChain: ChainSupply[] = [];
  let chainsFailed = 0;

  for (const { chain, addr, rawSupply } of results) {
    if (rawSupply == null) {
      chainsFailed += 1;
      perChain.push({
        chain,
        chainId: CHAINS[chain].id,
        address: addr,
        supply: 0,
        tvlUsd: 0,
        failed: true,
      });
      continue;
    }
    const supply = formatTokenAmount(decodeUint(rawSupply), def.decimals);
    perChain.push({
      chain,
      chainId: CHAINS[chain].id,
      address: addr,
      supply,
      tvlUsd: supply * navUsd,
      failed: false,
    });
  }

  const totalSupply = perChain.reduce((sum, c) => sum + c.supply, 0);
  return {
    symbol: def.symbol,
    totalSupply,
    totalTvlUsd: totalSupply * navUsd,
    perChain,
    chainsOk: perChain.length - chainsFailed,
    chainsFailed,
    fetchedAt: Date.now(),
  };
}

/**
 * Read every token in the registry in parallel. Pass a `navBySymbol` map to
 * compute USD values — pass 0 for tokens without a NAV to get raw supply.
 *
 * Cached under a single key so every API route sees the same snapshot for
 * the TTL window, preventing /api/pools and /api/derwa from disagreeing
 * because they happened to refetch at different moments.
 */
export async function getAllOnchainSupplies(
  navBySymbol: Record<string, number>,
): Promise<Record<string, TokenSupplySnapshot>> {
  const cached = globalCache.get<Record<string, TokenSupplySnapshot>>(
    CACHE_KEY,
    SUPPLIES_TTL_MS,
  );
  if (cached) {
    // Re-apply navUsd so tvlUsd fields reflect the freshest NAV — the
    // cached `totalSupply` and `perChain[].supply` are the expensive part
    // to fetch; tvlUsd is just multiplication we can redo cheaply.
    const refreshed: Record<string, TokenSupplySnapshot> = {};
    for (const [sym, snap] of Object.entries(cached)) {
      const nav = navBySymbol[sym] ?? 0;
      refreshed[sym] = {
        ...snap,
        totalTvlUsd: snap.totalSupply * nav,
        perChain: snap.perChain.map((c) => ({
          ...c,
          tvlUsd: c.supply * nav,
        })),
      };
    }
    return refreshed;
  }

  const symbols = Object.keys(ALL_TOKENS);
  const entries = await Promise.all(
    symbols.map(async (sym) => {
      const nav = navBySymbol[sym] ?? 0;
      const snap = await getOnchainTokenSupply(sym, nav);
      return [sym, snap] as const;
    }),
  );
  const out: Record<string, TokenSupplySnapshot> = {};
  for (const [sym, snap] of entries) {
    if (snap) out[sym] = snap;
  }
  globalCache.set(CACHE_KEY, out);
  return out;
}

/**
 * Convenience: read supplies only for the 4 deRWA wrappers.
 * Used by the deRWA detail/index routes which don't need institutional data.
 */
export async function getDerwaOnchainSupplies(
  navBySymbol: Record<string, number>,
): Promise<Record<string, TokenSupplySnapshot>> {
  const symbols = Object.keys(DERWA_TOKENS);
  const entries = await Promise.all(
    symbols.map(async (sym) => {
      const nav = navBySymbol[sym] ?? 0;
      const snap = await getOnchainTokenSupply(sym, nav);
      return [sym, snap] as const;
    }),
  );
  const out: Record<string, TokenSupplySnapshot> = {};
  for (const [sym, snap] of entries) {
    if (snap) out[sym] = snap;
  }
  return out;
}

/** List every symbol the registry knows about — institutional + deRWA. */
export function allKnownSymbols(): {
  institutional: string[];
  derwa: string[];
} {
  return {
    institutional: Object.keys(INSTITUTIONAL_TOKENS),
    derwa: Object.keys(DERWA_TOKENS),
  };
}

/** Look up a token's definition by symbol. */
export function getTokenDef(symbol: string): TokenDef | undefined {
  return ALL_TOKENS[symbol];
}
