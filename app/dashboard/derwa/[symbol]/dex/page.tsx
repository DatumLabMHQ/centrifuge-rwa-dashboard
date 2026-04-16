'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import { formatAddress } from '@/lib/sdk/helpers';
import type { DerwaDetailData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { PanelSkeleton } from '@/components/PanelSkeleton';

async function fetchDetail(symbol: string): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=365`);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function DexSubPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params?.symbol ?? '';

  const detail = useQuery<DerwaDetailData>({
    queryKey: ['derwa-detail', symbol, 365],
    queryFn: () => fetchDetail(symbol),
    enabled: !!symbol,
  });

  if (detail.isError) {
    return <ErrorState message="Failed to load DEX data." onRetry={() => detail.refetch()} />;
  }

  const w = detail.data?.wrapper;
  const dex = w?.dex;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link href={`/dashboard/derwa/${symbol}`} style={{ color: 'var(--accent-orange)' }} className="hover:underline">
          ← {symbol}
        </Link>
        <span>·</span>
        <span>DEX & Pricing</span>
      </div>

      <PageHeader
        title="DEX & Pricing"
        subtitle={dex ? `${dex.project} · ${dex.symbol} · ${dex.network}` : 'Loading market data…'}
      />

      {!w ? (
        <PanelSkeleton height="h-72" label="DEX Market" />
      ) : !dex ? (
        <TuiPanel title="NO DEX DATA">
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            No live DEX integration with tracked pool data for {symbol} yet.
          </div>
        </TuiPanel>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="Pool TVL" value={formatCurrency(dex.tvlUsd)} sub="Total value locked" />
            <MetricTile label="Total APY" value={`${dex.apy.toFixed(2)}%`} color="green" sub="Combined yield" />
            <MetricTile label="24h Volume" value={dex.volume1dUsd != null ? formatCurrency(dex.volume1dUsd) : '—'} sub="Trading volume" />
            <MetricTile label="7d Volume" value={dex.volume7dUsd != null ? formatCurrency(dex.volume7dUsd) : '—'} sub="Weekly volume" />
          </div>

          {/* APY breakdown */}
          <TuiPanel title="APY BREAKDOWN" badge="Where the yield comes from">
            <div className="px-4 pb-4 pt-2 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="counter-label">Total APY</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-green)' }}>
                    {dex.apy.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="counter-label">Base (Trading Fees)</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {dex.apyBase != null ? `${dex.apyBase.toFixed(2)}%` : '—'}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Organic yield from swap fees
                  </div>
                </div>
                <div>
                  <div className="counter-label">Reward (AERO Incentives)</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)' }}>
                    {dex.apyReward != null ? `${dex.apyReward.toFixed(2)}%` : '—'}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Aerodrome token emissions
                  </div>
                </div>
              </div>

              {/* Yield composition bar */}
              {dex.apyBase != null && dex.apyReward != null && dex.apy > 0 && (
                <div>
                  <div className="flex rounded overflow-hidden" style={{ height: 12 }}>
                    <div
                      style={{
                        width: `${(dex.apyBase / dex.apy) * 100}%`,
                        background: 'var(--foreground)',
                      }}
                    />
                    <div
                      style={{
                        width: `${(dex.apyReward / dex.apy) * 100}%`,
                        background: 'var(--accent-blue)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    <span>Trading fees: {((dex.apyBase / dex.apy) * 100).toFixed(1)}%</span>
                    <span>AERO rewards: {((dex.apyReward / dex.apy) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {dex.apyReward != null && dex.apyBase != null && dex.apyReward > dex.apyBase * 5 && (
                <div
                  className="rounded p-3 text-[11px]"
                  style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}
                >
                  <strong>Note:</strong> {((dex.apyReward / dex.apy) * 100).toFixed(0)}% of this
                  APY comes from AERO incentive emissions, not organic trading fees. If Aerodrome
                  reduces or ends emissions to this pool, the effective yield would drop to
                  ~{dex.apyBase.toFixed(2)}%.
                </div>
              )}
            </div>
          </TuiPanel>

          {/* Pool details */}
          <TuiPanel title="POOL DETAILS" noPadding>
            <div className="overflow-x-auto">
              <table className="data-table">
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>Pool</td>
                    <td>{dex.symbol}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>DEX</td>
                    <td>{dex.project} (SlipStream CL50)</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Chain</td>
                    <td><span className={`chain-badge ${dex.network}`}>{dex.network}</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Pool Address</td>
                    <td className="font-mono">{formatAddress(dex.address)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Data Source</td>
                    <td>DefiLlama Yields API</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TuiPanel>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: 'green' }) {
  return (
    <div className="rounded px-3 py-2.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[16px] font-bold mt-0.5" style={{ color: color === 'green' ? 'var(--accent-green)' : undefined, lineHeight: 1.2 }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
