'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ErrorState,
  TuiPanel,
} from '@datumlabs/dashboard-kit';
import { formatCurrency } from '@/lib/format';
import type { OverviewData, TvlHistoryData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import { TimeSlicer, type TimeRange } from '@/components/TimeSlicer';

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

const RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
};

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a `YYYY-MM-DD` date string for the X-axis based on the active range.
 * - 365D → "MMM 'YY" (e.g. "Apr '25")
 * - 90D / 30D → "MMM D" (e.g. "Apr 7")
 * - 7D → "MMM D"
 */
function formatXAxisDate(date: string, range: TimeRange): string {
  if (!date || date.length < 10) return date;
  const year = date.slice(2, 4); // last 2 digits
  const monthIdx = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const month = SHORT_MONTHS[monthIdx] ?? '';
  if (range === '365D') return `${month} '${year}`;
  return `${month} ${day}`;
}

/** Pick a tick interval that targets ~10 visible ticks regardless of range. */
function pickTickInterval(seriesLength: number): number {
  if (seriesLength <= 12) return 0;
  return Math.max(0, Math.floor(seriesLength / 10) - 1);
}

/** Format the tooltip date label as a long form: "Apr 7, 2025". */
function formatTooltipDate(date: string): string {
  if (!date || date.length < 10) return date;
  const year = date.slice(0, 4);
  const monthIdx = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const month = SHORT_MONTHS[monthIdx] ?? '';
  return `${month} ${day}, ${year}`;
}

export default function OverviewPage() {
  const [range, setRange] = useState<TimeRange>('365D');
  const [hiddenChains, setHiddenChains] = useState<Set<string>>(new Set());

  const overview = useQuery<OverviewData>({
    queryKey: ['overview'],
    queryFn: () => fetchJson<OverviewData>('/api/overview'),
  });

  const tvlHistory = useQuery<TvlHistoryData>({
    queryKey: ['tvl-history'],
    queryFn: () => fetchJson<TvlHistoryData>('/api/tvl-history'),
  });

  const slicedSeries = useMemo(() => {
    if (!tvlHistory.data) return [];
    const days = RANGE_DAYS[range];
    return tvlHistory.data.series.slice(-days);
  }, [tvlHistory.data, range]);

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
  const history = tvlHistory.data;

  const crossCheck =
    data && history && history.totalTvlUsd > 0
      ? ((data.totals.tvlUsd - history.totalTvlUsd) / history.totalTvlUsd) * 100
      : null;

  // Top N chains by current TVL, ignoring chains with zero TVL.
  // (Centrifuge V3 has spokes deployed on Monad / HyperEVM that don't yet
  // hold any value — DefiLlama still lists them, but they're noise here.)
  const topChainKeys = Object.entries(history?.currentChainTvls ?? {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([k]) => k);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Total tokenized RWA on Centrifuge V3 — live across 9 chains."
        right={
          crossCheck !== null && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-semibold"
              style={{
                background: 'var(--accent-green-soft)',
                color: 'var(--accent-green)',
              }}
            >
              <span>VERIFIED vs DEFILLAMA</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {crossCheck >= 0 ? '+' : ''}
                {crossCheck.toFixed(2)}%
              </span>
            </div>
          )
        }
      />

      {/* ─── TVL by Chain history ─── */}
      {!history || slicedSeries.length === 0 ? (
        <PanelSkeleton height="h-80" label="TVL by Chain" />
      ) : (
        <ChartPanel
          title="TVL BY CHAIN"
          badge={`DefiLlama · ${range.toLowerCase()}`}
          height="h-80"
          right={<TimeSlicer value={range} onChange={setRange} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={slicedSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                {topChainKeys.map((chain, i) => (
                  <linearGradient
                    key={chain}
                    id={`grad-${chain}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickFormatter={(d: string) => formatXAxisDate(d, range)}
                stroke="#CBD5E1"
                interval={pickTickInterval(slicedSeries.length)}
                tickMargin={8}
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                stroke="#CBD5E1"
                width={70}
              />
              <Tooltip
                content={<TvlByChainTooltip />}
              />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                iconSize={9}
                wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                onClick={(e) => {
                  const name = String(e.dataKey ?? '').replace(/^byChain\./, '');
                  setHiddenChains((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  });
                }}
                formatter={(value: string) => {
                  const name = value.replace(/^byChain\./, '');
                  const isHidden = hiddenChains.has(name);
                  return (
                    <span
                      style={{
                        color: isHidden ? '#94A3B8' : '#0F172A',
                        textDecoration: isHidden ? 'line-through' : 'none',
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {name}
                    </span>
                  );
                }}
              />
              {topChainKeys.map((chain, i) => (
                <Area
                  key={chain}
                  type="monotone"
                  dataKey={`byChain.${chain}`}
                  name={chain}
                  stackId="1"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={`url(#grad-${chain})`}
                  strokeWidth={1.75}
                  hide={hiddenChains.has(chain)}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

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
                          <div className="flex flex-wrap gap-1">
                            {p.chains.map((c) => (
                              <span key={c} className={`chain-badge ${c}`}>
                                {c}
                              </span>
                            ))}
                          </div>
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
 * Custom tooltip for the TVL-by-chain area chart. Shows each chain's value
 * (sorted descending) and a total at the bottom. Uses the same date format
 * as `formatTooltipDate` so the header reads "Apr 7, 2026".
 */
interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}
function TvlByChainTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = sorted.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 4,
        fontSize: 11,
        padding: '10px 12px',
        boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
        minWidth: 160,
      }}
    >
      <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 6 }}>
        {label ? formatTooltipDate(String(label)) : ''}
      </div>
      {sorted.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '2px 0',
            color: '#0F172A',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(Number(p.value ?? 0))}
          </span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          padding: '6px 0 0',
          marginTop: 4,
          borderTop: '1px solid #E2E8F0',
          color: '#0F172A',
          fontWeight: 700,
        }}
      >
        <span>Total</span>
        <span style={{ color: '#EA580C', fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(total)}
        </span>
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
