/**
 * GeckoTerminal OHLCV fetcher — used SOLELY for validating our on-chain
 * Swap event scan. Not the primary source.
 *
 * GeckoTerminal returns OHLC + volume per timeframe for any DEX pool they
 * track. We use the daily timeframe to compare against our own on-chain
 * volume aggregation. If the two agree, the on-chain reader is working.
 * If they disagree, either we have a decoding bug or GeckoTerminal is
 * stale — and the chart can show a divergence indicator either way.
 *
 * Endpoint: https://api.geckoterminal.com/api/v2/networks/{net}/pools/{addr}/ohlcv/{timeframe}
 */

export interface OhlcvDay {
  /** YYYY-MM-DD UTC. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Daily $ volume as reported by GeckoTerminal. */
  volumeUsd: number;
}

export interface GeckoOhlcvSnapshot {
  pool: string;
  network: string;
  series: OhlcvDay[];
  totalVolumeUsd: number;
  source: 'geckoterminal';
  fetchedAt: number;
}

/**
 * Fetch daily OHLCV for a pool. Returns null on any failure so the caller
 * can fall back to on-chain-only.
 *
 * @param network  GeckoTerminal network slug, e.g. 'base'
 * @param pool     Pool contract address
 * @param days     Lookback in days. GT caps this at ~6 months for free tier.
 */
export async function getPoolOhlcv(
  network: string,
  pool: string,
  days = 90,
): Promise<GeckoOhlcvSnapshot | null> {
  // Daily aggregate, cap at 365 days (GT max for the day timeframe).
  const limit = Math.min(Math.max(days, 1), 365);
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool.toLowerCase()}/ohlcv/day?aggregate=1&limit=${limit}&currency=usd`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json;version=20230302' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();

    // GeckoTerminal payload shape:
    //   data.attributes.ohlcv_list = [[ts, open, high, low, close, volume], ...]
    const list: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
    if (!Array.isArray(list)) return null;

    const series: OhlcvDay[] = list
      .filter((row) => Array.isArray(row) && row.length >= 6)
      .map(([ts, open, high, low, close, volume]) => ({
        date: new Date((ts ?? 0) * 1000).toISOString().slice(0, 10),
        open: Number(open) || 0,
        high: Number(high) || 0,
        low: Number(low) || 0,
        close: Number(close) || 0,
        volumeUsd: Number(volume) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      pool: pool.toLowerCase(),
      network,
      series,
      totalVolumeUsd: series.reduce((s, d) => s + d.volumeUsd, 0),
      source: 'geckoterminal',
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.error('[geckoterminal-ohlcv] fetch failed', err);
    return null;
  }
}

/**
 * Compare two volume series (on-chain vs. GeckoTerminal) and return a
 * divergence summary. Used to power a small "data quality" indicator on
 * the dex page so users can see whether the two sources agree.
 */
export interface VolumeReconciliation {
  /** Total volume per source over the overlap window. */
  onchainTotalUsd: number;
  geckoTotalUsd: number;
  /** |onchain − gecko| / max(onchain, gecko). 0 = perfect agreement. */
  divergence: number;
  /** Number of days that appear in both series. */
  overlapDays: number;
  /** 'ok' if within 5%, 'minor' under 15%, 'major' beyond. */
  level: 'ok' | 'minor' | 'major' | 'no-overlap';
  message: string;
}

export function reconcileVolumes(
  onchain: Array<{ date: string; volumeUsd: number }>,
  gecko: Array<{ date: string; volumeUsd: number }>,
): VolumeReconciliation {
  const ocByDate = new Map(onchain.map((d) => [d.date, d.volumeUsd]));
  const gtByDate = new Map(gecko.map((d) => [d.date, d.volumeUsd]));
  const overlap = [...ocByDate.keys()].filter((d) => gtByDate.has(d));
  if (overlap.length === 0) {
    return {
      onchainTotalUsd: 0,
      geckoTotalUsd: 0,
      divergence: 0,
      overlapDays: 0,
      level: 'no-overlap',
      message: 'No overlapping days between on-chain scan and GeckoTerminal — cannot validate.',
    };
  }
  const onchainTotalUsd = overlap.reduce((s, d) => s + (ocByDate.get(d) ?? 0), 0);
  const geckoTotalUsd = overlap.reduce((s, d) => s + (gtByDate.get(d) ?? 0), 0);
  const bigger = Math.max(onchainTotalUsd, geckoTotalUsd);
  const divergence = bigger > 0 ? Math.abs(onchainTotalUsd - geckoTotalUsd) / bigger : 0;

  let level: VolumeReconciliation['level'];
  let message: string;
  const pct = (divergence * 100).toFixed(1);
  if (divergence <= 0.05) {
    level = 'ok';
    message = `On-chain ($${onchainTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}) and GeckoTerminal ($${geckoTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}) agree within ${pct}% over ${overlap.length} overlapping days.`;
  } else if (divergence <= 0.15) {
    level = 'minor';
    message = `On-chain and GeckoTerminal differ by ${pct}% over ${overlap.length} days. Likely cause: GeckoTerminal aggregation lag or routing through paths the pool's Swap event doesn't capture.`;
  } else {
    level = 'major';
    message = `On-chain ($${onchainTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}) and GeckoTerminal ($${geckoTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}) differ by ${pct}% over ${overlap.length} days — investigate the on-chain decoder or check for stale GT data.`;
  }
  return {
    onchainTotalUsd,
    geckoTotalUsd,
    divergence,
    overlapDays: overlap.length,
    level,
    message,
  };
}
