'use client';

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
import { ErrorState, TuiPanel } from '@datumlabs/dashboard-kit';
import { formatAddress } from '@datumlabs/data-connectors';
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

const EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/address/',
  base: 'https://basescan.org/address/',
  arbitrum: 'https://arbiscan.io/address/',
  avalanche: 'https://snowtrace.io/address/',
  plume: 'https://explorer.plume.org/address/',
  binance: 'https://bscscan.com/address/',
  optimism: 'https://optimistic.etherscan.io/address/',
};

const STATUS_COLOR: Record<string, string> = {
  live: 'var(--accent-green)',
  announced: 'var(--accent-yellow)',
  planned: 'var(--text-muted)',
};

const KIND_LABEL: Record<string, string> = {
  dex: 'DEX',
  oracle: 'ORACLE',
  lending: 'LENDING',
  wallet: 'WALLET',
  cex: 'CEX',
};

async function fetchDetail(symbol: string, days: number): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

const TX_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  SYNC_DEPOSIT: { label: 'Deposit', color: 'var(--accent-green)' },
  DEPOSIT_CLAIMED: { label: 'Deposit Claimed', color: 'var(--accent-green)' },
  DEPOSIT_REQUEST_EXECUTED: { label: 'Deposit', color: 'var(--accent-green)' },
  SYNC_REDEEM: { label: 'Redeem', color: 'var(--accent-red)' },
  REDEEM_CLAIMED: { label: 'Redeem Claimed', color: 'var(--accent-red)' },
  REDEEM_REQUEST_EXECUTED: { label: 'Redeem', color: 'var(--accent-red)' },
};

const ROWS_PER_PAGE = 10;

