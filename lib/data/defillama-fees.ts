/**
 * DefiLlama fees & revenue endpoint for Centrifuge.
 *
 * Surfaced ALONGSIDE the official Centrifuge "daily pool yield" series —
 * not as a replacement. The two answer different questions:
 *
 *   - Centrifuge GraphQL: "how much value did pools generate" (yield + fees,
 *     not isolatable from official data)
 *   - DefiLlama: "how much fee revenue did the protocol take" (their best
 *     estimate; computed via heuristics on NAV deltas + known fee rates)
 *
 * Showing both lets the reader see (a) the gross value the pools threw off
 * and (b) what DefiLlama thinks the protocol actually captured. The gap
 * between them is the asset-side yield that flowed to investors.
 *
 * Endpoint: https://api.llama.fi/summary/fees/centrifuge
 * Docs: https://defillama.com/docs/api
 */

export interface RevenuePoint {
  /** YYYY-MM-DD UTC. */
  date: string;
  revenueUsd: number;
}

export interface DefiLlamaRevenueData {
  series: RevenuePoint[];
  total24hUsd: number | null;
  total7dUsd: number | null;
  total30dUsd: number | null;
  totalAllTimeUsd: number | null;
  source: 'defillama';
  fetchedAt: number;
}

interface LlamaFeesResponse {
  total24h?: number;
  total7d?: number;
  total30d?: number;
  totalAllTime?: number;
  // Protocol-level overall daily totals — [unixSeconds, usd][].
  totalDataChart?: Array<[number, number]>;
}

/**
 * Convert a unix-seconds timestamp to UTC YYYY-MM-DD.
 * DefiLlama's `totalDataChart` uses seconds at midnight UTC.
 */
function tsToDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/**
 * Fetch Centrifuge's daily revenue from DefiLlama. Returns null on error
 * so the caller can fall back gracefully without breaking the page.
 *
 * The `dataType=dailyRevenue` query param scopes the response to revenue
 * (the cut Centrifuge protocol takes) rather than total fees (which would
 * include manager fees that flow to issuers).
 */
export async function getCentrifugeDailyRevenue(): Promise<DefiLlamaRevenueData | null> {
  const url = 'https://api.llama.fi/summary/fees/centrifuge?dataType=dailyRevenue';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as LlamaFeesResponse;

    const series: RevenuePoint[] = (json.totalDataChart ?? [])
      .filter((row) => Array.isArray(row) && row.length === 2)
      .map(([ts, usd]) => ({
        date: tsToDate(ts),
        revenueUsd: Number(usd) || 0,
      }))
      // Sort ascending in case the API ever flips order.
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      series,
      total24hUsd: json.total24h ?? null,
      total7dUsd: json.total7d ?? null,
      total30dUsd: json.total30d ?? null,
      totalAllTimeUsd: json.totalAllTime ?? null,
      source: 'defillama',
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.error('[defillama-fees] fetch failed', err);
    return null;
  }
}
