'use client';

/**
 * Bloomberg-style status ticker that lives at the top of every page.
 *
 * Pulls from /api/overview (already cached server-side) so it's effectively
 * free regardless of how many pages render it. Shown across all dashboard
 * routes via the dashboard layout.
 */

import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import type { OverviewData } from '@/lib/data/types';

async function fetchOverview(): Promise<OverviewData> {
  const res = await fetch('/api/overview');
  if (!res.ok) throw new Error('overview fetch failed');
  return res.json();
}

export function TickerBar() {
  const { data } = useQuery<OverviewData>({
    queryKey: ['overview'],
    queryFn: fetchOverview,
    staleTime: 5 * 60 * 1000,
  });

  if (!data) {
    return (
      <div className="ticker-bar">
        <span className="ticker-item">
          <span className="ticker-label">Loading…</span>
        </span>
      </div>
    );
  }

  const flow = data.totals.netFlows30dUsd;
  const flowClass = flow > 0 ? 'num-positive' : flow < 0 ? 'num-negative' : 'num-neutral';
  const flowSign = flow > 0 ? '+' : '';

  return (
    <div className="ticker-bar">
      <span className="ticker-item">
        <span className="ticker-label">Total RWA TVL</span>
        <span className="ticker-value">{formatCurrency(data.totals.tvlUsd)}</span>
      </span>
      <span className="ticker-item">
        <span className="ticker-label">Active Pools</span>
        <span className="ticker-value">{data.totals.activePools}</span>
      </span>
      <span className="ticker-item">
        <span className="ticker-label">Active Chains</span>
        <span className="ticker-value">{data.totals.activeChains}</span>
      </span>
      <span className="ticker-item">
        <span className="ticker-label">30D Net Flow</span>
        <span className={`ticker-value ${flowClass}`}>
          {flowSign}
          {formatCurrency(flow)}
        </span>
      </span>
      <span className="ticker-item">
        <span className="ticker-label">Treasuries</span>
        <span className="ticker-value">
          {formatCurrency(
            data.byAssetClass.find((c) => /treasury/i.test(c.class))?.tvlUsd ?? 0,
          )}
        </span>
      </span>
      <span className="ticker-item">
        <span className="ticker-label">CLO</span>
        <span className="ticker-value">
          {formatCurrency(
            data.byAssetClass.find((c) => /clo|aaa/i.test(c.class))?.tvlUsd ?? 0,
          )}
        </span>
      </span>
    </div>
  );
}