export default function DerwaDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params?.symbol ?? '';
  const [range, setRange] = useState<TimeRange>('365D');
  const [holderPage, setHolderPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <Link href="/dashboard/derwa" style={{ color: 'var(--accent-orange)' }} className="hover:underline">
          ← deRWA Composability
        </Link>
      </div>

      <PageHeader
        title={symbol}
        subtitle={
          w
            ? `${w.name} · wraps ${w.instSymbol} · managed by ${w.manager}`
            : 'Loading wrapper detail…'
        }
        right={<TimeSlicer value={range} onChange={setRange} />}
      />

      {/* ─── Hero metrics ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryTile
          label="TVL"
          value={w ? formatCurrency(w.tvlUsd) : '—'}
          subtitle={w ? `NAV $${w.navUsd.toFixed(4)}` : ''}
        />
        <SummaryTile
          label="Wrap Ratio"
          value={w?.wrapRatio != null ? `${(w.wrapRatio * 100).toFixed(2)}%` : '—'}
          subtitle={
            w?.instTvlUsd != null
              ? `of ${formatCurrency(w.instTvlUsd)} ${w.instSymbol}`
              : 'no inst pool'
          }
          colorClass="text-orange"
        />
        <SummaryTile
          label="Holders"
          value={w ? String(w.holderCount) : '—'}
          subtitle="Distinct wallets"
        />
        <SummaryTile
          label={`${range} Flow`}
          value={w ? formatCurrencySigned(w.flowUsd) : '—'}
          subtitle="Net deposits − redemptions"
          colorClass={
            w && w.flowUsd > 0
              ? 'text-green'
              : w && w.flowUsd < 0
                ? 'text-red'
                : undefined
          }
        />
        <SummaryTile
          label="DEX Premium"
          value={
            w?.dex?.premiumPct == null
              ? '—'
              : `${w.dex.premiumPct >= 0 ? '+' : ''}${w.dex.premiumPct.toFixed(2)}%`
          }
          subtitle={w?.dex ? `vs NAV on ${w.dex.network}` : 'no DEX integration'}
          colorClass={
            w?.dex?.premiumPct == null
              ? undefined
              : w.dex.premiumPct > 0
                ? 'text-green'
                : 'text-red'
          }
        />
      </div>

      {/* ─── Main TVL chart ─── */}
      {!w ? (
        <PanelSkeleton height="h-72" label="TVL trajectory" />
      ) : w.sparkline.length < 2 ? (
        <TuiPanel title="TVL TRAJECTORY" badge="No snapshot data">
          <div
            className="h-56 flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
          >
            Not enough snapshot history in this window.
          </div>
        </TuiPanel>
      ) : (
        <ChartPanel
          title="TVL TRAJECTORY"
          badge={`${w.sparkline.length} snapshots over ${range.toLowerCase()}`}
          height="h-72"
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
                labelFormatter={(v) => {
                  const d = new Date(Number(v));
                  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                }}
                formatter={(v) => [formatCurrency(Number(v)), 'TVL']}
              />
              <Area
                type="monotone"
                dataKey="tvl"
                stroke="#EA580C"
                strokeWidth={2}
                fill="url(#tvlGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* ─── Per-chain holder + supply table ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="flex">
          {!data ? (
            <PanelSkeleton height="h-72" label="Per-Chain Distribution" />
          ) : (
            <TuiPanel
              title="PER-CHAIN DISTRIBUTION"
              badge={`${data.chainHolders.length} chains`}
              noPadding
              className="w-full flex flex-col"
            >
              <div className="overflow-x-auto flex-1">
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
                    {data.chainHolders.map((c) => (
                      <tr key={c.chain}>
                        <td>
                          <span className={`chain-badge ${c.chain}`}>{c.chain}</span>
                        </td>
                        <td className="text-right">{c.holderCount}</td>
                        <td className="text-right">
                          {c.supply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {formatCurrency(c.tvlUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TuiPanel>
          )}
        </div>

        <div className="flex">
          {!data ? (
            <PanelSkeleton height="h-72" label="Wrap Ratio" />
          ) : (
            <TuiPanel
              title="WRAP RATIO"
              badge={w?.instSymbol ?? ''}
              className="w-full flex flex-col"
            >
              <div className="px-4 pb-4 pt-2 space-y-3 flex-1 flex flex-col justify-center">
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Of every dollar in {w?.instSymbol}, this fraction has been wrapped into the
                  freely-transferable {w?.symbol} version usable in DeFi.
                </div>
                <div
                  style={{
                    height: 16,
                    background: 'var(--border)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, ((w?.wrapRatio ?? 0) * 100))}%`,
                      height: '100%',
                      background: 'var(--accent-orange)',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px]">
                  <div>
                    <div className="counter-label">Wrapped</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-orange)' }}>
                      {w ? formatCurrency(w.tvlUsd) : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="counter-label">Institutional</div>
                    <div style={{ fontWeight: 700 }}>
                      {w?.instTvlUsd != null ? formatCurrency(w.instTvlUsd) : '—'}
                    </div>
                  </div>
                </div>
                <div
                  className="text-[11px] text-center pt-2"
                  style={{
                    color: 'var(--accent-orange)',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {w?.wrapRatio != null ? `${(w.wrapRatio * 100).toFixed(2)}%` : '—'} wrapped
                </div>
              </div>
            </TuiPanel>
          )}
        </div>
      </div>

      {/* ─── Top Holders (paginated) ─── */}
      {!data ? (
        <PanelSkeleton height="h-96" label="Top Holders" />
      ) : (
        (() => {
          const totalHolderPages = Math.max(1, Math.ceil(data.topHolders.length / ROWS_PER_PAGE));
          const safeHolderPage = Math.min(holderPage, totalHolderPages - 1);
          const holderRows = data.topHolders.slice(
            safeHolderPage * ROWS_PER_PAGE,
            safeHolderPage * ROWS_PER_PAGE + ROWS_PER_PAGE,
          );
          return (
            <TuiPanel
              title="TOP HOLDERS"
              badge={`${data.topHolders.length} indexed of ${w?.holderCount} total`}
              noPadding
            >
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
                      const pct = w && w.tvlUsd > 0 ? (h.valueUsd / w.tvlUsd) * 100 : 0;
                      const globalIdx = safeHolderPage * ROWS_PER_PAGE + i + 1;
                      return (
                        <tr key={`${h.account}-${i}`}>
                          <td style={{ color: 'var(--text-muted)' }}>{globalIdx}</td>
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
                          <td>
                            <span className={`chain-badge ${h.chain}`}>{h.chain}</span>
                          </td>
                          <td className="text-right">
                            {h.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            {formatCurrency(h.valueUsd)}
                          </td>
                          <td
                            className="text-right"
                            style={{ color: 'var(--accent-orange)', fontWeight: 600 }}
                          >
                            {pct.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                    {data.topHolders.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                          No indexed holder positions for this wrapper yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {data.topHolders.length > ROWS_PER_PAGE && (
                <PaginationFooter
                  page={safeHolderPage}
                  totalPages={totalHolderPages}
                  onPrev={() => setHolderPage((p) => Math.max(0, p - 1))}
                  onNext={() => setHolderPage((p) => Math.min(totalHolderPages - 1, p + 1))}
                />
              )}
            </TuiPanel>
          );
        })()
      )}

      {/* ─── Recent Transactions (paginated) ─── */}
      {!data ? (
        <PanelSkeleton height="h-72" label="Recent Activity" />
      ) : (
        (() => {
          const totalActivityPages = Math.max(
            1,
            Math.ceil(data.recentTransactions.length / ROWS_PER_PAGE),
          );
          const safeActivityPage = Math.min(activityPage, totalActivityPages - 1);
          const activityRows = data.recentTransactions.slice(
            safeActivityPage * ROWS_PER_PAGE,
            safeActivityPage * ROWS_PER_PAGE + ROWS_PER_PAGE,
          );
          return (
            <TuiPanel
              title="RECENT ACTIVITY"
              badge={`${data.recentTransactions.length} txs in window`}
              noPadding
            >
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Account</th>
                      <th>Chain</th>
                      <th className="text-right">Token Amount</th>
                      <th className="text-right">USD Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((tx) => {
                      const meta =
                        TX_TYPE_LABEL[tx.type] ?? { label: tx.type, color: 'var(--text-muted)' };
                      const explorer = EXPLORERS[tx.chain.toLowerCase()];
                      return (
                        <tr key={tx.txHash + tx.type + tx.account}>
                          <td style={{ color: 'var(--text-muted)' }}>{formatRelative(tx.createdAt)}</td>
                          <td style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</td>
                          <td className="font-mono">
                            {explorer ? (
                              <a
                                href={`${explorer}${tx.account}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent-blue)' }}
                                className="hover:underline"
                              >
                                {formatAddress(tx.account)}
                              </a>
                            ) : (
                              formatAddress(tx.account)
                            )}
                          </td>
                          <td>
                            <span className={`chain-badge ${tx.chain}`}>{tx.chain}</span>
                          </td>
                          <td className="text-right">
                            {tx.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            {formatCurrency(tx.valueUsd)}
                          </td>
                        </tr>
                      );
                    })}
                    {data.recentTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                          No deposits or redemptions in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {data.recentTransactions.length > ROWS_PER_PAGE && (
                <PaginationFooter
                  page={safeActivityPage}
                  totalPages={totalActivityPages}
                  onPrev={() => setActivityPage((p) => Math.max(0, p - 1))}
                  onNext={() =>
                    setActivityPage((p) => Math.min(totalActivityPages - 1, p + 1))
                  }
                />
              )}
            </TuiPanel>
          );
        })()
      )}

      {/* ─── DEX panel + Integrations ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {!data ? (
            <PanelSkeleton height="h-56" label="DEX Liquidity" />
          ) : w?.dex ? (
            <TuiPanel title="DEX LIQUIDITY" badge={`${w.dex.network} · live`}>
              <div className="px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="counter-label">DEX Price</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>
                      {w.dex.priceUsd != null ? `$${w.dex.priceUsd.toFixed(4)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="counter-label">NAV</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>${w.navUsd.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="counter-label">Liquidity</div>
                    <div style={{ fontWeight: 700 }}>{formatCurrency(w.dex.liquidityUsd)}</div>
                  </div>
                  <div>
                    <div className="counter-label">24h Volume</div>
                    <div style={{ fontWeight: 700 }}>{formatCurrency(w.dex.volume24hUsd)}</div>
                  </div>
                </div>
                <div>
                  <div className="counter-label">Pool Address</div>
                  <div className="font-mono text-[11px]" style={{ color: 'var(--accent-blue)' }}>
                    {formatAddress(w.dex.address)}
                  </div>
                </div>
                {w.dex.priceUsd != null && (
                  <div
                    className="text-[11px] p-2 rounded"
                    style={{
                      background:
                        w.dex.premiumPct == null || Math.abs(w.dex.premiumPct) < 0.5
                          ? 'rgba(100,116,139,0.08)'
                          : w.dex.premiumPct > 0
                            ? 'var(--accent-green-soft)'
                            : 'var(--accent-red-soft)',
                      color:
                        w.dex.premiumPct == null
                          ? 'var(--text-muted)'
                          : Math.abs(w.dex.premiumPct) < 0.5
                            ? 'var(--text-muted)'
                            : w.dex.premiumPct > 0
                              ? 'var(--accent-green)'
                              : 'var(--accent-red)',
                    }}
                  >
                    DEX trades at <strong>{w.dex.premiumPct?.toFixed(2)}%</strong>{' '}
                    {w.dex.premiumPct && w.dex.premiumPct >= 0 ? 'above' : 'below'} NAV.
                    {w.dex.liquidityUsd < 1000 && (
                      <span> Note: liquidity is too thin for the spread to be actionable.</span>
                    )}
                  </div>
                )}
              </div>
            </TuiPanel>
          ) : (
            <TuiPanel title="DEX LIQUIDITY" badge="not available">
              <div className="px-4 py-6 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                No live DEX integration with a known pool address for this wrapper yet.
              </div>
            </TuiPanel>
          )}
        </div>

        <div>
          {!data ? (
            <PanelSkeleton height="h-56" label="DeFi Integrations" />
          ) : (
            <TuiPanel title="DEFI INTEGRATIONS" badge={`${data.integrations.length} listed`} noPadding>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Protocol</th>
                      <th>Chain</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.integrations.map((i, idx) => (
                      <tr key={idx}>
                        <td>
                          <span
                            className="px-1.5 py-0.5 rounded font-bold"
                            style={{
                              fontSize: 9,
                              background: 'var(--panel-header)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {KIND_LABEL[i.kind] ?? i.kind.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {i.url ? (
                            <a
                              href={i.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              style={{ color: 'var(--foreground)' }}
                            >
                              {i.protocol}
                            </a>
                          ) : (
                            i.protocol
                          )}
                          {i.address && (
                            <span
                              className="ml-2 font-mono text-[9px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {formatAddress(i.address)}
                            </span>
                          )}
                        </td>
                        <td>
                          {i.chain ? (
                            <span className={`chain-badge ${i.chain.toLowerCase()}`}>
                              {i.chain}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td
                          className="text-right"
                          style={{
                            color: STATUS_COLOR[i.status],
                            fontWeight: 700,
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {i.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TuiPanel>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable footer-style pagination control. Renders inside a TuiPanel that
 * uses `noPadding`, sitting flush with the bottom of the table.
 */
function PaginationFooter({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="flex items-center justify-end gap-2 px-4 py-2"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        className="time-btn"
        onClick={onPrev}
        disabled={page === 0}
        style={{ opacity: page === 0 ? 0.4 : 1 }}
        aria-label="Previous page"
      >
        ‹
      </button>
      <button
        type="button"
        className="time-btn"
        onClick={onNext}
        disabled={page === totalPages - 1}
        style={{ opacity: page === totalPages - 1 ? 0.4 : 1 }}
        aria-label="Next page"
      >
        ›
      </button>
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
  colorClass?: 'text-orange' | 'text-green' | 'text-red';
}) {
  const color =
    colorClass === 'text-orange'
      ? 'var(--accent-orange)'
      : colorClass === 'text-green'
        ? 'var(--accent-green)'
        : colorClass === 'text-red'
          ? 'var(--accent-red)'
          : undefined;
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
      <div className="counter-value" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  );
}
