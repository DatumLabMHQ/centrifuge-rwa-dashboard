'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import { formatAddress } from '@/lib/sdk/helpers';
import type { DerwaDetailData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { PanelSkeleton } from '@/components/PanelSkeleton';

const ROWS_PER_PAGE = 10;

const EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/address/',
  base: 'https://basescan.org/address/',
  arbitrum: 'https://arbiscan.io/address/',
  avalanche: 'https://snowtrace.io/address/',
  plume: 'https://explorer.plume.org/address/',
  binance: 'https://bscscan.com/address/',
  optimism: 'https://optimistic.etherscan.io/address/',
};

async function fetchDetail(symbol: string): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=365`);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function HoldersSubPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params?.symbol ?? '';
  const [holderPage, setHolderPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);

  const detail = useQuery<DerwaDetailData>({
    queryKey: ['derwa-detail', symbol, 365],
    queryFn: () => fetchDetail(symbol),
    enabled: !!symbol,
  });

  if (detail.isError) {
    return <ErrorState message="Failed to load holder data." onRetry={() => detail.refetch()} />;
  }

  const data = detail.data;
  const w = data?.wrapper;
  const holders = data?.topHolders ?? [];
  const txs = data?.recentTransactions ?? [];
  const chains = data?.chainHolders ?? [];

  const totalHolderPages = Math.max(1, Math.ceil(holders.length / ROWS_PER_PAGE));
  const safeHolderPage = Math.min(holderPage, totalHolderPages - 1);
  const holderRows = holders.slice(safeHolderPage * ROWS_PER_PAGE, safeHolderPage * ROWS_PER_PAGE + ROWS_PER_PAGE);

  const totalActivityPages = Math.max(1, Math.ceil(txs.length / ROWS_PER_PAGE));
  const safeActivityPage = Math.min(activityPage, totalActivityPages - 1);
  const activityRows = txs.slice(safeActivityPage * ROWS_PER_PAGE, safeActivityPage * ROWS_PER_PAGE + ROWS_PER_PAGE);

  const top10Value = holders.slice(0, 10).reduce((s, h) => s + h.valueUsd, 0);
  const totalValue = w?.tvlUsd ?? 1;
  const concentration = totalValue > 0 ? (top10Value / totalValue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link href={`/dashboard/derwa/${symbol}`} style={{ color: 'var(--accent-orange)' }} className="hover:underline">
          ← {symbol}
        </Link>
        <span>·</span>
        <span>Holders</span>
      </div>

      <PageHeader
        title="Holders"
        subtitle={
          w
            ? `${w.holderCount} distinct wallets hold ${symbol} across ${chains.length} chain${chains.length !== 1 ? 's' : ''} · top 10 control ${concentration.toFixed(1)}%`
            : 'Loading holder data…'
        }
      />

      {/* Per-chain distribution */}
      {!data ? (
        <PanelSkeleton height="h-40" label="Per-Chain Distribution" />
      ) : chains.length > 0 && (
        <TuiPanel title="PER-CHAIN DISTRIBUTION" badge={`${chains.length} chains`} noPadding>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th className="text-right">Holders</th>
                  <th className="text-right">Supply</th>
                  <th className="text-right">TVL</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((c) => (
                  <tr key={c.chain}>
                    <td><span className={`chain-badge ${c.chain}`}>{c.chain}</span></td>
                    <td className="text-right">{c.holderCount}</td>
                    <td className="text-right">{c.supply.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(c.tvlUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TuiPanel>
      )}

      {/* Top holders */}
      {!data ? (
        <PanelSkeleton height="h-96" label="Top Holders" />
      ) : (
        <TuiPanel title="TOP HOLDERS" badge={`${holders.length} indexed of ${w?.holderCount ?? '?'} total`} noPadding>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Account</th>
                  <th>Chain</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">% of TVL</th>
                </tr>
              </thead>
              <tbody>
                {holderRows.map((h, i) => {
                  const explorer = EXPLORERS[h.chain.toLowerCase()];
                  const pct = totalValue > 0 ? (h.valueUsd / totalValue) * 100 : 0;
                  const idx = safeHolderPage * ROWS_PER_PAGE + i + 1;
                  return (
                    <tr key={`${h.account}-${i}`}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx}</td>
                      <td className="font-mono">
                        {explorer ? (
                          <a href={`${explorer}${h.account}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }} className="hover:underline">{formatAddress(h.account)}</a>
                        ) : formatAddress(h.account)}
                      </td>
                      <td><span className={`chain-badge ${h.chain}`}>{h.chain}</span></td>
                      <td className="text-right">{h.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(h.valueUsd)}</td>
                      <td className="text-right" style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>{pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {holders.length > ROWS_PER_PAGE && (
            <Paginator page={safeHolderPage} total={totalHolderPages} onPrev={() => setHolderPage(p => Math.max(0, p - 1))} onNext={() => setHolderPage(p => Math.min(totalHolderPages - 1, p + 1))} />
          )}
        </TuiPanel>
      )}

      {/* Recent activity */}
      {data && txs.length > 0 && (
        <TuiPanel title="RECENT ACTIVITY" badge={`${txs.length} txs`} noPadding>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Chain</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((tx) => {
                  const isDeposit = tx.type.includes('DEPOSIT') || tx.type === 'SYNC_DEPOSIT';
                  const explorer = EXPLORERS[tx.chain.toLowerCase()];
                  const ago = Math.round((Date.now() - tx.createdAt) / 60000);
                  const when = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : `${Math.round(ago / 1440)}d ago`;
                  return (
                    <tr key={tx.txHash + tx.type}>
                      <td style={{ color: 'var(--text-muted)' }}>{when}</td>
                      <td style={{ color: isDeposit ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                        {isDeposit ? 'Deposit' : 'Redeem'}
                      </td>
                      <td className="font-mono">
                        {explorer ? (
                          <a href={`${explorer}${tx.account}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }} className="hover:underline">{formatAddress(tx.account)}</a>
                        ) : formatAddress(tx.account)}
                      </td>
                      <td><span className={`chain-badge ${tx.chain}`}>{tx.chain}</span></td>
                      <td className="text-right">{tx.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(tx.valueUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {txs.length > ROWS_PER_PAGE && (
            <Paginator page={safeActivityPage} total={totalActivityPages} onPrev={() => setActivityPage(p => Math.max(0, p - 1))} onNext={() => setActivityPage(p => Math.min(totalActivityPages - 1, p + 1))} />
          )}
        </TuiPanel>
      )}
    </div>
  );
}

function Paginator({ page, total, onPrev, onNext }: { page: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2" style={{ borderTop: '1px solid var(--border)' }}>
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Page {page + 1} of {total}</span>
      <button type="button" className="time-btn" onClick={onPrev} disabled={page === 0} style={{ opacity: page === 0 ? 0.4 : 1 }}>‹</button>
      <button type="button" className="time-btn" onClick={onNext} disabled={page === total - 1} style={{ opacity: page === total - 1 ? 0.4 : 1 }}>›</button>
    </div>
  );
}
