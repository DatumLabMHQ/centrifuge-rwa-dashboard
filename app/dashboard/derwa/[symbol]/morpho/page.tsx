'use client';

/**
 * Morpho lending market sub-page — the definitive view of deSPXA as
 * collateral on Morpho Blue.
 *
 * Sections:
 *  1. Status strip (one-line market summary)
 *  2. Three-column: Lenders | Borrowers | Market Health
 *  3. IRM curve chart (the signature visualization)
 *  4. Historical charts (supply+borrow, utilization, APY)
 *  5. Risk analysis (collateral, liquidation, oracle, bad debt)
 *  6. Market parameters (compact bottom table)
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import { formatAddress } from '@/lib/sdk/helpers';
import type { DerwaDetailData, MorphoMarketData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { PanelSkeleton } from '@/components/PanelSkeleton';

async function fetchDetail(symbol: string): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=365`);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

function fmtTs(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

function fmtTsFull(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 4,
  fontSize: 11,
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

export default function MorphoSubPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params?.symbol ?? '';

  const detail = useQuery<DerwaDetailData>({
    queryKey: ['derwa-detail', symbol, 365],
    queryFn: () => fetchDetail(symbol),
    enabled: !!symbol,
  });

  if (detail.isError) {
    return <ErrorState message="Failed to load Morpho data." onRetry={() => detail.refetch()} />;
  }

  const m = detail.data?.morpho;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link href={`/dashboard/derwa/${symbol}`} style={{ color: 'var(--accent-orange)' }} className="hover:underline">← {symbol}</Link>
        <span>·</span>
        <span>Morpho Market</span>
      </div>

      <PageHeader
        title="Morpho Lending Market"
        subtitle={
          m
            ? `${m.collateralSymbol} / ${m.loanSymbol} · Base · Created ${new Date(m.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'Loading…'
        }
      />

      {!m ? (
        <PanelSkeleton height="h-96" label="Loading Morpho market" />
      ) : (
        <>
          {/* ─── Section 1: Status strip ─── */}
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 rounded-lg text-[11px]"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <Stat label="Market Size" value={formatCurrency(m.sizeUsd)} />
            <Stat label="Total Liquidity" value={formatCurrency(m.totalLiquidityUsd)} />
            <Stat label="Direct Supply" value={formatCurrency(m.supplyUsd)} />
            <Stat label="Borrow" value={formatCurrency(m.borrowUsd)} />
            <Stat label="Utilization" value={`${(m.utilization * 100).toFixed(1)}%`} color={m.utilization > 0.9 ? 'red' : m.utilization > 0.7 ? 'yellow' : 'green'} />
            <Stat label="Collateral" value={formatCurrency(m.collateralUsd)} />
          </div>

          {/* ─── Section 2: Compact metrics grid ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CompactMetric label="Supply APY" value={`${(m.supplyApy * 100).toFixed(2)}%`} color="green" sub={`Earn on ${m.loanSymbol}`} />
            <CompactMetric label="Borrow APY" value={`${(m.borrowApy * 100).toFixed(2)}%`} color="red" sub={`Cost against ${m.collateralSymbol}`} />
            <CompactMetric label="Collateral Ratio" value={`${(m.collateralRatio * 100).toFixed(0)}%`} color={m.collateralRatio > 1.5 ? 'green' : 'yellow'} sub={`${formatCurrency(m.collateralUsd)} locked`} />
            <CompactMetric label="Liquidation Buffer" value={`${(m.distanceToLiquidation * 100).toFixed(0)}%`} color={m.distanceToLiquidation > 0.3 ? 'green' : 'yellow'} sub={`S&P must drop ~${(m.distanceToLiquidation * 100).toFixed(0)}%`} />
            <CompactMetric label="LLTV" value={`${(m.lltv * 100).toFixed(0)}%`} sub="Max borrow ratio" />
            <CompactMetric label="Bad Debt" value={m.badDebtUsd > 0 ? formatCurrency(m.badDebtUsd) : '$0'} color={m.badDebtUsd === 0 ? 'green' : 'red'} sub="Lifetime" />
            <CompactMetric label="Oracle" value={m.oracleType.replace('OracleV2', ' V2')} sub={`±${(m.dailyPriceVariation * 100).toFixed(2)}%/day`} />
            <CompactMetric label="Available" value={formatCurrency(m.liquidityUsd)} sub={`of ${formatCurrency(m.supplyUsd)} direct`} />
          </div>

          {/* ─── Section 3: IRM Curve + APY History (side by side) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {m.irmCurve.length > 0 && (
              <ChartPanel title="INTEREST RATE MODEL" badge="Rates vs utilization" height="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={m.irmCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="utilization"
                      tick={{ fontSize: 9, fill: '#64748B' }}
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      stroke="#CBD5E1"
                      tickMargin={6}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#64748B' }}
                      tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                      stroke="#CBD5E1"
                      width={48}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`}
                      labelFormatter={(v) => `Utilization: ${(Number(v) * 100).toFixed(0)}%`}
                      labelStyle={{ fontWeight: 700 }}
                    />
                    <ReferenceLine
                      x={m.utilization}
                      stroke="var(--accent-orange)"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{ value: 'NOW', position: 'top', fontSize: 10, fill: '#EA580C', fontWeight: 700 }}
                    />
                    <Line type="monotone" dataKey="supplyApy" name="Supply APY" stroke="#16A34A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="borrowApy" name="Borrow APY" stroke="#DC2626" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            )}

            {m.historicalSupplyApy.length > 2 && (
              <ChartPanel title="APY HISTORY" badge="Supply (green) vs Borrow (red)" height="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={fmtTs} stroke="#CBD5E1" tickMargin={6} minTickGap={30} allowDuplicatedCategory={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} stroke="#CBD5E1" width={48} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => fmtTsFull(Number(v))} formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`} />
                    <Line data={m.historicalSupplyApy} type="monotone" dataKey="y" name="Supply APY" stroke="#16A34A" strokeWidth={1.5} dot={false} />
                    <Line data={m.historicalBorrowApy} type="monotone" dataKey="y" name="Borrow APY" stroke="#DC2626" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            )}
          </div>

          {/* ─── Section 4: Supply/Borrow + Utilization (side by side) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {m.historicalSupplyUsd.length > 2 && (
              <ChartPanel title="SUPPLY & BORROW" badge={`${m.historicalSupplyUsd.length} data points`} height="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSupply" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16A34A" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradBorrow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={fmtTs} stroke="#CBD5E1" tickMargin={6} minTickGap={30} allowDuplicatedCategory={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => formatCurrency(v)} stroke="#CBD5E1" width={60} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => fmtTsFull(Number(v))} formatter={(v) => formatCurrency(Number(v))} />
                    <Area data={m.historicalSupplyUsd} type="monotone" dataKey="y" name="Supply" stroke="#16A34A" fill="url(#gradSupply)" strokeWidth={1.5} />
                    <Area data={m.historicalBorrowUsd} type="monotone" dataKey="y" name="Borrow" stroke="#DC2626" fill="url(#gradBorrow)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
            )}

            {m.historicalUtilization.length > 2 && (
              <ChartPanel title="UTILIZATION" badge="90% = danger zone" height="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.historicalUtilization} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradUtil" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EA580C" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#EA580C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={fmtTs} stroke="#CBD5E1" tickMargin={6} minTickGap={30} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke="#CBD5E1" width={45} domain={[0, 1]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => fmtTsFull(Number(v))} formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
                    <ReferenceLine y={0.9} stroke="var(--accent-red)" strokeDasharray="4 4" label={{ value: '90%', position: 'right', fontSize: 9, fill: '#DC2626' }} />
                    <Area type="monotone" dataKey="y" name="Utilization" stroke="#EA580C" fill="url(#gradUtil)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
            )}
          </div>

          {/* ─── Section 5: Market parameters ─── */}
          <TuiPanel title="MARKET PARAMETERS" noPadding>
            <div className="overflow-x-auto">
              <table className="data-table">
                <tbody>
                  <ParamRow label="Collateral" value={m.collateralSymbol} sub={formatAddress(m.collateralAddress)} />
                  <ParamRow label="Loan Asset" value={m.loanSymbol} sub={`${formatAddress(m.loanAddress)} · Base`} />
                  <ParamRow label="Liquidation LTV" value={`${(m.lltv * 100).toFixed(0)}%`} sub="Max borrow-to-collateral before liquidation" />
                  <ParamRow label="Protocol Fee" value={m.fee > 0 ? `${(m.fee * 100).toFixed(2)}%` : 'None'} />
                  <ParamRow label="Oracle" value={m.oracleType} sub={formatAddress(m.oracleAddress)} />
                  <ParamRow label="Daily Price Move" value={`±${(m.dailyPriceVariation * 100).toFixed(2)}%`} sub="Collateral price volatility" />
                  <ParamRow label="Market ID" value={formatAddress(m.marketId)} mono />
                </tbody>
              </table>
            </div>
          </TuiPanel>

        </>
      )}
    </div>
  );
}

/* ─── Helper components ─── */

function Stat({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' | 'yellow' }) {
  const clr = color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : color === 'yellow' ? 'var(--accent-yellow)' : undefined;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-bold" style={{ color: clr }}>{value}</span>
    </span>
  );
}

function CompactMetric({ label, value, sub, color }: { label: string; value: string; sub: string; color?: 'green' | 'red' | 'yellow' }) {
  const clr = color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : color === 'yellow' ? 'var(--accent-yellow)' : undefined;
  return (
    <div className="rounded px-3 py-2.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[16px] font-bold mt-0.5" style={{ color: clr, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

function ParamRow({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>{label}</td>
      <td>
        <span className={mono ? 'font-mono' : ''} style={{ fontWeight: 700 }}>{value}</span>
        {sub && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </td>
    </tr>
  );
}
