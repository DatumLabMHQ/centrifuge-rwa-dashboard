/**
 * Daily Pool Yield aggregator — derived from official Centrifuge data.
 *
 * Sources (all from api.centrifuge.io GraphQL):
 *   - tokenSnapshots → per-token historical totalIssuance + tokenPrice
 *   - investorTransactions → deposits/redemptions/transfers per day
 *
 * Compute:
 *   For each day t in the window:
 *     navUsd[t]  = Σ(tokens) issuance(token, t) × price(token, t)
 *     flow[t]    = Σ(transactions on day t) (deposits − redemptions)
 *     yield[t]   = (navUsd[t] − navUsd[t−1]) − flow[t]
 *
 * In English: "how much did Centrifuge's pools grow today, after backing
 * out money that investors put in or pulled out." Yield + management fees
 * combined — we don't try to isolate the protocol's fee cut, because that
 * would require either hardcoded fee rates or DefiLlama. Honest label:
 * "Daily Pool Yield (NAV growth net of flows)."
 */

import type { InvestorTransaction, Pool, Token } from './types';
import { DEPOSIT_TYPES, REDEEM_TYPES } from './types';
import type { TokenSnapshot } from './centrifuge';

/** A single day's value in the yield series. */
export interface YieldPoint {
  /** YYYY-MM-DD UTC. */
  date: string;
  /** Total NAV across all tracked pools at the close of this day. */
  navUsd: number;
  /** Net deposits − redemptions during this day. */
  netFlowUsd: number;
  /** NAV delta from previous day, minus net flows. Equals "yield + fees".
   *  Noisy day-to-day because NAV updates can lag investor flows by 1-2
   *  days — the noise cancels within a rolling week. Use cumulativeYieldUsd
   *  for a smoother view of the underlying trend. */
  yieldUsd: number;
  /** Running sum of yieldUsd from the start of the window. The slope of
   *  this series is the headline APY — it averages out the daily noise. */
  cumulativeYieldUsd: number;
  /** 7-day trailing rolling sum of yieldUsd. The "smooth" daily view.
   *  Use this as the chart series instead of yieldUsd for less noise. */
  yieldUsd7dRolling: number;
}

export interface ProtocolYieldData {
  series: YieldPoint[];
  /** Sum of yieldUsd over the last 7 days of the series. */
  totalYield7d: number;
  /** Sum over last 30 days. */
  totalYield30d: number;
  /** Sum over the full window. */
  totalYieldWindow: number;
  /** Total NAV at the end of the window. */
  endingNavUsd: number;
  /** Annualized yield rate, computed from the 30d window. */
  apyPct: number;
  source: 'centrifuge-graphql';
  windowDays: number;
}

export interface TokenSnapshotBundle {
  tokenId: string;
  decimals: number;
  snapshots: TokenSnapshot[];
}

export interface ComputeYieldInput {
  /** Per-token historical snapshots (totalIssuance + tokenPrice over time). */
  snapshots: TokenSnapshotBundle[];
  /** All recent investor transactions (filtered & summed inside). */
  transactions: InvestorTransaction[];
  /** Look-back window in days. */
  windowDays: number;
}

/* ─── helpers ─── */

function bn(value: string | null | undefined, decimals: number): number {
  if (!value || value === '0') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** decimals;
}

