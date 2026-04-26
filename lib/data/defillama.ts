/**
 * DefiLlama Centrifuge data — used for historical TVL by chain and as an
 * independent cross-check against the GraphQL totals.
 *
 * Endpoint: https://api.llama.fi/protocol/centrifuge
 * Updates ~hourly. No auth required.
 */

import type { TvlHistoryData } from '@/lib/data/types';

interface DefiLlamaTokensInUsdEntry {
  date: number;
  tokens: Record<string, number>;
}

interface DefiLlamaChainTvl {
  tvl?: Array<{ date: number; totalLiquidityUSD: number }>;
  tokensInUsd?: DefiLlamaTokensInUsdEntry[];
}

interface DefiLlamaResponse {
  currentChainTvls: Record<string, number>;
  chainTvls: Record<string, DefiLlamaChainTvl>;
}

const URL =
  process.env.DEFILLAMA_PROTOCOL_URL ?? 'https://api.llama.fi/protocol/centrifuge';

/**
 * Fetch the full DefiLlama protocol payload, then collapse it into the
 * shape our Overview page actually consumes — current chain TVLs plus a
 * compact daily series for the stacked-area chart.
 */
export async function getCentrifugeTvlHistory(): Promise<TvlHistoryData> {
  const res = await fetch(URL, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`DefiLlama responded ${res.status}`);
  }
  const json = (await res.json()) as DefiLlamaResponse;

  // DefiLlama's `chainTvls` mixes real chain entries (`Ethereum`, `Base`)
  // with protocol-level pseudo-categories (`borrowed`, `staking`, `pool2`,
  // `treasury`, `ownTokens`) and chain-scoped variants (`Ethereum-borrowed`).
  // We only want real chain entries on this chart.
  const PSEUDO_KEYS = new Set([
    'borrowed',
    'staking',
    'pool2',
    'treasury',
    'ownTokens',
    'offers',
    'vesting',
  ]);
  const realChainKeys = Object.keys(json.chainTvls ?? {}).filter(
    (k) => !k.includes('-') && !k.includes(' ') && !PSEUDO_KEYS.has(k),
  );

  // Build a date → { chain → tvl } map from each chain's daily tvl array.
  const byDate = new Map<number, Record<string, number>>();
  for (const chain of realChainKeys) {
    const series = json.chainTvls[chain]?.tvl ?? [];
    for (const point of series) {
      if (!byDate.has(point.date)) byDate.set(point.date, {});
      byDate.get(point.date)![chain] = point.totalLiquidityUSD;
    }
  }

  // Sort by date and limit to last ~365 days to keep the payload small.
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => a - b);
  const cutoff = sortedDates[sortedDates.length - 1] - 365 * 24 * 60 * 60;
  const series = sortedDates
    .filter((d) => d >= cutoff)
    .map((d) => {
      const byChain = byDate.get(d)!;
      const total = Object.values(byChain).reduce((s, v) => s + v, 0);
      return {
        date: new Date(d * 1000).toISOString().slice(0, 10),
        total,
        byChain,
      };
    });

  const currentChainTvls: Record<string, number> = {};
  for (const k of Object.keys(json.currentChainTvls ?? {})) {
    if (k.includes('-') || k.includes(' ') || PSEUDO_KEYS.has(k)) continue;
    const v = json.currentChainTvls[k];
    if (typeof v === 'number') currentChainTvls[k] = v;
  }
  const totalTvlUsd = Object.values(currentChainTvls).reduce((s, v) => s + v, 0);

  return {
    totalTvlUsd,
    currentChainTvls,
    series,
    lastUpdated: new Date().toISOString(),
  };
}
