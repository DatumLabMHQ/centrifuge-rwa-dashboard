'use client';

/**
 * Morpho lending market sub-page — shows the full lending data for a deRWA
 * wrapper that's live on Morpho. Supply, borrow, utilization, APY, LLTV,
 * and a direct link to the market.
 */

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

  const morpho = detail.data?.morpho;
  const w = detail.data?.wrapper;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link href={`/dashboard/derwa/${symbol}`} style={{ color: 'var(--accent-orange)' }} className="hover:underline">
          ← {symbol}
        </Link>
        <span>·</span>
        <span>Morpho Lending Market</span>
      </div>

      <PageHeader
        title="Morpho Market"
        subtitle={
          morpho
            ? `${morpho.collateralSymbol} collateral · ${morpho.loanSymbol} lending · Base`
            : 'Loading Morpho market data…'
        }
      />

      {!morpho ? (
        <PanelSkeleton height="h-96" label="Morpho Market" />
      ) : (
        <>
          {/* ─── Key metrics ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Total Supply" value={formatCurrency(morpho.supplyUsd)} sub={`${morpho.loanSymbol} deposited by lenders`} />
            <MetricTile label="Total Borrow" value={formatCurrency(morpho.borrowUsd)} sub={`Borrowed against ${morpho.collateralSymbol}`} />
            <MetricTile
              label="Utilization"
              value={`${(morpho.utilization * 100).toFixed(1)}%`}
              sub={morpho.utilization > 0.9 ? 'Very high — near capacity' : morpho.utilization > 0.7 ? 'Moderate utilization' : 'Healthy'}
              color={morpho.utilization > 0.9 ? 'red' : morpho.utilization > 0.7 ? 'yellow' : 'green'}
            />
            <MetricTile
              label="Available"
              value={formatCurrency(morpho.supplyUsd - morpho.borrowUsd)}
              sub="Remaining capacity for borrowers"
            />
          </div>

          {/* ─── APY cards ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--accent-green-soft)', border: '1px solid var(--accent-green)' }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent-green)' }}>
                Supply APY — What Lenders Earn
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-green)', lineHeight: 1.1 }}>
                {(morpho.supplyApy * 100).toFixed(2)}%
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--accent-green)' }}>
                Deposit {morpho.loanSymbol} into this market and earn yield from borrowers
                who collateralize with {morpho.collateralSymbol} (tokenized S&P 500 exposure).
              </div>
            </div>
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--accent-red-soft)', border: '1px solid var(--accent-red)' }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent-red)' }}>
                Borrow APY — What Borrowers Pay
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-red)', lineHeight: 1.1 }}>
                {(morpho.borrowApy * 100).toFixed(2)}%
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--accent-red)' }}>
                Lock {morpho.collateralSymbol} as collateral and borrow {morpho.loanSymbol} at this
                rate. Max LTV of {(morpho.lltv * 100).toFixed(0)}% before liquidation.
              </div>
            </div>
          </div>

          {/* ─── Market parameters ─── */}
          <TuiPanel title="MARKET PARAMETERS" noPadding>
            <div className="overflow-x-auto">
              <table className="data-table">
                <tbody>
                  <ParamRow label="Collateral Asset" value={morpho.collateralSymbol} sub={w ? formatAddress(w.chains[0]?.address ?? '') : ''} />
                  <ParamRow label="Loan Asset" value={morpho.loanSymbol} sub="USDC on Base" />
                  <ParamRow label="Liquidation LTV" value={`${(morpho.lltv * 100).toFixed(0)}%`} sub="Max borrow-to-collateral ratio before liquidation" />
                  <ParamRow label="Protocol Fee" value={morpho.fee > 0 ? `${(morpho.fee * 100).toFixed(2)}%` : 'None'} sub="Fee taken by Morpho protocol" />
                  <ParamRow label="Market ID" value={formatAddress(morpho.marketId)} sub="On-chain market identifier" mono />
                </tbody>
              </table>
            </div>
          </TuiPanel>

          {/* ─── Context ─── */}
          <TuiPanel title="WHAT THIS MEANS">
            <div className="text-[12px] leading-relaxed space-y-3" style={{ color: 'var(--foreground)' }}>
              <p>
                This Morpho market allows anyone to <strong>borrow {morpho.loanSymbol} against {morpho.collateralSymbol}</strong> as
                collateral. {morpho.collateralSymbol} is a freely-transferable wrapper around the Janus Henderson
                Anemoy S&P 500 Index Fund — meaning borrowers are using tokenized equity index exposure
                to take USDC loans.
              </p>
              <p>
                At <strong>{(morpho.utilization * 100).toFixed(1)}% utilization</strong>, the market is
                {morpho.utilization > 0.9 ? ' near capacity — new borrowers may face higher rates or need to wait for more supply.' : ' actively used with room for growth.'}
              </p>
              <p>
                The <strong>{(morpho.lltv * 100).toFixed(0)}% LLTV</strong> means a borrower can take up to ${((morpho.lltv) * 100).toFixed(0)} cents
                of {morpho.loanSymbol} for every $1 of {morpho.collateralSymbol} collateral. If the collateral value
                drops below this threshold, the position gets liquidated.
              </p>
            </div>
          </TuiPanel>

          {/* ─── CTA ─── */}
          {morpho.marketUrl && (
            <a
              href={morpho.marketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-lg font-bold text-[12px] uppercase tracking-wider transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent-orange)', color: '#FFFFFF' }}
            >
              Open Market on Morpho →
            </a>
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
  color?: 'green' | 'red' | 'yellow';
}) {
  const clr = color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : color === 'yellow' ? 'var(--accent-yellow)' : undefined;
  return (
    <div className="rounded p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="counter-label">{label}</div>
      <div className="text-[22px] font-bold" style={{ color: clr, lineHeight: 1.2 }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

function ParamRow({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, color: 'var(--text-muted)', width: 200 }}>{label}</td>
      <td>
        <span className={mono ? 'font-mono' : ''} style={{ fontWeight: 700 }}>{value}</span>
        {sub && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </td>
    </tr>
  );
}
