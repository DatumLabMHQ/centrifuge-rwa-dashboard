/**
 * On-chain Swap event scanner for Aerodrome Slipstream pools.
 *
 * Reads `Swap` event logs directly from a Uniswap V3-style concentrated
 * liquidity pool contract via batched RPC. Aggregates by UTC day. The
 * authoritative source — every other DEX dashboard (GeckoTerminal,
 * DefiLlama, Aerodrome's own UI) ultimately reads the same events,
 * just with extra hops we don't need.
 *
 * Event signature:
 *   event Swap(
 *     address indexed sender,
 *     address indexed recipient,
 *     int256 amount0,
 *     int256 amount1,
 *     uint160 sqrtPriceX96,
 *     uint128 liquidity,
 *     int24 tick
 *   )
 *
 * Topic 0:
 *   keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)")
 *   = 0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67
 *
 * Sign convention for amount0/amount1 (Uniswap V3): positive when tokens
 * are flowing INTO the pool, negative when flowing OUT to the recipient.
 * For a USDC-deSPXA pool with token0=USDC, token1=deSPXA:
 *   amount0 > 0  →  user sold USDC (and bought deSPXA)
 *   amount0 < 0  →  user bought USDC (and sold deSPXA)
 */

import {
  batchEthCall,
  decodeUint,
  formatTokenAmount,
  getLatestBlock,
  getLogs,
  SEL,
  type LogEntry,
} from './rpc';
import type { ChainKey } from './registry';

const SWAP_TOPIC =
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

/** One day's aggregated swap activity. */
export interface SwapDay {
  /** YYYY-MM-DD UTC. */
  date: string;
  /** Number of Swap events. */
  txCount: number;
  /** Total $ volume (USDC side, both directions counted as positive). */
  volumeUsd: number;
  /** Total USDC bought from the pool (deSPXA→USDC swaps). */
  usdcOutUsd: number;
  /** Total USDC sold into the pool (USDC→deSPXA swaps). */
  usdcInUsd: number;
  /** Distinct recipient addresses. */
  uniqueTraders: number;
}

export interface SwapsSnapshot {
  pool: string;
  network: ChainKey;
  fromBlock: number;
  toBlock: number;
  scannedChunks: number;
  failedChunks: number;
  series: SwapDay[];
  totalVolumeUsd: number;
  totalTxCount: number;
  fetchedAt: number;
}

export interface ScanSwapsOpts {
  /** EVM chain key (e.g. 'base'). */
  network: ChainKey;
  /** Pool contract address. */
  pool: string;
  /** Address of token0 — used to call decimals() and orient signs. */
  token0: string;
  /** Address of token1. */
  token1: string;
  /** Lookback in days from latest block. Default 90. */
  lookbackDays?: number;
  /** Average block time in seconds. Defaults to 2s (Base). */
  blockTimeSec?: number;
  /** Chunk size for eth_getLogs. Default 9999 (under the typical 10k cap). */
  chunkSize?: number;
  /**
   * Max concurrent eth_getLogs requests.
   *
   * Default 8 — calibrated for our paid Alchemy tier on Base. With 130
   * chunks for a 30-day window, concurrency=8 finishes in ~5-7s; the
   * previous default of 2 was free-tier-friendly but caused 20-30s
   * cold-cache loads that pushed against Vercel's 60s function timeout.
   *
   * Lower this if BASE_RPC_URL points at a public/free RPC (drpc.org,
   * 1rpc.io) that throttles; higher won't help (Alchemy doesn't penalize
   * higher parallelism for batched JSON-RPC).
   */
  concurrency?: number;
}

/**
 * Decode a uint256 hex slice into a signed int256.
 * Uniswap V3 amounts are signed — high bit set ⇒ negative (two's complement).
 */
function decodeInt256(hex: string): bigint {
  // Strip 0x and pad to 64.
  const clean = hex.replace(/^0x/, '').padStart(64, '0');
  const bn = BigInt('0x' + clean);
  // If high bit set, subtract 2^256 to recover the negative value.
  const TWO_POW_256 = BigInt(1) << BigInt(256);
  const HALF = BigInt(1) << BigInt(255);
  return bn >= HALF ? bn - TWO_POW_256 : bn;
}

/** Convert a hex blockNumber from a log entry to a Date. */
function blockTsToDate(_blockHex: string, blockTimeSec: number, latestBlock: number, latestBlockTime: number): (b: string) => string {
  return (blockHex: string) => {
    const block = parseInt(blockHex, 16);
    const ageSec = (latestBlock - block) * blockTimeSec;
    const ts = (latestBlockTime - ageSec) * 1000;
    return new Date(ts).toISOString().slice(0, 10);
  };
}

async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Read the pool's token0 / token1 decimals so we can normalize amounts.
 * Returns [d0, d1]; defaults to [18, 18] on RPC failure.
 */
async function fetchTokenDecimals(
  network: ChainKey,
  token0: string,
  token1: string,
): Promise<[number, number]> {
  const [r0, r1] = await batchEthCall(network, [
    { to: token0, data: SEL.decimals },
    { to: token1, data: SEL.decimals },
  ]);
  const d0 = r0 ? Number(decodeUint(r0)) : 18;
  const d1 = r1 ? Number(decodeUint(r1)) : 18;
  return [
    Number.isFinite(d0) && d0 > 0 && d0 <= 30 ? d0 : 18,
    Number.isFinite(d1) && d1 > 0 && d1 <= 30 ? d1 : 18,
  ];
}

