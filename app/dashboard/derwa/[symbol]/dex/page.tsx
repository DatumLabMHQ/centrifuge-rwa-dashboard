'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import type { SwapsSnapshot } from '@/lib/data/onchain/swap-events';
import type {
  GeckoOhlcvSnapshot,
  VolumeReconciliation,
} from '@/lib/data/geckoterminal-ohlcv';

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
  gecko: GeckoOhlcvSnapshot | null;
  reconciliation: VolumeReconciliation | null;
  cached?: boolean;
}

async function fetchSwaps(symbol: string): Promise<SwapsResponse> {
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
            <MetricTile label="24h Volume" value={dex.volume1dUsd != null ? formatCurrency(dex.volume1dUsd) : '—'} sub="Trading volume" />
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

          {/* Daily Swap Activity (on-chain) + GeckoTerminal validation */}
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

const RECON_STYLE: Record<
  VolumeReconciliation['level'],
  { label: string; bg: string; fg: string }
> = {
  ok: { label: 'VERIFIED', bg: 'rgba(46, 204, 113, 0.14)', fg: 'var(--accent-green)' },
  minor: { label: 'MINOR DRIFT', bg: 'rgba(217, 119, 6, 0.16)', fg: 'var(--yellow)' },
  major: { label: 'MAJOR DRIFT', bg: 'rgba(214, 50, 46, 0.14)', fg: 'var(--accent-red)' },
  'no-overlap': { label: 'UNVERIFIED', bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
};

function ReconBadge({ recon }: { recon: VolumeReconciliation | null }) {
  if (!recon) return null;
  const s = RECON_STYLE[recon.level];
  return (
    <span
      title={recon.message}
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
        background: s.bg,
        color: s.fg,
        cursor: 'help',
        textTransform: 'uppercase',
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }}
      />
      {s.label} · {recon.divergence === 0 ? '0%' : `${(recon.divergence * 100).toFixed(2)}%`}
    </span>
  );
}

/**
 * Daily swap activity panel — on-chain Swap event aggregation as the
 * primary source, with GeckoTerminal volume overlaid for validation.
 *
 * The reconciliation badge surfaces the gap between the two: if it's
 * green ("VERIFIED, < 5%") the on-chain reader is working. If it goes
 * yellow or red the chart still renders but the reader flags it.
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
  const gt = data.gecko;
  const recon = data.reconciliation;

  if (!oc || oc.series.length === 0) {
    return (
      <TuiPanel title="DAILY SWAP ACTIVITY">
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          On-chain scan returned no Swap events for this pool yet.
        </div>
      </TuiPanel>
    );
  }

  // Merge on-chain and GeckoTerminal series for a single dataset.
  const gtByDate = new Map(gt?.series.map((d) => [d.date, d.volumeUsd]) ?? []);
  const merged = oc.series.map((d) => ({
    date: d.date,
    onchainVol: d.volumeUsd,
    geckoVol: gtByDate.get(d.date) ?? null,
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
        badge={
          recon ? (
            <span className="inline-flex items-center gap-2">
              <span style={{ color: 'var(--text-muted)' }}>On-chain · validated against GeckoTerminal</span>
              <ReconBadge recon={recon} />
            </span>
          ) : (
            'On-chain Swap events'
          )
        }
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
            <Line
              type="monotone"
              dataKey="geckoVol"
              name="GeckoTerminal (validation)"
              stroke="#EA580C"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>

      {recon && (
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <strong>Methodology.</strong> Volume bars = USDC side of every{' '}
          <code>Swap</code> event from pool <code>{formatAddress(data.pool)}</code> over the
          last {data.windowDays} days, decoded from raw transaction logs via Base RPC. Dashed
          line = GeckoTerminal&apos;s aggregated daily volume, fetched independently. Across {recon.overlapDays}{' '}
          overlapping days, the two sources differ by{' '}
          <strong>{(recon.divergence * 100).toFixed(2)}%</strong>{' '}
          ({recon.message.toLowerCase().includes('agree') ? 'within' : 'beyond'} the 5% verification threshold).{' '}
          <Link href="/dashboard/methodology" style={{ color: 'var(--accent-orange)' }}>
            Full methodology →
          </Link>
        </div>
      )}
    </div>
  );
}
