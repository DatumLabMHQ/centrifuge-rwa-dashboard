/**
 * DefiLlama Yields API — fetches live pool stats for DEX integrations.
 *
 * This replaces GeckoTerminal for Aerodrome pool data because:
 *  1. GeckoTerminal doesn't index the active CL50 pool
 *  2. DefiLlama has TVL, APY (base + reward breakdown), and daily volume
 *  3. The APY breakdown is decision-grade data (shows how much is organic
 *     vs incentivized)
 *
 * Endpoint: https://yields.llama.fi/pools
 * Public API, no key. Returns ALL pools (~15K), so we cache aggressively
 * and filter client-side by pool ID.
 */

export interface DefiLlamaPool {
  poolId: string;
  symbol: string;
  project: string;
  chain: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  volumeUsd1d: number | null;
  volumeUsd7d: number | null;
}

let cachedPools: DefiLlamaPool[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchAllPools(): Promise<DefiLlamaPool[]> {
  if (cachedPools.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedPools;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://yields.llama.fi/pools', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return cachedPools;

    const json = await res.json();
    const raw = json?.data ?? [];
    cachedPools = raw.map((p: Record<string, unknown>) => ({
      poolId: String(p.pool ?? ''),
      symbol: String(p.symbol ?? ''),
      project: String(p.project ?? ''),
      chain: String(p.chain ?? ''),
      tvlUsd: Number(p.tvlUsd ?? 0),
      apy: Number(p.apy ?? 0),
      apyBase: p.apyBase != null ? Number(p.apyBase) : null,
      apyReward: p.apyReward != null ? Number(p.apyReward) : null,
      volumeUsd1d: p.volumeUsd1d != null ? Number(p.volumeUsd1d) : null,
      volumeUsd7d: p.volumeUsd7d != null ? Number(p.volumeUsd7d) : null,
    }));
    cacheTimestamp = Date.now();
    return cachedPools;
  } catch {
    return cachedPools;
  }
}

/**
 * Get a specific pool by its DefiLlama pool ID.
 * Returns null if the pool is not found.
 */
export async function getDefiLlamaPool(
  poolId: string,
): Promise<DefiLlamaPool | null> {
  const pools = await fetchAllPools();
  return pools.find((p) => p.poolId === poolId) ?? null;
}
