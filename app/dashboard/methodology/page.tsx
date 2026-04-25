import Link from 'next/link';
import { TuiPanel } from '@/components/sdk';
import { PageHeader } from '@/components/PageHeader';

export const metadata = {
  title: 'Methodology — Centrifuge RWA Terminal',
  description:
    'How every number on this dashboard is calculated, where the data comes from, and what we deliberately don\u2019t track.',
};

/**
 * Methodology page — the canonical reference for how every figure on this
 * dashboard is computed. Linked from inline "methodology" footers across
 * the rest of the dashboard. Intentionally long-form; this is for the
 * skeptical reader who wants to know whether to trust a number, not for
 * the casual viewer.
 */
export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Methodology"
        subtitle="How every number on this dashboard is computed, where the data comes from, and what we deliberately don't track."
      />

      <Intro />
      <DataSources />
      <ArchitectureTiers />
      <PerMetric />
      <KnownQuirks />
      <Validation />
      <NotTracked />
      <Cadence />
      <CodeReference />
    </div>
  );
}

/* ─── Sections ─── */

function Intro() {
  return (
    <TuiPanel title="PHILOSOPHY">
      <div className="prose-style space-y-3">
        <p>
          Every number on this dashboard is read from a first-party source where one
          exists, with secondary aggregators used only as cross-checks. When the
          two disagree, we say so. When the underlying data has a known limitation,
          we say so. When we&apos;ve made a heuristic choice (smoothing, sanity
          guards, cache TTLs), we explain it.
        </p>
        <p>
          This page is the long form of those decisions. If you&apos;re reading a
          metric on another page and want to know exactly how it&apos;s
          calculated, find it below.
        </p>
        <p style={{ color: 'var(--text-muted)' }}>
          <strong>Last updated:</strong> 2026-04-25. Methodology is versioned
          alongside the source — every change to a calculation ships in the
          same commit as the change to its description here.
        </p>
      </div>
    </TuiPanel>
  );
}

function DataSources() {
  return (
    <TuiPanel title="DATA SOURCES">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Used for</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a
                  href="https://api.centrifuge.io"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)' }}
                >
                  api.centrifuge.io
                </a>
              </td>
              <td>GraphQL · official</td>
              <td>
                Pool list, share-class tokens, per-chain tokenInstances, NAV
                snapshots, investor positions, investor transactions,
                cross-chain payloads
              </td>
              <td>Tier 2</td>
            </tr>
            <tr>
              <td>Centrifuge V3 contracts</td>
              <td>RPC · multi-chain</td>
              <td>
                <code>totalSupply()</code>, <code>balanceOf()</code>,{' '}
                <code>decimals()</code> per token deployment, plus historical
                Transfer events for the holders reader
              </td>
              <td>Tier 1 · authoritative</td>
            </tr>
            <tr>
              <td>Aerodrome Slipstream pool</td>
              <td>RPC · Base</td>
              <td>
                <code>Swap</code> event logs decoded directly from the pool
                contract — daily volume, transaction count, buy/sell pressure
              </td>
              <td>Tier 1 · authoritative</td>
            </tr>
            <tr>
              <td>
                <a
                  href="https://defillama.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)' }}
                >
                  DefiLlama
                </a>
              </td>
              <td>REST · aggregator</td>
              <td>
                Historical TVL series for cross-validation; protocol fee
                revenue (no first-party equivalent exists)
              </td>
              <td>Tier 2 · validation only for TVL</td>
            </tr>
            <tr>
              <td>
                <a
                  href="https://www.geckoterminal.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-orange)' }}
                >
                  GeckoTerminal
                </a>
              </td>
              <td>REST · aggregator</td>
              <td>
                Daily OHLCV per DEX pool — used to validate the on-chain
                Swap event scan, never as the primary source
              </td>
              <td>Tier 2 · validation only</td>
            </tr>
            <tr>
              <td>Morpho Blue GraphQL</td>
              <td>GraphQL · official</td>
              <td>Per-market supply, borrow, utilization, APYs, oracle metadata, IRM curves, historical series</td>
              <td>Tier 2</td>
            </tr>
            <tr>
              <td>Euler Goldsky subgraph</td>
              <td>GraphQL · official</td>
              <td>Per-vault state for Euler lending markets (collateral, supply, borrow, APYs, oracle)</td>
              <td>Tier 2</td>
            </tr>
            <tr>
              <td>IPFS (via gateway)</td>
              <td>HTTP</td>
              <td>Pool metadata JSON (name, asset class, manager profile)</td>
              <td>Tier 2</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TuiPanel>
  );
}

