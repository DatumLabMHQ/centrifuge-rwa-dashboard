'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  TuiPanel,
} from '@datumlabs/dashboard-kit';
import { formatAddress } from '@datumlabs/data-connectors';
import { formatCurrency } from '@/lib/format';
import type { InvestorsData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { PanelSkeleton } from '@/components/PanelSkeleton';

const EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/address/',
  base: 'https://basescan.org/address/',
  arbitrum: 'https://arbiscan.io/address/',
  avalanche: 'https://snowtrace.io/address/',
  plume: 'https://explorer.plume.org/address/',
  binance: 'https://bscscan.com/address/',
  optimism: 'https://optimistic.etherscan.io/address/',
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function InvestorsPage() {
  const investors = useQuery<InvestorsData>({
    queryKey: ['investors'],
    queryFn: () => fetchJson<InvestorsData>('/api/investors'),
  });

  const [chainFilter, setChainFilter] = useState<string>('all');
  const [poolFilter, setPoolFilter] = useState<string>('all');

  const chains = useMemo(() => {
    const set = new Set<string>();
    investors.data?.topHolders.forEach((h) => set.add(h.chain));
    return Array.from(set).sort();
  }, [investors.data]);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    investors.data?.topHolders.forEach((h) => set.add(h.symbol));
    return Array.from(set).sort();
  }, [investors.data]);

  const filtered = useMemo(() => {
    const rows = investors.data?.topHolders ?? [];
    return rows
      .filter((h) => chainFilter === 'all' || h.chain === chainFilter)
      .filter((h) => poolFilter === 'all' || h.symbol === poolFilter);
  }, [investors.data, chainFilter, poolFilter]);

  if (investors.isError) {
    return (
      <ErrorState
        message={
          investors.error instanceof Error ? investors.error.message : 'Failed to load investors.'
        }
        onRetry={() => investors.refetch()}
      />
    );
  }

  const data = investors.data;
  const filteredValue = filtered.reduce((s, h) => s + h.valueUsd, 0);
  const totalValue = data?.topHolders.reduce((s, h) => s + h.valueUsd, 0) ?? 0;
  const top10Share = totalValue > 0 && data
    ? (data.topHolders.slice(0, 10).reduce((s, h) => s + h.valueUsd, 0) / totalValue) * 100
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investors"
        subtitle={
          data
            ? `${data.totalUniqueAccounts} unique accounts · ${formatCurrency(totalValue)} held in top 100 positions · top 10 = ${top10Share.toFixed(1)}% concentration`
            : 'Loading holder data…'
        }
        right={
          <div className="flex items-center gap-2">
            <select
              className="tui-select"
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
            >
              <option value="all">All chains</option>
              {chains.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="tui-select"
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
            >
              <option value="all">All tokens</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* ─── Holders table ─── */}
      {!data ? (
        <PanelSkeleton height="h-96" label="Top Holders" />
      ) : (
      <TuiPanel title="TOP HOLDERS" badge={`${filtered.length} rows`} noPadding>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>Token</th>
                <th>Pool</th>
                <th>Chain</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Value</th>
                <th className="text-right">% of Top 100</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => {
                const shareOfTotal = totalValue > 0 ? (h.valueUsd / totalValue) * 100 : 0;
                const explorer = EXPLORERS[h.chain.toLowerCase()];
                return (
                  <tr key={`${h.account}-${h.symbol}-${h.chain}-${i}`}>
                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td className="font-mono">
                      {explorer ? (
                        <a
                          href={`${explorer}${h.account}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-blue)' }}
                          className="hover:underline"
                        >
                          {formatAddress(h.account)}
                        </a>
                      ) : (
                        formatAddress(h.account)
                      )}
                    </td>
                    <td style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{h.symbol}</td>
                    <td style={{ maxWidth: 240 }}>
                      <span
                        className="truncate inline-block align-bottom"
                        style={{ maxWidth: 220 }}
                        title={h.poolName}
                      >
                        {h.poolName}
                      </span>
                    </td>
                    <td>
                      <span className={`chain-badge ${h.chain}`}>{h.chain}</span>
                    </td>
                    <td className="text-right">
                      {h.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(h.valueUsd)}
                    </td>
                    <td className="text-right" style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>
                      {shareOfTotal.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center" style={{ padding: 32, color: 'var(--text-muted)' }}>
                    No holders match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </TuiPanel>
      )}
    </div>
  );
}
