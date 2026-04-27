/**
 * Aerodrome subgraph reader — fetches daily DEX volume from the
 * "Aerodrome Base Full" subgraph on The Graph Network.
 *
 * Subgraph: https://thegraph.com/explorer/subgraphs/GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM
 *
 * Replaces the on-chain Swap event scanner. The on-chain scan needs
 * ~130 chunked eth_getLogs calls (60-90s on Vercel Hobby) and
 * regularly times out. The subgraph returns the same data in a single
 * GraphQL query (~200ms).
 *
 * Auth: requires a free Graph Network API key. Set THEGRAPH_API_KEY
 * env var. Without it the function returns null and the page falls
 * back to whatever's already cached.
 */

import { swr } from '@/lib/sdk/kv-cache';

const SUBGRAPH_ID = 'GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM';

/** Build the gateway URL using the user's API key. */
function gatewayUrl(): string | null {
  const key = process.env.THEGRAPH_API_KEY;
  if (!key) return null;
  return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${SUBGRAPH_ID}`;
}

/** Daily aggregate for a single pool. Shape mirrors what we surfaced
 *  before, so the dex page doesn't need to change. */
export interface DailySwapAggregate {
  /** YYYY-MM-DD UTC. */
  date: string;
  /** Total $ volume traded that day. */
  volumeUsd: number;
  /** Number of swap transactions. */
  txCount: number;
}

export interface AerodromeSwapsSnapshot {
  pool: string;
  network: 'base';
  /** Daily series, oldest → newest. */
  series: DailySwapAggregate[];
  /** Sum of all daily volume in the series. */
  totalVolumeUsd: number;
  /** Sum of all swap counts in the series. */
  totalTxCount: number;
  /** Earliest timestamp covered by the series (unix seconds). */
  fromTs: number;
  /** Latest timestamp covered (unix seconds). */
  toTs: number;
  fetchedAt: number;
}

interface PoolDayDataRow {
  date: number; // unix seconds at midnight UTC
  volumeUSD: string;
  txCount: string;
}

interface PoolDayDataResponse {
  data?: {
    poolDayDatas?: PoolDayDataRow[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Canonical Uniswap V3 subgraph query — Aerodrome Slipstream is a V3
 * fork and the Aerodrome Base Full subgraph uses the standard V3 schema.
 *
 * Pattern: query the root-level `poolDayDatas` collection with a
 * `where` filter on pool ID. (Querying the nested `pool.poolDayData`
 * field doesn't accept `first`/`orderBy` args in this subgraph version.)
 */
const QUERY_POOL_DAY_DATA = `
  query PoolVolume($poolId: String!, $first: Int!) {
    poolDayDatas(
      where: { pool: $poolId }
      orderBy: date
      orderDirection: desc
      first: $first
    ) {
      date
      volumeUSD
      txCount
    }
  }
`;

function tsToDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

async function postQuery(
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<PoolDayDataResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Subgraph HTTP ${res.status}`);
    }
    return (await res.json()) as PoolDayDataResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read daily volume + tx count for a single Aerodrome pool, last `days`
 * days. Returns null when the API key is missing or both schema attempts
 * fail.
 *
 * Caches per (pool, days) for 30 minutes via the shared KV layer.
 */
export async function getAerodromeDailyVolume(
  pool: string,
  days = 90,
): Promise<AerodromeSwapsSnapshot | null> {
  const url = gatewayUrl();
  if (!url) {
    console.warn(
      '[aerodrome-subgraph] THEGRAPH_API_KEY not configured — returning null',
    );
    return null;
  }

  const cacheKey = `centrifuge:aerodrome-vol:${pool.toLowerCase()}:${days}`;
  const result = await swr<AerodromeSwapsSnapshot | null>(
    cacheKey,
    { freshTtlS: 1800, staleTtlS: 14_400 },
    async () => {
      const variables = { poolId: pool.toLowerCase(), first: days };

      const json = await postQuery(url, QUERY_POOL_DAY_DATA, variables).catch((err) => {
        console.warn('[aerodrome-subgraph] poolDayDatas query threw:', err);
        return null;
      });

      const dayData = json?.data?.poolDayDatas;
      if (!dayData || dayData.length === 0) {
        console.warn(
          `[aerodrome-subgraph] no poolDayDatas for pool ${pool}. errors:`,
          json?.errors,
        );
        return null;
      }

      const rows: DailySwapAggregate[] = dayData.map((r) => ({
        date: tsToDate(Number(r.date)),
        volumeUsd: Number(r.volumeUSD) || 0,
        txCount: Number(r.txCount) || 0,
      }));

      // Sort oldest → newest for chart consumption.
      rows.sort((a, b) => a.date.localeCompare(b.date));

      const totalVolumeUsd = rows.reduce((s, d) => s + d.volumeUsd, 0);
      const totalTxCount = rows.reduce((s, d) => s + d.txCount, 0);
      const firstTs = rows.length ? Date.parse(rows[0].date) / 1000 : 0;
      const lastTs = rows.length ? Date.parse(rows[rows.length - 1].date) / 1000 : 0;

      return {
        pool: pool.toLowerCase(),
        network: 'base',
        series: rows,
        totalVolumeUsd,
        totalTxCount,
        fromTs: firstTs,
        toTs: lastTs,
        fetchedAt: Date.now(),
      };
    },
  );

  return result.data;
}
