'use client';

/**
 * deRWA wrapper detail page — focused on answering 3 questions:
 *   1. "What is this?" — hero metrics (TVL, wrap ratio, holders, premium)
 *   2. "Should I care?" — TVL trajectory chart + DeFi Activity Card
 *   3. "Show me details" — links to /morpho, /holders, /dex sub-pages
 *
 * Everything else (top 25 holders, recent activity, full DEX panel, full
 * Morpho panel) lives on dedicated sub-pages so this page fits in one
 * viewport and has a clear reading path.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState } from '@/components/sdk';
import { formatCurrency, formatCurrencySigned } from '@/lib/format';
import type { DerwaDetailData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import { TimeSlicer, type TimeRange } from '@/components/TimeSlicer';

const RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
};

async function fetchDetail(symbol: string, days: number): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function DerwaDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params?.symbol ?? '';
  const [range, setRange] = useState<TimeRange>('365D');
  const days = RANGE_DAYS[range];

  const detail = useQuery<DerwaDetailData>({
    queryKey: ['derwa-detail', symbol, days],
    queryFn: () => fetchDetail(symbol, days),
    enabled: !!symbol,
  });

  if (detail.isError) {
    return (
      <ErrorState
        message={detail.error instanceof Error ? detail.error.message : 'Failed to load wrapper.'}
        onRetry={() => detail.refetch()}
      />
    );
  }

  const data = detail.data;
  const w = data?.wrapper;
  const morpho = data?.morpho;

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link
          href="/dashboard/derwa"
          style={{ color: 'var(--accent-orange)' }}
          className="hover:underline"
        >
          ← deRWA Composability
        </Link>
      </div>

      {/* ─── Section 1: Hero ─── */}
      <PageHeader
        title={symbol}
        subtitle={
          w
            ? `${w.name} · wraps ${w.instSymbol} · ${w.manager}`
            : 'Loading…'
        }
        right={<TimeSlicer value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroTile label="TVL" value={w ? formatCurrency(w.tvlUsd) : '—'} sub={w ? `NAV $${w.navUsd.toFixed(4)}` : ''} />
        <HeroTile
          label="Wrap Ratio"
          value={w?.wrapRatio != null ? `${(w.wrapRatio * 100).toFixed(1)}%` : '—'}
          sub={w?.instTvlUsd != null ? `of ${formatCurrency(w.instTvlUsd)} ${w.instSymbol}` : ''}
          color="orange"
        />
        <HeroTile
          label="Holders"
          value={w ? String(w.holderCount) : '—'}
          sub="Distinct wallets"
          href={`/dashboard/derwa/${symbol}/holders`}
        />
        <HeroTile
          label={`${range} Flow`}
          value={w ? formatCurrencySigned(w.flowUsd) : '—'}
          sub="Net deposits − redemptions"
          color={w && w.flowUsd > 0 ? 'green' : w && w.flowUsd < 0 ? 'red' : undefined}
        />
      </div>

      {/* ─── Wrap ratio bar (compact) ─── */}
      {w?.wrapRatio != null && (
        <div
          className="flex items-center gap-4 p-4 rounded"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)', minWidth: 80 }}>
            WRAP RATIO
          </span>
          <div
            style={{
              flex: 1,
              height: 10,
              background: 'var(--border)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, w.wrapRatio * 100)}%`,
                height: '100%',
                background: 'var(--accent-orange)',
              }}
            />
          </div>
          <span className="text-[12px] font-bold" style={{ color: 'var(--accent-orange)', minWidth: 70, textAlign: 'right' }}>
            {(w.wrapRatio * 100).toFixed(2)}%
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)', minWidth: 140 }}>
            {formatCurrency(w.tvlUsd)} of {formatCurrency(w.instTvlUsd ?? 0)}
          </span>
        </div>
      )}

      {/* ─── Section 2: TVL trajectory ─── */}
      {!w ? (
        <PanelSkeleton height="h-72" label="TVL trajectory" />
      ) : w.sparkline.length < 2 ? null : (
        <ChartPanel
          title="TVL TRAJECTORY"
          badge={`${w.sparkline.length} snapshots over ${range.toLowerCase()}`}
          height="h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={w.sparkline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA580C" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#EA580C" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickFormatter={(v: number) => {
                  const d = new Date(v);
                  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
                }}
                stroke="#CBD5E1"
                tickMargin={8}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                stroke="#CBD5E1"
                width={70}
              />
              <RechartsTooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 4,
                  fontSize: 11,
                  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                formatter={(v) => [formatCurrency(Number(v)), 'TVL']}
              />
              <Area type="monotone" dataKey="tvl" stroke="#EA580C" strokeWidth={2} fill="url(#tvlGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* ─── Section 3: DeFi Activity Card ─── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel-header)', borderBottom: '1px solid var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-orange)' }}>
            DeFi Activity
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {data?.integrations.filter(i => i.status === 'live').length ?? 0} live integrations
          </span>
        </div>

        {/* Morpho row */}
        {morpho ? (
          <Link
            href={`/dashboard/derwa/${symbol}/morpho`}
            className="flex items-center justify-between px-4 py-3 hover:bg-[var(--card-hover)] transition-colors"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <IntegrationBadge kind="lending" />
              <div>
                <div className="text-[12px] font-bold">Morpho</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  deSPXA collateral · USDC lending
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-[11px]">
              <div className="text-right">
                <div className="font-bold">{formatCurrency(morpho.supplyUsd)}</div>
                <div style={{ color: 'var(--text-muted)' }}>supply</div>
              </div>
              <div className="text-right">
                <div className="font-bold" style={{ color: morpho.utilization > 0.9 ? 'var(--accent-red)' : 'var(--foreground)' }}>
                  {(morpho.utilization * 100).toFixed(1)}%
                </div>
                <div style={{ color: 'var(--text-muted)' }}>util</div>
              </div>
              <div className="text-right">
                <div className="font-bold num-positive">{(morpho.supplyApy * 100).toFixed(2)}%</div>
                <div style={{ color: 'var(--text-muted)' }}>supply APY</div>
              </div>
              <StatusPill status="live" />
              <span style={{ color: 'var(--text-muted)' }}>›</span>
            </div>
          </Link>
        ) : data && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <IntegrationBadge kind="lending" />
              <div>
                <div className="text-[12px] font-bold">Morpho</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No live market data</div>
              </div>
            </div>
            <StatusPill status={data.integrations.find(i => i.protocol === 'Morpho')?.status ?? 'planned'} />
          </div>
        )}

        {/* DEX row */}
        {w?.dex ? (
          <Link
            href={`/dashboard/derwa/${symbol}/dex`}
            className="flex items-center justify-between px-4 py-3 hover:bg-[var(--card-hover)] transition-colors"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <IntegrationBadge kind="dex" />
              <div>
                <div className="text-[12px] font-bold">Aerodrome</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {w.dex.symbol} · {w.dex.network}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-[11px]">
              <div className="text-right">
                <div className="font-bold">{formatCurrency(w.dex.tvlUsd)}</div>
                <div style={{ color: 'var(--text-muted)' }}>TVL</div>
              </div>
              <div className="text-right">
                <div className="font-bold num-positive">{w.dex.apy.toFixed(2)}%</div>
                <div style={{ color: 'var(--text-muted)' }}>APY</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{w.dex.volume1dUsd != null ? formatCurrency(w.dex.volume1dUsd) : '—'}</div>
                <div style={{ color: 'var(--text-muted)' }}>24h vol</div>
              </div>
              <StatusPill status="live" />
              <span style={{ color: 'var(--text-muted)' }}>›</span>
            </div>
          </Link>
        ) : null}

        {/* Oracle rows */}
        {data?.integrations.filter(i => i.kind === 'oracle').map((i, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <IntegrationBadge kind="oracle" />
              <div>
                <div className="text-[12px] font-bold">{i.protocol}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{i.chain}</div>
              </div>
            </div>
            <StatusPill status={i.status} />
          </div>
        ))}

        {/* Euler row */}
        {data?.integrations.filter(i => i.protocol === 'Euler').map((i, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <IntegrationBadge kind="lending" />
              <div>
                <div className="text-[12px] font-bold">{i.protocol}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{i.chain}</div>
              </div>
            </div>
            <StatusPill status={i.status} />
          </div>
        ))}
      </div>

      {/* ─── Quick links to sub-pages ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SubPageLink
          href={`/dashboard/derwa/${symbol}/holders`}
          title="Top Holders"
          sub={w ? `${w.holderCount} wallets · per-chain breakdown` : 'Loading…'}
        />
        <SubPageLink
          href={`/dashboard/derwa/${symbol}/morpho`}
          title="Morpho Market"
          sub={morpho ? `${(morpho.utilization * 100).toFixed(0)}% util · ${(morpho.supplyApy * 100).toFixed(2)}% APY` : 'View lending data'}
        />
        <SubPageLink
          href={`/dashboard/derwa/${symbol}/dex`}
          title="DEX & Pricing"
          sub={w?.dex ? `${w.dex.premiumPct != null ? `${w.dex.premiumPct.toFixed(2)}% premium` : 'No trades'} · Aerodrome` : 'View market data'}
        />
      </div>
    </div>
  );
}

/* ─── Compact helper components ─── */

function HeroTile({
  label, value, sub, color, href,
}: {
  label: string; value: string; sub: string;
  color?: 'orange' | 'green' | 'red';
  href?: string;
}) {
  const clr = color === 'orange' ? 'var(--accent-orange)' : color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : undefined;
  const inner = (
    <div className="rounded p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <div className="counter-label">{label}</div>
      <div className="text-[22px] font-bold" style={{ color: clr, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
  if (href) return <Link href={href} className="hover:opacity-80 transition-opacity">{inner}</Link>;
  return inner;
}

function IntegrationBadge({ kind }: { kind: string }) {
  const colors: Record<string, string> = {
    lending: '#9333EA',
    dex: '#2563EB',
    oracle: '#CA8A04',
    wallet: '#64748B',
  };
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded text-[9px] font-bold text-white uppercase"
      style={{ background: colors[kind] ?? '#64748B' }}
    >
      {kind.slice(0, 3)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    live: { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)' },
    announced: { bg: 'rgba(202,138,4,0.1)', color: 'var(--accent-yellow)' },
    planned: { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-muted)' },
  };
  const s = styles[status] ?? styles.planned;
  return (
    <span
      className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  );
}

function SubPageLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-4 rounded hover:bg-[var(--card-hover)] transition-colors"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div>
        <div className="text-[12px] font-bold">{title}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <span className="text-[14px] font-bold" style={{ color: 'var(--accent-orange)' }}>›</span>
    </Link>
  );
}