/**
 * Decode a Swap event into amounts and direction.
 *
 * Event data layout (non-indexed fields, packed in `log.data`):
 *   amount0       — int256 (32 bytes)
 *   amount1       — int256 (32 bytes)
 *   sqrtPriceX96  — uint160 (32 bytes, padded)
 *   liquidity     — uint128 (32 bytes, padded)
 *   tick          — int24 (32 bytes, padded)
 */
function decodeSwapEvent(
  log: LogEntry,
  d0: number,
  d1: number,
): { amount0: number; amount1: number; recipient: string } | null {
  const data = log.data?.replace(/^0x/, '') ?? '';
  if (data.length < 64 * 5) return null;
  const a0Hex = '0x' + data.slice(0, 64);
  const a1Hex = '0x' + data.slice(64, 128);
  const amount0Raw = decodeInt256(a0Hex);
  const amount1Raw = decodeInt256(a1Hex);
  const amount0 = Number(amount0Raw) / 10 ** d0;
  const amount1 = Number(amount1Raw) / 10 ** d1;
  // recipient is topics[2] (topic[0]=signature, [1]=sender, [2]=recipient)
  const recipient =
    log.topics.length >= 3 ? '0x' + log.topics[2].slice(-40) : '';
  return { amount0, amount1, recipient: recipient.toLowerCase() };
}

/**
 * Scan Swap events on a pool over the past N days, aggregate to UTC daily
 * buckets. Volume is computed from the USDC side (token0 here, but the
 * caller can swap which side is "USD" by the order they pass token0/token1).
 */
export async function scanPoolSwaps(opts: ScanSwapsOpts): Promise<SwapsSnapshot | null> {
  const {
    network,
    pool,
    token0,
    token1,
    lookbackDays = 90,
    blockTimeSec = 2,
    chunkSize = 9999,
    concurrency = 8,
  } = opts;

  const latest = await getLatestBlock(network);
  if (!latest) return null;

  const blocksBack = Math.ceil((lookbackDays * 86400) / blockTimeSec);
  const fromBlock = Math.max(0, latest - blocksBack);

  const [d0, d1] = await fetchTokenDecimals(network, token0, token1);

  // Slice the block range into chunks the RPC will accept.
  const chunks: Array<{ from: number; to: number }> = [];
  for (let start = fromBlock; start <= latest; start += chunkSize) {
    chunks.push({ from: start, to: Math.min(start + chunkSize - 1, latest) });
  }

  const logsByChunk = await parallelLimit(chunks, concurrency, (chunk) =>
    getLogs(
      network,
      {
        address: pool,
        topics: [SWAP_TOPIC],
        fromBlock: chunk.from,
        toBlock: chunk.to,
      },
      { retries: 3 },
    ),
  );

  // Resolve `now` once for block→date math.
  const latestBlockTime = Math.floor(Date.now() / 1000);
  const blockToDate = blockTsToDate('', blockTimeSec, latest, latestBlockTime);

  const byDay = new Map<
    string,
    {
      txCount: number;
      volumeUsd: number;
      usdcInUsd: number;
      usdcOutUsd: number;
      traders: Set<string>;
    }
  >();
  let failedChunks = 0;

  for (const logs of logsByChunk) {
    if (logs == null) {
      failedChunks += 1;
      continue;
    }
    for (const log of logs as LogEntry[]) {
      const decoded = decodeSwapEvent(log, d0, d1);
      if (!decoded) continue;
      const date = blockToDate(log.blockNumber);

      // Token0 is the "USD-side" by convention. Volume = absolute amount0
      // converted to USD (assumes 1 token0 ≈ $1 — fine for USDC/USDT pairs).
      const usdc = Math.abs(decoded.amount0);
      const isUsdcIn = decoded.amount0 > 0;
      const bucket = byDay.get(date) ?? {
        txCount: 0,
        volumeUsd: 0,
        usdcInUsd: 0,
        usdcOutUsd: 0,
        traders: new Set<string>(),
      };
      bucket.txCount += 1;
      bucket.volumeUsd += usdc;
      if (isUsdcIn) bucket.usdcInUsd += usdc;
      else bucket.usdcOutUsd += usdc;
      if (decoded.recipient) bucket.traders.add(decoded.recipient);
      byDay.set(date, bucket);
    }
  }

  const series: SwapDay[] = Array.from(byDay.entries())
    .map(([date, b]) => ({
      date,
      txCount: b.txCount,
      volumeUsd: b.volumeUsd,
      usdcInUsd: b.usdcInUsd,
      usdcOutUsd: b.usdcOutUsd,
      uniqueTraders: b.traders.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalVolumeUsd = series.reduce((s, d) => s + d.volumeUsd, 0);
  const totalTxCount = series.reduce((s, d) => s + d.txCount, 0);

  return {
    pool: pool.toLowerCase(),
    network,
    fromBlock,
    toBlock: latest,
    scannedChunks: chunks.length,
    failedChunks,
    series,
    totalVolumeUsd,
    totalTxCount,
    fetchedAt: Date.now(),
  };
}

/**
 * Avoid the "unused import" warning — formatTokenAmount stays exported for
 * future use (e.g., decoding the deSPXA side as a sanity check).
 */
export { formatTokenAmount };
