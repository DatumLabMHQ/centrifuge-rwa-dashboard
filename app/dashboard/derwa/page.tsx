'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency, formatCurrencySigned } from '@/lib/format';
import type { DerwaData, DerwaWrapperRow } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import { TimeSlicer, type TimeRange } from '@/components/TimeSlicer';

const RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
};

async function fetchDerwa(days: number): Promise<DerwaData> {
  const res = await fetch(`/api/derwa?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

type SortKey = 'tvlUsd' | 'wrapRatio' | 'holderCount' | 'flowUsd';

export default function DerwaPage() {
  const router = useRouter();
  const [range, setRange] = useState<TimeRange>('365D');
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const days = RANGE_DAYS[range];

  const derwa = useQuery<DerwaData>({
    queryKey: ['derwa', days],
    queryFn: () => fetchDerwa(days),
  });

  if (derwa.isError) {
    return (
      <ErrorState
        message={derwa.error instanceof Error ? derwa.error.message : 'Failed to load deRWA data.'}
        onRetry={() => derwa.refetch()}
      />
    );
  }

  const data = derwa.data;
  const wrappers = useMemo(() => {
    const list = data?.wrappers ?? [];
    const sorted = [...list].sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number;
      const bv = (b[sortKey] ?? 0) as number;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return sorted;
  }, [data, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  return (
    <div className="space-y-6">
      <PageHeader
        title="deRWA Composability"
        subtitle={
          data
            ? `${data.wrappers.length} freely-transferable wrappers · ${formatCurrency(data.totalDerwaTvl)} total · ${(data.totalWrapRatio * 100).toFixed(2)}% of underlying institutional pools`
            : 'Loading wrapper data…'
        }
        right={<TimeSlicer value={range} onChange={setRange} />}
      />

      {/* ─── Page-level summary tiles ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="deRWA TVL"
          value={data ? formatCurrency(data.totalDerwaTvl) : '—'}
          subtitle="Sum of all wrapper supplies"
        />
        <SummaryTile
          label="Institutional TVL"
          value={data ? formatCurrency(data.totalInstTvl) : '—'}
          subtitle="The non-wrapped pool sizes"
        />
        <SummaryTile
          label="Wrap Ratio"
          value={data ? `${(data.totalWrapRatio * 100).toFixed(2)}%` : '—'}
          subtitle="Wrapped / institutional"
          colorClass="text-orange"
        />
        <SummaryTile
          label="Top Holders"
          value={data ? String(data.totalHolders) : '—'}
          subtitle="Distinct wallets in top 5 of any wrapper"
        />
      </div>

      {/* ─── Comparison table ─── */}
      {!data ? (
        <PanelSkeleton height="h-72" label="Wrapper Comparison" />
      ) : (
        <TuiPanel title="WRAPPER COMPARISON" badge={`Sorted by ${sortKey}`} noPadding>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Wrapper</th>
                  <th
                    className="text-right"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSort('tvlUsd')}
                  >
                    TVL{arrow('tvlUsd')}
                  </th>
                  <th
                    className="text-right"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSort('wrapRatio')}
                  >
                    Wrap Ratio{arrow('wrapRatio')}
                  </th>
                  <th
                    className="text-right"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSort('holderCount')}
                  >
                    Holders{arrow('holderCount')}
                  </th>
                  <th
                    className="text-right"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSort('flowUsd')}
                  >
                    {range} Flow{arrow('flowUsd')}
                  </th>
                  <th className="text-right">DEX Vol 24h</th>
                  <th className="text-right">Premium</th>
                  <th>Trend ({range.toLowerCase()})</th>
                </tr>
              </thead>
              <tbody>
                {wrappers.map((w) => (
                  <ComparisonRow
                    key={w.symbol}
                    w={w}
                    range={range}
                    onClick={() => router.push(`/dashboard/derwa/${w.symbol}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TuiPanel>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  subtitle,
  colorClass,
}: {
  label: string;
  value: string;
  subtitle: string;
  colorClass?: string;
}) {
  return (
    <div
      className="rounded p-5"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div className="counter-label">{label}</div>
      <div
        className="counter-value"
        style={{ color: colorClass === 'text-orange' ? 'var(--accent-orange)' : undefined }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  );
}

function ComparisonRow({
  w,
  range,
  onClick,
}: {
  w: DerwaWrapperRow;
  range: TimeRange;
  onClick: () => void;
}) {
  void range; // currently unused but kept for future per-row range hints
  const flowClass =
    w.flowUsd > 0 ? 'num-positive' : w.flowUsd < 0 ? 'num-negative' : 'num-neutral';
  const premiumClass =
    w.dex?.premiumPct == null
      ? 'num-neutral'
      : w.dex.premiumPct > 0
        ? 'num-positive'
        : w.dex.premiumPct < 0
          ? 'num-negative'
          : 'num-neutral';

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onClick}>
      <td>
        <span style={{ color: 'var(--accent-orange)', marginRight: 6, fontWeight: 700 }}>›</span>
        <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{w.symbol}</span>
        <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          wraps {w.instSymbol}
        </span>
      </td>
      <td className="text-right" style={{ fontWeight: 700 }}>
        {formatCurrency(w.tvlUsd)}
      </td>
      <td className="text-right">
        {w.wrapRatio == null ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : (
          <WrapRatioCell ratio={w.wrapRatio} />
        )}
      </td>
      <td className="text-right">{w.holderCount}</td>
      <td className={`text-right ${flowClass}`}>
        {w.flowUsd === 0 ? '—' : formatCurrencySigned(w.flowUsd)}
      </td>
      <td className="text-right">
        {w.dex ? (
          w.dex.volume1dUsd != null ? formatCurrency(w.dex.volume1dUsd) : '—'
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className={`text-right ${premiumClass}`}>
        {w.dex?.premiumPct == null ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : (
          `${w.dex.premiumPct >= 0 ? '+' : ''}${w.dex.premiumPct.toFixed(2)}%`
        )}
      </td>
      <td style={{ width: 140, padding: '6px 14px' }}>
        <Sparkline points={w.sparkline} />
      </td>
    </tr>
  );
}

/** Compact horizontal bar showing wrap ratio inline in the table cell. */
function WrapRatioCell({ ratio }: { ratio: number }) {
  const pct = ratio * 100;
  return (
    <div className="flex items-center gap-2 justify-end">
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(2)}%
      </span>
      <div
        style={{
          width: 60,
          height: 6,
          background: 'var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, pct)}%`,
            height: '100%',
            background: 'var(--accent-orange)',
          }}
        />
      </div>
    </div>
  );
}

/** Tiny inline sparkline for the comparison table cell. */
function Sparkline({ points }: { points: Array<{ t: number; tvl: number }> }) {
  if (points.length < 2) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>n/a</span>;
  }
  const first = points[0].tvl;
  const last = points[points.length - 1].tvl;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const stroke = change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  return (
    <div style={{ width: '100%', height: 32 }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${stroke}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="95%" stopColor={stroke} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="tvl"
            stroke={stroke}
            fill={`url(#spark-${stroke})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <RechartsTooltip
            content={() => null}
            cursor={{ stroke: 'var(--border-bright)', strokeWidth: 1 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

