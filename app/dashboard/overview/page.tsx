'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import type { OverviewData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import DataQualityBadge from '@/components/ui/DataQualityBadge';
import { ChainStack } from '@/components/ui/ChainBadge';

/** Bright-theme chart palette — picked to read well on white. */
const CHART_COLORS = [
  '#2563EB', // blue-600
  '#16A34A', // green-600
  '#EA580C', // orange-600
  '#9333EA', // purple-600
  '#0891B2', // cyan-600
  '#DB2777', // pink-600
  '#4F46E5', // indigo-600
  '#CA8A04', // yellow-600
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function OverviewPage() {
  const overview = useQuery<OverviewData>({
    queryKey: ['overview'],
    queryFn: () => fetchJson<OverviewData>('/api/overview'),
  });

  if (overview.isError) {
    return (
      <ErrorState
        message={
          overview.error instanceof Error
            ? overview.error.message
            : 'Failed to load overview data.'
        }
        onRetry={() => overview.refetch()}
      />
    );
  }

  const data = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Total tokenized RWA on Centrifuge V3 — sourced directly from the protocol."
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {data?.dataQuality && <DataQualityBadge report={data.dataQuality} />}
          </div>
        }
      />

      {/* ─── Asset class composition (horizontal bars) + Top pools ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {data ? (
            <AssetClassBars
              data={data.byAssetClass}
              totalTvl={data.totals.tvlUsd}
              colors={CHART_COLORS}
            />
          ) : (
            <PanelSkeleton height="h-72" label="Asset Class Composition" />
          )}
        </div>

        <div className="lg:col-span-2">
          {data ? (
            <TuiPanel title="LARGEST POOLS" badge="By total value locked" noPadding>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>Symbol</th>
                      <th className="text-right">TVL</th>
                      <th>Chains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPools.map((p) => (
                      <tr key={p.id}>
                        <td style={{ maxWidth: 320 }}>
                          <span
                            className="truncate inline-block align-bottom"
                            style={{ maxWidth: 300 }}
                            title={p.name}
                          >
                            {p.name}
                          </span>
                        </td>
                        <td style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>
                          {p.symbol}
                        </td>
                        <td className="text-right" style={{ fontWeight: 600 }}>
                          {formatCurrency(p.tvlUsd)}
                        </td>
                        <td>
                          <ChainStack chains={p.chains} size={18} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TuiPanel>
          ) : (
            <PanelSkeleton height="h-72" label="Largest Pools" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bar chart for asset classes with pagination.
 *
 * Replaces the donut (which made small slices invisible) and paginates 5 per
 * page so the panel matches the height of the sibling Largest Pools table
 * instead of stretching to fit all 10 classes.
 */
const PAGE_SIZE = 5;

function AssetClassBars({
  data,
  totalTvl,
  colors,
}: {
  data: OverviewData['byAssetClass'];
  totalTvl: number;
  colors: string[];
}) {
  const [page, setPage] = useState(0);
  // Sort descending so the dominant class is always on page 1.
  const sorted = useMemo(() => [...data].sort((a, b) => b.tvlUsd - a.tvlUsd), [data]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Use the global max so bars are comparable across pages — not page-local.
  const maxValue = sorted[0]?.tvlUsd ?? 1;

  return (
    <div className="tui-panel">
      <div className="tui-panel-header">
        <div className="flex items-center gap-3">
          <span className="tui-panel-title">Asset Class Composition</span>
          <span className="tui-panel-badge">{data.length} classes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="time-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={{ opacity: safePage === 0 ? 0.4 : 1 }}
            aria-label="Previous page"
          >
            ‹
          </button>
          <button
            type="button"
            className="time-btn"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            style={{ opacity: safePage === totalPages - 1 ? 0.4 : 1 }}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        {pageRows.map((c, i) => {
          const globalIdx = safePage * PAGE_SIZE + i;
          const pct = totalTvl > 0 ? (c.tvlUsd / totalTvl) * 100 : 0;
          const widthPct = (c.tvlUsd / maxValue) * 100;
          return (
            <div key={c.class} className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span
                  className="truncate flex-1 mr-3"
                  style={{ color: 'var(--foreground)', fontWeight: 500 }}
                  title={c.class}
                >
                  {c.class}
                </span>
                <div className="flex items-baseline gap-2 flex-shrink-0">
                  <span style={{ fontWeight: 700 }}>{formatCurrency(c.tvlUsd)}</span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      minWidth: 36,
                      textAlign: 'right',
                    }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div
                className="h-1.5 rounded-sm overflow-hidden"
                style={{ background: 'var(--border)' }}
              >
                <div
                  style={{
                    width: `${Math.max(widthPct, 0.5)}%`,
                    height: '100%',
                    background: colors[globalIdx % colors.length],
                    borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
