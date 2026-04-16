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
        subtitle={dex ? `Aerodrome ${symbol} / USDC pool on ${dex.network}` : 'Loading market data…'}
      />

      {!w ? (
        <PanelSkeleton height="h-72" label="DEX Market" />
      ) : !dex ? (
        <TuiPanel title="NO DEX DATA">
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            No live DEX integration with a known pool address for {symbol} yet.
          </div>
        </TuiPanel>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="DEX Price" value={dex.priceUsd != null ? `$${dex.priceUsd.toFixed(4)}` : '—'} sub="Last trade price" />
            <MetricTile label="NAV" value={`$${w.navUsd.toFixed(4)}`} sub="Centrifuge oracle price" />
            <MetricTile
              label="Premium / Discount"
              value={dex.premiumPct != null ? `${dex.premiumPct >= 0 ? '+' : ''}${dex.premiumPct.toFixed(2)}%` : '—'}
              sub={dex.premiumPct != null ? (dex.premiumPct >= 0 ? 'Trading above NAV' : 'Trading below NAV') : 'No trades'}
              color={dex.premiumPct == null ? undefined : dex.premiumPct > 0 ? 'green' : 'red'}
            />
            <MetricTile label="24h Volume" value={formatCurrency(dex.volume24hUsd)} sub="Trading volume" />
          </div>

          {/* Liquidity + pool details */}
          <TuiPanel title="POOL DETAILS" noPadding>
            <div className="overflow-x-auto">
              <table className="data-table">
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)', width: 200 }}>Pool</td>
                    <td>deSPXA / USDC 0.3% (Concentrated Liquidity)</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>DEX</td>
                    <td>Aerodrome (SlipStream)</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Chain</td>
                    <td><span className={`chain-badge ${dex.network}`}>{dex.network}</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Liquidity</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(dex.liquidityUsd)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Pool Address</td>
                    <td className="font-mono">{formatAddress(dex.address)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TuiPanel>

          {/* Context */}
          {dex.liquidityUsd < 1000 && (
            <div
              className="rounded-lg p-4 text-[11px]"
              style={{ background: 'var(--accent-red-soft)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)' }}
            >
              <strong>Low liquidity warning:</strong> This pool has {formatCurrency(dex.liquidityUsd)} in reserves.
              The premium/discount vs NAV ({dex.premiumPct?.toFixed(2)}%) is not actionable — any
              trade would move the price significantly. Wait for more liquidity before using this
              pool for price discovery.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricTile({
  label, value, sub, color,
}: {
  label: string; value: string; sub: string;
  color?: 'green' | 'red';
}) {
  const clr = color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : undefined;
  return (
    <div className="rounded p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="counter-label">{label}</div>
      <div className="text-[22px] font-bold" style={{ color: clr, lineHeight: 1.2 }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
