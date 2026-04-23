'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  TuiPanel,
} from '@/components/sdk';
import { formatAddress } from '@/lib/sdk/helpers';
import { formatCurrency, formatCurrencySigned } from '@/lib/format';
import type { PoolRow, PoolsData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import DataQualityBadge from '@/components/ui/DataQualityBadge';
import { PanelSkeleton } from '@/components/PanelSkeleton';

type SortKey = 'tvlUsd' | 'flows30dUsd' | 'tokenPriceUsd' | 'name';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function PoolsPage() {
  const pools = useQuery<PoolsData>({
    queryKey: ['pools'],
    queryFn: () => fetchJson<PoolsData>('/api/pools'),
  });

  const [chainFilter, setChainFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const allChains = useMemo(() => {
    const set = new Set<string>();
    pools.data?.pools.forEach((p) => p.chains.forEach((c) => set.add(c.name)));
    return Array.from(set).sort();
  }, [pools.data]);

  const allClasses = useMemo(() => {
    const set = new Set<string>();
    pools.data?.pools.forEach((p) => set.add(p.assetClass));
    return Array.from(set).sort();
  }, [pools.data]);

  const filtered = useMemo(() => {
    const rows = pools.data?.pools ?? [];
    return rows
      .filter((p) => (showInactive ? true : p.tvlUsd > 0))
      .filter((p) => chainFilter === 'all' || p.chains.some((c) => c.name === chainFilter))
      .filter((p) => classFilter === 'all' || p.assetClass === classFilter)
      .slice()
      .sort((a, b) => {
        const av = sortKey === 'name' ? a.name : (a[sortKey] as number);
        const bv = sortKey === 'name' ? b.name : (b[sortKey] as number);
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
        }
        return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
  }, [pools.data, chainFilter, classFilter, showInactive, sortKey, sortDir]);

  if (pools.isError) {
    return (
      <ErrorState
        message={pools.error instanceof Error ? pools.error.message : 'Failed to load pools.'}
        onRetry={() => pools.refetch()}
      />
    );
  }

  const data = pools.data;
  const totalTvl = filtered.reduce((s, p) => s + p.tvlUsd, 0);
  const totalPools = data?.pools.length ?? 0;

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pools"
        subtitle={`${filtered.length} of ${totalPools} pools · ${formatCurrency(totalTvl)} visible TVL`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {pools.data?.dataQuality && <DataQualityBadge report={pools.data.dataQuality} />}
            <select
              className="tui-select"
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
            >
              <option value="all">All chains</option>
              {allChains.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="tui-select"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All classes</option>
              {allClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              className={`time-btn ${showInactive ? 'active' : ''}`}
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? 'Show all' : 'Hide $0'}
            </button>
          </div>
        }
      />

      {/* ─── Pools table ─── */}
      {!data ? (
        <PanelSkeleton height="h-96" label="All Pools" />
      ) : (
      <TuiPanel title="ALL POOLS" badge={`${filtered.length} rows`} noPadding>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('name')}
                >
                  Pool{sortIndicator('name')}
                </th>
                <th>Symbol</th>
                <th>Class</th>
                <th
                  className="text-right"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('tokenPriceUsd')}
                >
                  Price{sortIndicator('tokenPriceUsd')}
                </th>
                <th
                  className="text-right"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('tvlUsd')}
                >
                  TVL{sortIndicator('tvlUsd')}
                </th>
                <th
                  className="text-right"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('flows30dUsd')}
                >
                  30D Flow{sortIndicator('flows30dUsd')}
                </th>
                <th>Chains</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <PoolTableRow
                  key={p.id}
                  pool={p}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center" style={{ padding: 32, color: 'var(--text-muted)' }}>
                    No pools match the current filters.
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

function PoolTableRow({
  pool,
  expanded,
  onToggle,
}: {
  pool: PoolRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const flowClass =
    pool.flows30dUsd > 0 ? 'num-positive' : pool.flows30dUsd < 0 ? 'num-negative' : 'num-neutral';

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td style={{ maxWidth: 320 }}>
          <span style={{ color: 'var(--accent-orange)', marginRight: 6, fontWeight: 700 }}>
            {expanded ? '▾' : '▸'}
          </span>
          <span
            className="truncate inline-block align-bottom"
            style={{ maxWidth: 260, fontWeight: 600 }}
            title={pool.name}
          >
            {pool.name}
          </span>
          {pool.isDeRwa && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded font-bold"
              style={{
                fontSize: 9,
                color: 'var(--accent-orange)',
                background: 'var(--accent-orange-soft)',
              }}
            >
              deRWA
            </span>
          )}
        </td>
        <td style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{pool.symbol}</td>
        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{pool.assetClass}</td>
        <td className="text-right">${pool.tokenPriceUsd.toFixed(4)}</td>
        <td className="text-right" style={{ fontWeight: 700 }}>
          {formatCurrency(pool.tvlUsd)}
        </td>
        <td className={`text-right ${flowClass}`}>
          {pool.flows30dUsd === 0 ? '—' : formatCurrencySigned(pool.flows30dUsd)}
        </td>
        <td>
          <div className="flex flex-wrap gap-1">
            {pool.chains.map((c) => (
              <span key={c.name} className={`chain-badge ${c.name}`}>
                {c.name}
              </span>
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px' }}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <div className="counter-label">Pool ID</div>
                  <div className="font-mono">{pool.id}</div>
                </div>
                <div>
                  <div className="counter-label">Total Supply</div>
                  <div className="font-mono">{pool.totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="counter-label">30D Tx Count</div>
                  <div className="font-mono">{pool.txCount30d}</div>
                </div>
                <div>
                  <div className="counter-label">Status</div>
                  <div style={{ color: pool.isActive ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {pool.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                </div>
              </div>
              <div>
                <div className="counter-label" style={{ marginBottom: 6 }}>
                  Per-chain breakdown
                </div>
                <table className="data-table" style={{ background: 'var(--background)' }}>
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th>Token Address</th>
                      <th className="text-right">Supply</th>
                      <th className="text-right">TVL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.chains.map((c) => (
                      <tr key={c.name}>
                        <td className="capitalize">{c.name}</td>
                        <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                          {formatAddress(c.address)}
                        </td>
                        <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {c.supply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(c.tvlUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
