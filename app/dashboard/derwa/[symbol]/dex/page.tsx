'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState, TuiPanel } from '@/components/sdk';
import { formatCurrency } from '@/lib/format';
import { formatAddress } from '@/lib/sdk/helpers';
import type { DerwaDetailData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import type { AerodromeSwapsSnapshot } from '@/lib/data/aerodrome-subgraph';

async function fetchDetail(symbol: string): Promise<DerwaDetailData> {
  const res = await fetch(`/api/derwa/${symbol}?days=365`);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

interface SwapsResponse {
  symbol: string;
  pool: string;
  network: string;
  windowDays: number;
  onchain: AerodromeSwapsSnapshot | null;
  cached?: boolean;
}

async function fetchSwaps(symbol: string): Promise<SwapsResponse> {
  // 90 days now that the subgraph reader replaces the slow on-chain
  // scan. The Graph returns this in a single GraphQL call (~200ms),
  // no Vercel function-timeout concerns.
  const res = await fetch(`/api/derwa/${symbol}/swaps?days=90`);
  if (!res.ok) throw new Error('Failed to load swap activity');
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

  const swaps = useQuery<SwapsResponse>({
    queryKey: ['swaps', symbol, 90],
    queryFn: () => fetchSwaps(symbol),
    enabled: !!symbol,
    retry: false,
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
            <MetricTile
              label="24h Volume"
              value={(() => {
                // Prefer DefiLlama's reported volume when present. They
                // don't always have data for every Slipstream pool — fall
                // back to the latest day from our on-chain Swap event scan
                // (same source the chart below uses).
                if (dex.volume1dUsd != null) return formatCurrency(dex.volume1dUsd);
                const series = swaps.data?.onchain?.series ?? [];
                const last = series[series.length - 1];
                return last ? formatCurrency(last.volumeUsd) : '—';
              })()}
              sub={
                dex.volume1dUsd != null
                  ? 'Trading volume (DefiLlama)'
                  : swaps.data?.onchain
                    ? 'Trading volume (on-chain Swap events)'
                    : 'Trading volume'
              }
            />
            <MetricTile
              label="Premium / Discount"
              value={dex.premiumPct != null ? `${dex.premiumPct >= 0 ? '+' : ''}${dex.premiumPct.toFixed(2)}%` : '—'}
              sub={dex.priceUsd != null ? `DEX $${dex.priceUsd.toFixed(2)} vs NAV $${w!.navUsd.toFixed(2)}` : 'No trade price'}
              color={dex.premiumPct != null ? (dex.premiumPct > 0 ? 'green' : 'red') : undefined}
            />
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

          {/* Daily Swap Activity — on-chain Swap events */}
          <SwapActivitySection data={swaps.data} loading={swaps.isLoading} error={swaps.isError} />

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
                    <td><ChainBadge chain={dex.network} /></td>
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

function MetricTile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: 'green' | 'red' }) {
  const clr = color === 'green' ? 'var(--accent-green)' : color === 'red' ? 'var(--accent-red)' : undefined;
  return (
    <div className="rounded px-3 py-2.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[16px] font-bold mt-0.5" style={{ color: clr, lineHeight: 1.2 }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

/**
 * Daily swap activity panel — on-chain Swap event aggregation. Primary
 * (and only) source: every Swap event from the pool contract decoded
 * from raw transaction logs via Base RPC.
 */
function SwapActivitySection({
  data,
  loading,
  error,
}: {
  data?: SwapsResponse;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return <PanelSkeleton height="h-72" label="Daily Swap Activity" />;
  }
  if (error || !data) {
    return null;
  }
  const oc = data.onchain;

  if (!oc || oc.series.length === 0) {
    return (
      <TuiPanel title="DAILY SWAP ACTIVITY">
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          No swap activity returned by the Aerodrome subgraph for this pool yet.
        </div>
      </TuiPanel>
    );
  }

  // Daily series from the subgraph.
  const merged = oc.series.map((d) => ({
    date: d.date,
    onchainVol: d.volumeUsd,
    txCount: d.txCount,
  }));

  // Headline summary stats over the window.
  const totals = oc.series.reduce(
    (acc, d) => {
      acc.vol += d.volumeUsd;
      acc.tx += d.txCount;
      return acc;
    },
    { vol: 0, tx: 0 },
  );

  // Pick the busiest day for an "activity high" tile.
  const peakDay = oc.series.reduce(
    (m, d) => (d.volumeUsd > m.volumeUsd ? d : m),
    oc.series[0] ?? { date: '', volumeUsd: 0, txCount: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricTile
          label={`Volume (${data.windowDays}d)`}
          value={formatCurrency(totals.vol)}
          sub="Aerodrome subgraph"
        />
        <MetricTile
          label={`Trades (${data.windowDays}d)`}
          value={totals.tx.toLocaleString()}
          sub="Indexed Swap events"
        />
        <MetricTile
          label="Busiest Day"
          value={formatCurrency(peakDay.volumeUsd)}
          sub={peakDay.date || '—'}
        />
      </div>

      <ChartPanel
        title="DAILY SWAP VOLUME"
        badge="On-chain Swap events"
        height="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickFormatter={(d: string) =>
                d && d.length >= 10
                  ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5,7)) - 1]} ${Number(d.slice(8,10))}`
                  : d
              }
              stroke="#CBD5E1"
              interval={Math.max(0, Math.floor(merged.length / 10) - 1)}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748B' }}
              tickFormatter={(v) => formatCurrency(Number(v))}
              stroke="#CBD5E1"
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                fontSize: 11,
              }}
              labelStyle={{ color: '#0F172A', fontWeight: 700 }}
              formatter={(value: unknown, name: unknown) => [
                formatCurrency(Number(value ?? 0)),
                String(name ?? ''),
              ]}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              iconSize={9}
              wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
            />
            <Bar
              dataKey="onchainVol"
              name="On-chain Volume"
              fill="#2563EB"
              fillOpacity={0.85}
              barSize={5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>

      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <strong>Methodology.</strong> Daily volume + tx count for pool{' '}
        <code>{formatAddress(data.pool)}</code> over the last{' '}
        {data.windowDays} days, sourced from the Aerodrome Base Full
        subgraph on The Graph Network.{' '}
        <Link href="/dashboard/methodology" style={{ color: 'var(--accent-orange)' }}>
          Full methodology →
        </Link>
      </div>
    </div>
  );
}
