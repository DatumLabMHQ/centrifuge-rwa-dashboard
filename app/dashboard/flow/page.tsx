'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import {
  ErrorState,
  TuiPanel,
} from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import type { CrossChainFlowData, FlowData, FlowNode } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { TimeSlicer, type TimeRange } from '@/components/TimeSlicer';
import { ChainBadge } from '@/components/ui/ChainBadge';

type FlowResponse = FlowData & {
  crossChain: CrossChainFlowData;
  cached?: boolean;
};

const RANGE_DAYS: Record<TimeRange, number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
};

const CATEGORY_COLOR: Record<FlowNode['category'], string> = {
  currency: '#2563EB',
  vault: '#EA580C',
  pool: '#16A34A',
  wrapper: '#9333EA',
  venue: '#0891B2',
};

const CHAIN_COLOR: Record<string, string> = {
  ethereum: '#627EEA',
  base: '#0052FF',
  arbitrum: '#28A0F0',
  avalanche: '#E84142',
  plume: '#C8A973',
  binance: '#F0B90B',
  optimism: '#FF0420',
  // Newer chains the indexer started reporting after V3 multichain launch.
  monad: '#836EF9',
  pharos: '#1A8A52',
  hyperliquid: '#97FCE4',
};

async function fetchFlow(days: number): Promise<FlowResponse> {
  const res = await fetch(`/api/flow?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<FlowResponse>;
}

type FlowView = 'pool' | 'crosschain';

export default function FlowPage() {
  const [range, setRange] = useState<TimeRange>('30D');
  const [view, setView] = useState<FlowView>('pool');
  const days = RANGE_DAYS[range];

  const flow = useQuery<FlowResponse>({
    queryKey: ['flow', days],
    queryFn: () => fetchFlow(days),
  });

  if (flow.isError) {
    return (
      <ErrorState
        message={flow.error instanceof Error ? flow.error.message : 'Failed to load flow data.'}
        onRetry={() => flow.refetch()}
      />
    );
  }

  const data = flow.data;
  const netFlow = data ? data.totalDepositsUsd - data.totalRedemptionsUsd : 0;
  const netClass = netFlow > 0 ? 'num-positive' : netFlow < 0 ? 'num-negative' : 'num-neutral';

  const sankeyData = data
    ? {
        nodes: data.nodes.map((n) => ({ name: n.name })),
        links: data.links,
      }
    : { nodes: [], links: [] };

  // Per-pool deposits/redemptions for the detail table. Walk the Sankey
  // links and bucket by pool node — the aggregator no longer exposes raw
  // per-pool figures separately, so we reconstruct from the graph.
  const poolFlows = (() => {
    if (!data) return [];
    const vaultIdx = data.nodes.findIndex((n) => n.category === 'vault');
    const walletIdx = data.nodes.findIndex((n) => n.name === 'Investor Wallet');
    return data.nodes
      .map((n, i) => ({ node: n, idx: i }))
      .filter((p) => p.node.category === 'pool')
      .map(({ node, idx }) => {
        const deposits = data.links.find((l) => l.source === vaultIdx && l.target === idx)?.value ?? 0;
        const redemptions = data.links.find((l) => l.source === idx && l.target === walletIdx)?.value ?? 0;
        return {
          name: node.name,
          deposits,
          redemptions,
          net: deposits - redemptions,
        };
      })
      .sort((a, b) => b.deposits + b.redemptions - (a.deposits + a.redemptions));
  })();

  const cross = data?.crossChain;
  // Identify which node indices are sources (first column) vs targets (second
  // column). Source indices are exactly the ones referenced as `link.source`;
  // any other index is a target. We use this to position labels correctly.
  const sourceIndices = new Set(cross?.links.map((l) => l.source) ?? []);
  const crossSankey = cross
    ? {
        nodes: cross.nodes.map((n) => ({ name: n.name })),
        links: cross.links,
      }
    : { nodes: [], links: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flow of Funds"
        subtitle={`Capital movement across pools and chains over the last ${range.toLowerCase()}`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {data?.lastUpdated && (
              <DataSourceBadge lastUpdated={data.lastUpdated} cached={data.cached} />
            )}
            <TimeSlicer value={range} onChange={setRange} />
          </div>
        }
      />

      {/* ─── Bloomberg-style summary tiles (in-content, not in ticker) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="Deposits"
          value={data ? formatCurrency(data.totalDepositsUsd) : '—'}
          subtitle="USDC into vaults"
          colorClass="num-positive"
          prefix={data ? '+' : ''}
        />
        <SummaryTile
          label="Redemptions"
          value={data ? formatCurrency(data.totalRedemptionsUsd) : '—'}
          subtitle="Investors withdrawing"
          colorClass="num-negative"
          prefix={data ? '−' : ''}
        />
        <SummaryTile
          label="Net Flow"
          value={data ? formatCurrency(Math.abs(netFlow)) : '—'}
          subtitle={netFlow >= 0 ? 'Net inflow' : 'Net outflow'}
          colorClass={netClass}
          prefix={data ? (netFlow >= 0 ? '+' : '−') : ''}
        />
        <SummaryTile
          label="Cross-Chain Transfers"
          value={
            cross
              ? `${cross.txCount.toLocaleString()}${cross.hitFetchCap ? '+' : ''}`
              : '—'
          }
          subtitle={
            cross
              ? `${cross.links.length} active routes${cross.hitFetchCap ? ' · capped at fetch limit' : ''}`
              : 'Loading…'
          }
        />
      </div>

      {/* ─── Single Sankey panel — toggle between pool flow and cross-chain ─── */}
      <ChartPanel
        title={view === 'pool' ? 'POOL FLOW' : 'CROSS-CHAIN FLOW'}
        badge={
          view === 'pool'
            ? `USDC → Vaults → Pools · ${range.toLowerCase()}`
            : `Wrapper transfers between chains · ${range.toLowerCase()}`
        }
        height="h-[520px]"
        right={
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className={`time-btn ${view === 'pool' ? 'active' : ''}`}
              onClick={() => setView('pool')}
            >
              Pool Flow
            </button>
            <button
              type="button"
              className={`time-btn ${view === 'crosschain' ? 'active' : ''}`}
              onClick={() => setView('crosschain')}
            >
              Cross-Chain
            </button>
          </div>
        }
      >
        {!data ? (
          <div className="h-full w-full skeleton rounded" />
        ) : view === 'pool' ? (
          data.nodes.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={sankeyData}
                nodePadding={20}
                nodeWidth={12}
                linkCurvature={0.5}
                iterations={64}
                link={{ stroke: '#2563EB', strokeOpacity: 0.15 }}
                node={({ x, y, width, height, index, payload }) => {
                  const node = data.nodes[index];
                  const color = node ? CATEGORY_COLOR[node.category] : '#64748B';
                  const isLeft = x < 200;
                  // When one pool dwarfs the rest (e.g. JTRSY at $435M of
                  // $439M deposits) the small pools render as near-zero
                  // bars and Recharts piles all their labels at the column
                  // edge. Suppress labels under a readability threshold —
                  // the detail table below the Sankey carries the per-pool
                  // breakdown those bars would otherwise communicate.
                  const showLabel = height >= 10;
                  return (
                    <g>
                      <rect x={x} y={y} width={width} height={height} fill={color} stroke={color} />
                      {showLabel && (
                        <text
                          x={isLeft ? x + width + 6 : x - 6}
                          y={y + height / 2}
                          textAnchor={isLeft ? 'start' : 'end'}
                          fontSize={11}
                          fill="#0F172A"
                          dominantBaseline="middle"
                          fontWeight={600}
                        >
                          {payload.name}
                        </text>
                      )}
                    </g>
                  );
                }}
              >
                <Tooltip
                  contentStyle={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 4,
                    fontSize: 11,
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                  }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
              </Sankey>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No pool flow activity in the last ${range.toLowerCase()}.`} />
          )
        ) : cross && cross.nodes.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={crossSankey}
              nodePadding={24}
              nodeWidth={14}
              linkCurvature={0.5}
              iterations={64}
              link={{ stroke: '#0891B2', strokeOpacity: 0.18 }}
              node={({ x, y, width, height, index, payload }) => {
                const node = cross!.nodes[index];
                const color = node ? CHAIN_COLOR[node.name] ?? '#64748B' : '#64748B';
                const isSource = sourceIndices.has(index);
                // Same chain can appear in both the source column and the
                // target column — append "(out)" / "(in)" so a reader can
                // tell at a glance which side they're looking at.
                const label = `${payload.name} ${isSource ? '(out)' : '(in)'}`;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={color} stroke={color} />
                    <text
                      x={isSource ? x + width + 6 : x - 6}
                      y={y + height / 2}
                      textAnchor={isSource ? 'start' : 'end'}
                      fontSize={11}
                      fill="#0F172A"
                      dominantBaseline="middle"
                      fontWeight={700}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {label}
                    </text>
                  </g>
                );
              }}
            >
              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 4,
                  fontSize: 11,
                  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                }}
                formatter={(v) => `${Number(v).toLocaleString()} transfers`}
              />
            </Sankey>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={`No cross-chain transfers in the last ${range.toLowerCase()}.`} />
        )}
      </ChartPanel>

      {/* ─── Per-pool detail table — only when pool view is active ───
           When one pool dominates (currently JTRSY at ~99% of deposits)
           the Sankey crushes everyone else into illegible threads. The
           table gives equal pixel-height per row so smaller pools stay
           readable without distorting the Sankey's proportions. */}
      {view === 'pool' && poolFlows.length > 0 && (
        <TuiPanel
          title="POOL FLOW DETAIL"
          badge={`${poolFlows.length} pools with activity in ${range.toLowerCase()}`}
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pool</th>
                  <th className="text-right">Deposits</th>
                  <th className="text-right">Redemptions</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">% of Total Deposits</th>
                </tr>
              </thead>
              <tbody>
                {poolFlows.map((p) => {
                  const pct =
                    data && data.totalDepositsUsd > 0
                      ? (p.deposits / data.totalDepositsUsd) * 100
                      : 0;
                  const netClr =
                    p.net > 0
                      ? 'var(--accent-green)'
                      : p.net < 0
                      ? 'var(--accent-red)'
                      : 'var(--text-muted)';
                  return (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td className="text-right num-positive">
                        {p.deposits > 0 ? `+${formatCurrency(p.deposits)}` : '—'}
                      </td>
                      <td className="text-right num-negative">
                        {p.redemptions > 0 ? `−${formatCurrency(p.redemptions)}` : '—'}
                      </td>
                      <td className="text-right" style={{ color: netClr, fontWeight: 700 }}>
                        {p.net > 0 ? '+' : p.net < 0 ? '−' : ''}
                        {formatCurrency(Math.abs(p.net))}
                      </td>
                      <td className="text-right" style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>
                        {pct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TuiPanel>
      )}

      {/* ─── Cross-chain pair table — only when that view is active ─── */}
      {view === 'crosschain' && cross && cross.links.length > 0 && (
        <TuiPanel title="TOP CROSS-CHAIN PAIRS" badge={`${cross.links.length} active routes`} noPadding>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th className="text-right">Transfers</th>
                  <th className="text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {cross.links.slice(0, 10).map((l, i) => {
                  const from = cross.nodes[l.source];
                  const to = cross.nodes[l.target];
                  const pct =
                    cross.totalMessageCount > 0
                      ? (l.value / cross.totalMessageCount) * 100
                      : 0;
                  return (
                    <tr key={i}>
                      <td>
                        <ChainBadge chain={from.name} />
                      </td>
                      <td>
                        <ChainBadge chain={to.name} />
                      </td>
                      <td className="text-right" style={{ fontWeight: 700 }}>
                        {l.value.toLocaleString()}
                      </td>
                      <td className="text-right" style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
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
  prefix,
}: {
  label: string;
  value: string;
  subtitle: string;
  colorClass?: string;
  prefix?: string;
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
      <div className={`counter-value ${colorClass ?? ''}`}>
        {prefix ?? ''}
        {value}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="h-full flex items-center justify-center text-[11px]"
      style={{ color: 'var(--text-muted)' }}
    >
      {message}
    </div>
  );
}

/**
 * Tiny "where this data came from + how fresh" pill — the flow page tracks
 * transactions, not token-supply reconciliation, so the standard
 * DataQualityBadge (which reports Tier 1 vs Tier 2 supply diffs) doesn't
 * apply. This is the source-and-freshness equivalent.
 */
function DataSourceBadge({
  lastUpdated,
  cached,
}: {
  lastUpdated: string;
  cached?: boolean;
}) {
  // Date.now() is impure during render (React 19 lint), so compute relative
  // age in an effect and re-run on a 1-min tick. Tooltip uses absolute time
  // which IS render-safe.
  const [ageLabel, setAgeLabel] = useState('—');
  useEffect(() => {
    const compute = () => {
      const ageMin = Math.max(
        0,
        Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000),
      );
      setAgeLabel(
        ageMin < 1
          ? 'just now'
          : ageMin < 60
          ? `${ageMin}m ago`
          : `${Math.round(ageMin / 60)}h ago`,
      );
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [lastUpdated]);
  return (
    <span
      title={`Source: Centrifuge V3 indexer (api.centrifuge.io)\nLast aggregated: ${new Date(lastUpdated).toLocaleString()}${cached ? '\nServed from cache' : '\nFresh fetch'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.08em',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 3,
        background: 'rgba(46, 204, 113, 0.14)',
        color: 'var(--green)',
        cursor: 'help',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 0 2px rgba(46,204,113,0.14)',
        }}
      />
      Centrifuge · {ageLabel}
    </span>
  );
}