/** Convert epoch (seconds, milliseconds, or ISO) to UTC YYYY-MM-DD. */
function dayKey(rawTs: string | number): string {
  let ms: number;
  if (typeof rawTs === 'number') {
    ms = rawTs > 1e12 ? rawTs : rawTs * 1000;
  } else if (/^\d+$/.test(rawTs)) {
    const n = Number(rawTs);
    ms = n > 1e12 ? n : n * 1000;
  } else {
    ms = Date.parse(rawTs);
  }
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** Generate sorted YYYY-MM-DD dates between [start, end] inclusive. */
function generateDateRange(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  const oneDay = 86_400_000;
  for (let t = startMs; t <= endMs; t += oneDay) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/* ─── core ─── */

/**
 * For one token, return a map of YYYY-MM-DD → TVL on that day. We pick
 * the LAST snapshot of each day (close of day). Days with no snapshot are
 * left missing — the caller carries forward the prior day's value.
 */
function buildDailyTvlForToken(bundle: TokenSnapshotBundle): Map<string, number> {
  const byDay = new Map<string, { ts: number; tvl: number }>();
  for (const snap of bundle.snapshots) {
    const date = dayKey(snap.timestamp);
    if (!date) continue;
    const issuance = bn(snap.totalIssuance, bundle.decimals);
    const priceUsd = bn(snap.tokenPrice, 18);
    const tvl = issuance * priceUsd;
    const ts = Date.parse(snap.timestamp.includes('T') ? snap.timestamp : new Date(Number(snap.timestamp) * 1000).toISOString());
    const existing = byDay.get(date);
    if (!existing || ts > existing.ts) byDay.set(date, { ts, tvl });
  }
  const out = new Map<string, number>();
  for (const [date, v] of byDay.entries()) out.set(date, v.tvl);
  return out;
}

/**
 * For the full window, produce a NAV-by-day map. Sums per-token TVLs
 * with carry-forward — if token X has no snapshot on day Y, we use its
 * last-known value rather than dropping it from the total.
 */
function buildAggregateNavByDay(
  bundles: TokenSnapshotBundle[],
  dateRange: string[],
): Map<string, number> {
  const perToken = bundles.map((b) => buildDailyTvlForToken(b));
  const result = new Map<string, number>();
  // Last-known TVL per token, carried forward across days.
  const lastSeen = new Array(bundles.length).fill(0);
  for (const date of dateRange) {
    let total = 0;
    perToken.forEach((dayMap, i) => {
      const v = dayMap.get(date);
      if (v != null && Number.isFinite(v) && v > 0) lastSeen[i] = v;
      total += lastSeen[i];
    });
    result.set(date, total);
  }
  return result;
}

/** Compute net deposit-minus-redeem in USD, bucketed by UTC day. */
function buildFlowByDay(
  transactions: InvestorTransaction[],
  tokenInfo: Map<string, { decimals: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const tx of transactions) {
    const date = dayKey(tx.createdAt);
    if (!date) continue;
    const info = tokenInfo.get(tx.tokenId);
    if (!info) continue;
    const tokens = bn(tx.tokenAmount, info.decimals);
    const price = bn(tx.tokenPrice, 18);
    const valueUsd = tokens * price;
    if (!Number.isFinite(valueUsd) || valueUsd === 0) continue;
    let signed = 0;
    if (DEPOSIT_TYPES.includes(tx.type)) signed = valueUsd;
    else if (REDEEM_TYPES.includes(tx.type)) signed = -valueUsd;
    if (signed === 0) continue;
    out.set(date, (out.get(date) ?? 0) + signed);
  }
  return out;
}

/**
 * Validity guards for the yield calculation:
 *
 *  - `MIN_NAV_USD` — below this we don't trust the aggregate (history is
 *    still bootstrapping). The indexer only emits a tokenSnapshot when
 *    something happens, so before each pool's first snapshot its TVL
 *    looks like $0 in our roll-up. Treating a day with $0 prior NAV and
 *    $1.5B current NAV as "yield" would produce nonsense.
 *
 *  - `MAX_DAY_RATIO` — if today's NAV is more than 2× yesterday's, that's
 *    almost certainly a data event (a new pool's snapshots came online),
 *    not real yield. We mark these days as invalid and zero out the
 *    yieldUsd for them so they don't poison the totals or APY.
 */
const MIN_NAV_USD = 100_000_000; // $100M floor
const MAX_DAY_RATIO = 2.0;

/**
 * Top-level: build the yield series.
 *
 * The first day of the window is the "baseline" — its yield is undefined
 * because there's no prior NAV to delta from. We include it in the series
 * with yieldUsd: 0 so the chart x-axis stays aligned, but exclude it from
 * the totals.
 */
export function computeProtocolYield(input: ComputeYieldInput): ProtocolYieldData {
  const { snapshots, transactions, windowDays } = input;

  const endMs = Date.now();
  // Pad start by one day so we have a baseline NAV to delta against.
  const startMs = endMs - (windowDays + 1) * 86_400_000;
  const dateRange = generateDateRange(startMs, endMs);

  const navByDay = buildAggregateNavByDay(snapshots, dateRange);

  const tokenInfo = new Map<string, { decimals: number }>();
  for (const b of snapshots) tokenInfo.set(b.tokenId, { decimals: b.decimals });
  const flowByDay = buildFlowByDay(transactions, tokenInfo);

  // Pass 1: compute raw daily yieldUsd with validity guards.
  type RawDay = { date: string; navUsd: number; netFlowUsd: number; yieldUsd: number };
  const raw: RawDay[] = [];
  let prevNav: number | null = null;
  for (const date of dateRange) {
    const nav = navByDay.get(date) ?? 0;
    const flow = flowByDay.get(date) ?? 0;

    let yieldUsd = 0;
    if (
      prevNav != null &&
      prevNav >= MIN_NAV_USD &&
      nav >= MIN_NAV_USD
    ) {
      const ratio = nav / prevNav;
      const inverseRatio = prevNav / nav;
      if (ratio <= MAX_DAY_RATIO && inverseRatio <= MAX_DAY_RATIO) {
        yieldUsd = nav - prevNav - flow;
      }
    }
    raw.push({ date, navUsd: nav, netFlowUsd: flow, yieldUsd });
    prevNav = nav;
  }

  // Drop the leading baseline day from the public series.
  const trimmedRaw = raw.slice(1);

  // Pass 2: enrich each day with cumulative + rolling-7-day yield. These
  // give the chart something usable to render, since raw daily yield is
  // dominated by NAV-vs-flow timing noise that averages out within a week.
  const series: YieldPoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < trimmedRaw.length; i += 1) {
    const day = trimmedRaw[i];
    cumulative += day.yieldUsd;
    const windowStart = Math.max(0, i - 6);
    const rolling = trimmedRaw
      .slice(windowStart, i + 1)
      .reduce((s, d) => s + d.yieldUsd, 0);
    series.push({
      ...day,
      cumulativeYieldUsd: cumulative,
      yieldUsd7dRolling: rolling,
    });
  }

  const sum = (n: number) =>
    series.slice(-n).reduce((s, p) => s + p.yieldUsd, 0);
  const totalYield7d = sum(7);
  const totalYield30d = sum(30);
  const totalYieldWindow = series.reduce((s, p) => s + p.yieldUsd, 0);

  const endingNavUsd = series.length ? series[series.length - 1].navUsd : 0;

  // Annualize APY from the LATEST 7-day rolling yield. Why not the 30-day
  // total: the 30-day window often contains one-sided NAV-vs-flow timing
  // noise that hasn't fully canceled out yet (e.g., a +$95M day on day -15
  // whose offsetting -$95M day fell outside the window). The trailing 7d
  // rolling is recent enough that its noise has had time to cancel within
  // the same window.
  let apyPct = 0;
  if (endingNavUsd > 0 && series.length > 0) {
    const last = series[series.length - 1];
    const recent7dYield = last.yieldUsd7dRolling;
    const raw = (recent7dYield / endingNavUsd) * (365 / 7) * 100;
    // Sanity ceiling — RWA portfolios can't realistically yield > 50%/yr.
    apyPct = Math.abs(raw) <= 50 ? raw : 0;
  }

  return {
    series,
    totalYield7d,
    totalYield30d,
    totalYieldWindow,
    endingNavUsd,
    apyPct,
    source: 'centrifuge-graphql',
    windowDays,
  };
}

/**
 * Convenience: pick the primary tracked token per pool. We use whichever
 * token is active and has the largest current totalIssuance — the wrapper
 * tokens (deRWA) don't have their own indexer-side issuance numbers
 * separate from the underlying token, but the institutional tokens do.
 */
export function pickPrimaryToken(pool: Pool): Token | null {
  const candidates = pool.tokens.items.filter((t) => t.isActive);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, t) => {
    const a = Number(t.totalIssuance ?? 0);
    const b = Number(best.totalIssuance ?? 0);
    return a > b ? t : best;
  }, candidates[0]);
}
