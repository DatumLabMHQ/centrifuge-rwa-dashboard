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
import {
  ACCENT_BLUE,
  AXIS_STROKE,
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from '@/lib/chart-theme';
import type { DerwaDetailData } from '@/lib/data/types';
import { PageHeader } from '@/components/PageHeader';
import { ChartPanel } from '@/components/ChartPanel';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { PanelSkeleton } from '@/components/PanelSkeleton';
import type { SwapsSnapshot } from '@/lib/data/onchain/swap-events';

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
  onchain: SwapsSnapshot | null;
  cached?: boolean;
}

async function fetchSwaps(symbol: string): Promise<SwapsResponse> {
  // 30 days is a deliberate balance: fewer chunked eth_getLogs calls than
  // 90 days, so the cold-path scan fits well under Vercel's serverless
  // timeout. The chart still shows ~25 days of recent activity which is
  // plenty to read a trend.
  const res = await fetch(`/api/derwa/${symbol}/swaps?days=30`);
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
            <MetricTile
              label="Total APY"
              value={`${dex.apy.toFixed(2)}%`}
              color="green"
              sub={
                // Surface the AERO-emissions split inline. Almost all of the
                // APY on this Slipstream pool comes from Aerodrome token
                // incentives, not organic swap fees, so calling it out on
                // the tile prevents readers from reading the headline rate
                // as pure-yield. The full numeric breakdown was previously
                // in a dedicated "APY BREAKDOWN" panel; that panel was
                // redundant with the tile so it was removed.
                dex.apyReward != null && dex.apy > 0
                  ? `${dex.apyReward.toFixed(2)}% from AERO emissions${
                      dex.apyBase != null
                        ? ` · ${dex.apyBase.toFixed(2)}% from swap fees`
                        : ''
                    }`
                  : 'Combined yield'
              }
            />
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
    return (
      <PanelSkeleton
        height="h-72"
        label="Daily Swap Activity"
        description="Scanning Base eth_getLogs · ~5s on cold cache, instant on cache hit"
      />
    );
  }
  if (error || !data) {
    return null;
  }
  const oc = data.onchain;

  if (!oc || oc.series.length === 0) {
    return (
      <TuiPanel title="DAILY SWAP ACTIVITY">
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          On-chain scan returned no Swap events for this pool yet.
        </div>
      </TuiPanel>
    );
  }

  // Single-source dataset.
  const merged = oc.series.map((d) => ({
    date: d.date,
    onchainVol: d.volumeUsd,
    txCount: d.txCount,
    uniqueTraders: d.uniqueTraders,
  }));

  // Headline summary stats from the on-chain series — the authoritative numbers.
  const totals = oc.series.reduce(
    (acc, d) => {
      acc.vol += d.volumeUsd;
      acc.tx += d.txCount;
      return acc;
    },
    { vol: 0, tx: 0 },
  );
  const allTraders = new Set<string>();
  for (const d of oc.series) {
    // Note: SwapDay carries a count, not the actual address set. We use the
    // sum of distinct counts as an upper bound for "active wallets" in the
    // headline, even though it double-counts wallets that traded multiple days.
    void d;
  }
  // Instead of estimating, count peak day's distinct traders as a proxy.
  const peakDayTraders = oc.series.reduce((m, d) => Math.max(m, d.uniqueTraders), 0);
  void allTraders;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label={`Volume (${data.windowDays}d)`}
          value={formatCurrency(totals.vol)}
          sub="On-chain Swap events"
        />
        <MetricTile
          label={`Trades (${data.windowDays}d)`}
          value={totals.tx.toLocaleString()}
          sub="Decoded from pool logs"
        />
        <MetricTile
          label="Peak Day Traders"
          value={peakDayTraders.toLocaleString()}
          sub="Distinct recipients in busiest day"
        />
        <MetricTile
          label="Coverage"
          value={
            oc.scannedChunks > 0
              ? `${Math.round(((oc.scannedChunks - oc.failedChunks) / oc.scannedChunks) * 100)}%`
              : '—'
          }
          sub={`${oc.scannedChunks} chunks · ${oc.failedChunks} failed`}
          color={oc.failedChunks === 0 ? 'green' : oc.failedChunks > oc.scannedChunks * 0.2 ? 'red' : undefined}
        />
      </div>

      <ChartPanel
        title="DAILY SWAP VOLUME"
        badge="On-chain Swap events"
        height="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickFormatter={(d: string) =>
                d && d.length >= 10
                  ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5,7)) - 1]} ${Number(d.slice(8,10))}`
                  : d
              }
              stroke={AXIS_STROKE}
              interval={Math.max(0, Math.floor(merged.length / 10) - 1)}
              minTickGap={20}
            />
            <YAxis
              tick={AXIS_TICK}
              tickFormatter={(v) => formatCurrency(Number(v))}
              stroke={AXIS_STROKE}
              width={70}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
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
              fill={ACCENT_BLUE}
              fillOpacity={0.85}
              barSize={5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>

      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <strong>Methodology.</strong> Volume bars = USDC side of every{' '}
        <code>Swap</code> event from pool <code>{formatAddress(data.pool)}</code> over the
        last {data.windowDays} days, decoded from raw transaction logs via Base RPC.{' '}
        <Link href="/dashboard/methodology" style={{ color: 'var(--accent-orange)' }}>
          Full methodology →
        </Link>
      </div>
    </div>
  );
}