function ArchitectureTiers() {
  return (
    <TuiPanel title="THREE-TIER ARCHITECTURE">
      <div className="prose-style space-y-3">
        <p>
          We classify every data source into one of three tiers. The tier
          determines whether a value can stand alone, whether it needs a
          fallback, and whether it gets a data-quality badge in the UI.
        </p>
        <Tier
          n={1}
          title="On-chain reads · authoritative"
          body={
            <>
              Direct contract calls via batched JSON-RPC. The blockchain is
              the source of truth: <code>totalSupply()</code> and{' '}
              <code>balanceOf()</code> can&apos;t lie. We use this tier for
              every metric where it&apos;s available — token supply, pool
              balances, swap events, oracle reads. Per-chain failures are
              tracked separately so a transient RPC blip doesn&apos;t silently
              corrupt the rollup.
            </>
          }
        />
        <Tier
          n={2}
          title="Indexer / API · primary or fallback"
          body={
            <>
              Centrifuge GraphQL is the richest data source we have access to —
              it has investor positions, historical snapshots, cross-chain
              payloads. None of that is on-chain in a query-able form. We use
              it as the primary source where Tier 1 doesn&apos;t apply, and as
              the fallback when Tier 1 fails or isn&apos;t configured. Same
              treatment for Morpho/Euler/Aerodrome official subgraphs.
            </>
          }
        />
        <Tier
          n={3}
          title="Reconciliation · cross-source validation"
          body={
            <>
              For metrics where we have both Tier 1 and Tier 2 sources (token
              supply, DEX volume), we compute both and compare. The result is
              a per-metric data-quality entry: <em>ok</em> when sources agree
              within 1%, <em>degraded</em> when chain failures leave the
              comparison incomplete, <em>broken</em> only when we can&apos;t
              produce a trustworthy value at all. The badges on every page
              header reflect this state.
            </>
          }
        />
      </div>
    </TuiPanel>
  );
}

function Tier({ n, title, body }: { n: 1 | 2 | 3; title: string; body: React.ReactNode }) {
  const colors = {
    1: 'var(--accent-green)',
    2: 'var(--accent-blue)',
    3: 'var(--accent-orange)',
  } as const;
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 14,
        background: 'var(--card)',
      }}
    >
      <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
        <span
          style={{
            background: colors[n],
            color: '#fff',
            width: 22,
            height: 22,
            borderRadius: 11,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {n}
        </span>
        <strong style={{ fontSize: 13 }}>{title}</strong>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function PerMetric() {
  return (
    <TuiPanel title="METRIC-BY-METRIC METHODOLOGY">
      <div className="space-y-5">
        <Metric
          name="Total TVL"
          where="Overview"
          formula={
            <>
              <code>Σ(pools) Σ(tokenInstances) issuance × price</code> with the
              authoritative on-chain <code>totalSupply()</code> preferred per
              chain when available, indexer&apos;s{' '}
              <code>tokenInstance.totalIssuance</code> as fallback.
            </>
          }
          notes={[
            'Token decimals are read from the indexer (or hardcoded in lib/data/onchain/registry.ts where we manage on-chain reads). JTRSY and JAAA use 6 decimals; everything else uses 18.',
            'NAV is always sourced from the Centrifuge indexer (tokenPrice, scaled by 1e18) — there is no on-chain "NAV" reading because NAV is published off-chain by the asset manager.',
          ]}
        />
        <Metric
          name="Active pools / Active chains"
          where="Overview"
          formula={
            <>
              Pools: number of <code>Pool</code> entities with{' '}
              <code>isActive: true</code>. Chains: filtered to chains with at
              least <strong>$100 of TVL</strong>.
            </>
          }
          notes={[
            'The $100 floor excludes dust deployments and dev-test transfers (Pharos, Monad spokes that hold $1 from a debug transaction). Without this filter, the count drifts from what users see in the visible breakdown.',
          ]}
        />
        <Metric
          name="30-day net flows"
          where="Overview"
          formula={
            <>
              <code>Σ(deposits − redemptions)</code> across{' '}
              <code>investorTransactions</code> with{' '}
              <code>type ∈ {'{'}DEPOSIT_REQUEST_EXECUTED, DEPOSIT_CLAIMED, SYNC_DEPOSIT, REDEEM_REQUEST_EXECUTED, REDEEM_CLAIMED, SYNC_REDEEM{'}'}</code>{' '}
              over the trailing 30 days.
            </>
          }
          notes={[
            'TRANSFER_IN / TRANSFER_OUT events (cross-chain wrapper movement) are excluded — they\u2019re not real flows from external capital.',
            'Each transaction\u2019s value is tokenAmount × tokenPrice at the transaction\u2019s recorded price, not the current NAV.',
          ]}
        />
        <Metric
          name="deRWA wrapper TVL"
          where="deRWA index, wrapper detail"
          formula={
            <>
              For each wrapper, prefer <code>onchain.totalSupply × NAV</code>{' '}
              (sum across every chain a wrapper is deployed on). Fallback to
              the indexer&apos;s <code>tokenInstance.totalIssuance × tokenPrice</code>{' '}
              per chain when on-chain reads fail.
            </>
          }
          notes={[
            'When the on-chain rollup returns zero (all chains failed), we fall through to the per-chain sum where indexer values may have populated some chains. This guards against single-chain RPC blips zeroing the whole wrapper.',
          ]}
        />
        <Metric
          name="Wrap ratio"
          where="deRWA index, wrapper detail"
          formula={
            <>
              <code>wrap_ratio = wrapper_tvl ÷ institutional_tvl</code>
            </>
          }
          notes={[
            'Sanity guard: if the computed institutional TVL is smaller than the wrapper TVL by more than 5%, we reject the comparison and return null. A wrapper is 1:1 backed by the institutional pool — instTvl < wrapperTvl is structurally impossible, and means our institutional source is missing data. Better to render "—" than a misleading 14,000,000% ratio.',
            'Both sides use the same authoritative-or-fallback hierarchy as TVL.',
          ]}
        />
        <Metric
          name="Top Holders (count)"
          where="deRWA index"
          formula={
            <>
              Count of distinct <code>accountAddress</code> values across{' '}
              <code>tokenInstancePositions</code> with{' '}
              <code>balance &gt; 0</code> for any of the four wrapper tokens,
              deduplicated.
            </>
          }
          notes={[
            'This was previously bugged — it counted unique addresses across the top-5-per-wrapper sets, capped at 20. Now it\u2019s the full union. Per-wrapper holder counts shown in the wrapper table use the same source filtered to one tokenId.',
            'Source is the Centrifuge indexer — we don\u2019t currently scan Transfer events and balance-check every candidate, because that requires a paid RPC to do reliably (~2,000 getLogs calls). The reader code is built and waiting in lib/data/onchain/holders.ts.',
          ]}
        />
        <Metric
          name="Daily Pool Yield · Implied APY"
          where="Overview"
          formula={
            <>
              <code>yield[t] = NAV[t] − NAV[t−1] − net_flow[t]</code>, then a
              7-day rolling sum is shown on the chart and used as the headline
              number. APY ={' '}
              <code>(7d_rolling ÷ NAV) × (365 ÷ 7) × 100</code>.
            </>
          }
          notes={[
            'Daily yield is noisy because indexer NAV updates lag investor flows by 1\u20132 days. A $25M flow on day N often shows up in NAV on day N+2, producing a +$25M "yield" on the wrong day that\u2019s offset by a −$25M day later. Smoothing over 7 days absorbs this.',
            'Validity guards: a day is dropped from the calculation if NAV < $100M (history bootstrap) or if NAV jumps more than 2× day-over-day (snapshot data event, not real yield).',
            'APY is capped at ±50%. Anything beyond means inputs are broken; we\u2019d rather show 0% than mislead.',
            'Honest label: this is "yield + management fees combined." Centrifuge\u2019s indexer doesn\u2019t expose fee accruals separately — we can\u2019t isolate the protocol cut without DefiLlama-style heuristics, so we don\u2019t pretend to.',
          ]}
        />
        <Metric
          name="Protocol Revenue (DefiLlama)"
          where="Overview"
          formula={
            <>
              Pulled from{' '}
              <code>api.llama.fi/summary/fees/centrifuge?dataType=dailyRevenue</code>{' '}
              with their daily series passed through unchanged.
            </>
          }
          notes={[
            'This is DefiLlama\u2019s estimate of the fee cut Centrifuge protocol takes (a small fraction of pool yield). Since the Centrifuge indexer has no fee/revenue entity, this is the only available source for protocol-level revenue. Surfaced alongside Pool Yield, never as a substitute.',
          ]}
        />
        <Metric
          name="DEX Volume · Daily Swap Activity"
          where="deSPXA dex subpage"
          formula={
            <>
              <code>Swap(sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick)</code>{' '}
              events read directly from the Aerodrome Slipstream pool contract
              over the trailing 90 days. Volume = absolute value of{' '}
              <code>amount0</code> (the USDC side) summed per UTC day.
            </>
          }
          notes={[
            'Decoded fields: amount0 sign indicates direction (positive = USDC into pool = user bought deSPXA; negative = USDC out = user sold deSPXA). We surface both as separate columns so the chart can show buy/sell pressure.',
            'Cross-validated against GeckoTerminal\u2019s OHLCV endpoint over the overlapping window. The VERIFIED / MINOR DRIFT / MAJOR DRIFT badge in the chart header reflects the divergence: ≤5% = VERIFIED, ≤15% = MINOR, beyond = MAJOR.',
            'Free-tier RPC chunks fail at ~10% rate, which produces a small undercount vs GeckoTerminal. With a paid RPC the gap closes further.',
          ]}
        />
        <Metric
          name="DEX Premium / Discount"
          where="deSPXA dex subpage"
          formula={
            <>
              <code>(dex_price − NAV) ÷ NAV × 100</code>, where{' '}
              <code>dex_price</code> is GeckoTerminal&apos;s last trade price
              for the wrapper and <code>NAV</code> is the indexer&apos;s
              tokenPrice for the same token at the same moment.
            </>
          }
          notes={[
            'GeckoTerminal is used here because the trade price is meant to reflect current market consensus, which already aggregates across the pool\u2019s recent swaps. Using a single most-recent on-chain Swap event would be noisier without being more authoritative.',
          ]}
        />
        <Metric
          name="Lending Markets (Morpho · Euler)"
          where="deSPXA dex subpage, integrated panels"
          formula={
            <>
              Per-market state pulled live from Morpho&apos;s Blue GraphQL API
              (<code>blue-api.morpho.org/graphql</code>) and Euler&apos;s
              official Goldsky subgraph. Both expose supply/borrow/APY in a
              single query.
            </>
          }
          notes={[
            'No on-chain validation layer here yet — both protocols\u2019 indexers are run by the protocol teams themselves, so they\u2019re trusted at face value.',
            'Historical series for Morpho (utilization, APY, supply over time) come from the same endpoint. Euler\u2019s subgraph is current-state only; reconstructing history would require event scanning which isn\u2019t built.',
          ]}
        />
      </div>
    </TuiPanel>
  );
}

function Metric({
  name,
  where,
  formula,
  notes,
}: {
  name: string;
  where: string;
  formula: React.ReactNode;
  notes: string[];
}) {
  return (
    <div
      style={{
        borderLeft: '2px solid var(--accent-orange)',
        paddingLeft: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
        Surfaced on: <em>{where}</em>
      </div>
      <div style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.55 }}>
        <strong>Formula.</strong> {formula}
      </div>
      {notes.length > 0 && (
        <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 18, lineHeight: 1.55 }}>
          {notes.map((n, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KnownQuirks() {
  return (
    <TuiPanel title="KNOWN DATA QUIRKS">
      <div className="prose-style space-y-3">
        <p>
          These are the gotchas every analyst building on Centrifuge data
          will eventually run into. We&apos;ve already routed around them so
          you don&apos;t have to.
        </p>
        <Quirk
          label="JTRSY and JAAA use 6 decimals, not 18"
          body={
            <>
              Janus Henderson chose USDC-aligned 6-decimal precision for these
              two share classes. Every other token on Centrifuge uses 18.
              Forgetting this collapses 1.38B JTRSY shares into 0.00138 in
              your aggregator and silently erases ~$1.9B of TVL. Hardcoded in{' '}
              <code>lib/data/onchain/registry.ts</code>.
            </>
          }
        />
        <Quirk
          label="The Centrifuge indexer reports totalIssuance ≈ 0 for some tokens"
          body={
            <>
              JTRSY, JAAA, deSPXA, deCRDX, SPXA, ArkOdin all have aggregate
              issuance fields stuck at micro-fractions or zero, even though
              the underlying contracts hold real supply. This is an upstream
              issue with Centrifuge&apos;s indexer pipeline. The on-chain reader
              ignores the broken aggregate and reads <code>totalSupply()</code>{' '}
              from each chain directly. The reconciliation layer (Tier 3)
              flags any token where the on-chain value disagrees with the
              indexer by more than 1%.
            </>
          }
        />
        <Quirk
          label="NAV updates lag investor flows by 1–2 days"
          body={
            <>
              When an investor deposits, the transaction is recorded
              immediately, but the resulting NAV update from the asset manager
              shows up 1–2 days later. Daily yield computed naïvely produces
              giant swings (+$95M today, −$95M two days later that cancel out).
              We smooth with a 7-day rolling window for the chart and use
              that for the headline APY.
            </>
          }
        />
        <Quirk
          label="Free-tier RPCs lose ~10% of getLogs chunks"
          body={
            <>
              For event scans (Swap events, Transfer events) we issue dozens to
              hundreds of <code>eth_getLogs</code> calls per request. Public
              RPCs throttle aggressively in this regime. With retries, we see
              5–15% chunk failure rate on Base&apos;s free drpc.org endpoint.
              The reader tracks failed chunks separately so the UI can show a
              &ldquo;coverage&rdquo; indicator. The cross-source validation (vs
              GeckoTerminal) catches when this materially affects volume.
              Production deployments should use a paid RPC; the env-var
              override is documented in <code>lib/data/onchain/rpc.ts</code>.
            </>
          }
        />
        <Quirk
          label="The Centrifuge indexer has no fee/revenue entity"
          body={
            <>
              Fees aren&apos;t emitted as discrete events in V3 — they&apos;re
              folded into NAV updates. Our &ldquo;Daily Pool Yield&rdquo;
              includes management fees and asset-side yield combined; we
              can&apos;t isolate the protocol cut from official data.
              DefiLlama&apos;s &ldquo;Centrifuge revenue&rdquo; number is
              their heuristic estimate; we surface it alongside ours but
              don&apos;t try to reproduce it.
            </>
          }
        />
        <Quirk
          label="Snapshot data bootstraps mid-window"
          body={
            <>
              <code>tokenSnapshot</code> rows are only emitted when something
              triggers them (a NAV update, a transfer, a fee accrual). Pre-bootstrap
              days look like $0 NAV in the rollup, even though the pool clearly
              had supply. Our yield calculation guards against this with a
              $100M floor and a 2× day-over-day ratio cap — days where NAV
              &ldquo;appears&rdquo; or doubles aren&apos;t real yield.
            </>
          }
        />
      </div>
    </TuiPanel>
  );
}

function Quirk({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(255, 107, 53, 0.04)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent-orange)',
        borderRadius: 4,
        padding: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function Validation() {
  return (
    <TuiPanel title="CROSS-SOURCE VALIDATION">
      <div className="prose-style space-y-3">
        <p>
          For three metrics we have an authoritative first-party source AND a
          second independent source. We compute both and compare; the gap is
          surfaced as a badge or footnote.
        </p>
        <ValidationRow
          metric="Total TVL"
          primary="Centrifuge indexer + on-chain totalSupply"
          secondary="DefiLlama protocol TVL"
          shown="Overview header — VERIFIED vs DEFILLAMA pill, with signed % gap"
          tolerance="±5%"
        />
        <ValidationRow
          metric="Token supply (per token)"
          primary="On-chain totalSupply()"
          secondary="Centrifuge indexer totalIssuance"
          shown="Per-token data-quality badge in the page header (ok / degraded / broken)"
          tolerance="≤1% = ok; sources differ → uses on-chain authoritative"
        />
        <ValidationRow
          metric="DEX volume"
          primary="On-chain Swap event aggregation"
          secondary="GeckoTerminal OHLCV"
          shown="Chart header on dex subpage — VERIFIED / MINOR DRIFT / MAJOR DRIFT badge"
          tolerance="≤5% = ok; ≤15% = minor; beyond = major"
        />
      </div>
    </TuiPanel>
  );
}

function ValidationRow({
  metric,
  primary,
  secondary,
  shown,
  tolerance,
}: {
  metric: string;
  primary: string;
  secondary: string;
  shown: string;
  tolerance: string;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: 12,
        background: 'var(--card)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{metric}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ fontSize: 12 }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Primary: </span>
          <span>{primary}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Validation: </span>
          <span>{secondary}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        <strong>Shown as:</strong> {shown} · <strong>Tolerance:</strong> {tolerance}
      </div>
    </div>
  );
}

function NotTracked() {
  return (
    <TuiPanel title="WHAT WE DON'T TRACK (YET)">
      <div className="prose-style space-y-3">
        <p>
          Honest scope. Each item is something we&apos;ve looked at and made a
          deliberate call to leave out, not an oversight.
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Solana / Stellar non-EVM chains.</strong>{' '}
            Centrifuge V3 has spoke deployments on both, but they need
            separate SDK integrations we haven&apos;t built. They contribute a
            small fraction of total TVL today — when that changes, we&apos;ll
            add them.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>On-chain holder reads.</strong>{' '}
            The reader is built (<code>lib/data/onchain/holders.ts</code>) but not
            wired to the API routes. A full historical Transfer event scan
            requires ~2,000 <code>eth_getLogs</code> calls and free-tier RPCs
            can&apos;t handle the burst reliably. Holders today are sourced
            from Centrifuge&apos;s indexer, which is reliable for{' '}
            <code>tokenInstancePositions</code> even on tokens where{' '}
            <code>totalIssuance</code> is broken.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Bridge inflow attribution.</strong>{' '}
            We don&apos;t track which chain a deSPXA buyer originally bridged
            from. Doing this properly requires either a paid bridge analytics
            source (Socket, LI.FI, Dune) or building a per-bridge event
            attribution pipeline. Scoped but not built.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Aerodrome routed swaps.</strong>{' '}
            Volume on the deSPXA dex page captures only direct USDC↔deSPXA
            swaps recorded as Swap events on the pool itself. Multi-hop
            routes (e.g. ETH → USDC → deSPXA via the Universal Router) show
            up at the pool only as the final hop. To attribute swaps to
            their originating asset we&apos;d need to parse Universal Router
            events. Most institutional flow is direct USDC anyway, so this
            is a small distortion in practice.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Centrifuge V2 pools.</strong>{' '}
            This dashboard tracks V3 only. V2 pools still exist on Ethereum
            and contribute to DefiLlama&apos;s broader Centrifuge TVL number,
            which is part of why our cross-check shows a small positive gap.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Live oracle prices.</strong>{' '}
            We list Chronicle Proof of Asset and Price Proxy feeds on the
            wrapper detail pages but don&apos;t currently read their on-chain
            values. The integrations are surfaced as references for users,
            not as a price source for our own NAV calculations.
          </li>
        </ul>
      </div>
    </TuiPanel>
  );
}

function Cadence() {
  return (
    <TuiPanel title="UPDATE CADENCE">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Cache TTL</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>/api/overview</code></td>
              <td>5 min</td>
              <td>Most-trafficked page; fresh enough for institutional analytics, slow enough to absorb traffic bursts</td>
            </tr>
            <tr>
              <td><code>/api/pools</code>, <code>/api/derwa</code></td>
              <td>5 min</td>
              <td>Same as overview</td>
            </tr>
            <tr>
              <td><code>/api/derwa/[symbol]</code></td>
              <td>5 min</td>
              <td>Detail pages — same cadence as their list views</td>
            </tr>
            <tr>
              <td><code>/api/protocol-yield</code></td>
              <td>1 hour</td>
              <td>Heavy compute (one tokenSnapshots call per pool); yield is a slow-moving figure</td>
            </tr>
            <tr>
              <td><code>/api/derwa/[symbol]/swaps</code></td>
              <td>1 hour</td>
              <td>~130 chunked eth_getLogs calls on cold cache; daily volume is fine at hourly resolution</td>
            </tr>
            <tr>
              <td><code>/api/tvl-history</code></td>
              <td>1 hour</td>
              <td>DefiLlama updates ~hourly upstream</td>
            </tr>
            <tr>
              <td>Shared on-chain supplies cache</td>
              <td>4 min</td>
              <td>Cross-route consistency — every route within the window sees the same snapshot, preventing the deRWA page disagreeing with the Pools page</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TuiPanel>
  );
}

function CodeReference() {
  return (
    <TuiPanel title="MAINTAINER & ATTRIBUTION">
      <div className="prose-style space-y-3">
        <p style={{ fontSize: 12 }}>
          This dashboard is built and maintained by{' '}
          <Link
            href="https://www.datumlab.xyz"
            style={{ color: 'var(--accent-orange)' }}
          >
            Datum Labs
          </Link>
          . It is independent of Centrifuge: we&apos;re consumers of their
          public APIs and on-chain contracts, not affiliated with the
          protocol team. If a number on this page disagrees with one on
          centrifuge.io, that&apos;s our problem to investigate, not theirs.
        </p>
        <p style={{ fontSize: 12 }}>
          Methodology and data-quality questions: DM{' '}
          <a
            href="https://x.com/0xOptimusPrime"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent-orange)' }}
          >
            @0xOptimusPrime
          </a>{' '}
          on X.
        </p>
      </div>
    </TuiPanel>
  );
}
