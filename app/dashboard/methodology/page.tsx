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
      <PoolCuration />
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
                Historical TVL series for cross-validation against our
                own number on the Overview page.
              </td>
              <td>Tier 2 · validation only</td>
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
              a per-metric data-quality entry that the page-level aggregators
              also consult to choose which source to display:
              <br />
              <br />
              <strong>For token supply specifically</strong>, the rule prefers
              the indexer&apos;s <code>Token.totalIssuance</code> when the two
              sources agree within 10% — that band catches the cases where
              on-chain has more supply than indexer because the issuer holds
              treasury / pre-mint shares that aren&apos;t allocated to
              investors. Centrifuge&apos;s official dashboard publishes the
              &ldquo;allocated to investors&rdquo; number, so we match it. Beyond 10%
              divergence we fall back to authoritative on-chain (the deSPXA /
              deCRDX-style cases where indexer reports near-zero against
              billions on-chain).
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
              <code>Σ(pools) supply × NAV</code>, where{' '}
              <code>supply</code> is chosen per token via{' '}
              <code>preferredSupply()</code>: indexer&apos;s{' '}
              <code>Token.totalIssuance</code> when sources agree within 10%,
              authoritative on-chain <code>totalSupply()</code> when the
              indexer is broken (deSPXA-style 0 case).
            </>
          }
          notes={[
            'The 10% preference threshold matches Centrifuge\u2019s "circulating supply" convention. Their indexer excludes issuer-held / pre-mint balances from totalIssuance; the chain holds them via totalSupply but they\u2019re not allocated to investors. Deferring to indexer in this band keeps our headline numbers identical to centrifuge.io\u2019s.',
            'When the gap exceeds 10% in either direction we treat the indexer as broken and use authoritative on-chain. This catches deSPXA, deCRDX, SPXA, ArkOdin where indexer reports near-zero issuance against billions of on-chain supply.',
            'Token decimals are read from the indexer (or hardcoded in lib/data/onchain/registry.ts where we manage on-chain reads). JTRSY and JAAA use 6 decimals; everything else uses 18.',
            'NAV is always sourced from the Centrifuge indexer (tokenPrice, scaled by 1e18) — there is no on-chain "NAV" reading because NAV is published off-chain by the asset manager.',
            'Per-chain breakdown stays on-chain authoritative: chainSum may differ from the headline by the issuer-held amount excluded from indexer totalIssuance.',
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

function PoolCuration() {
  return (
    <TuiPanel title="POOL CURATION">
      <div className="prose-style space-y-3">
        <p>
          By default the Pools page and Overview headline counts show the
          same set of pools Centrifuge publishes on their{' '}
          <a
            href="https://app.centrifuge.io/pools"
            target="_blank"
            rel="noreferrer"
          >
            official pools dashboard
          </a>{' '}
          — four institutional RWA tokens (JTRSY, JAAA, ACRDX, SPXA) and
          four freely-transferable wrappers (deJTRSY, deJAAA, deCRDX,
          deSPXA).
        </p>
        <p>
          The Centrifuge V3 indexer reports more pools than this — roughly
          a dozen experimental / test products with names like{' '}
          <code>ArkOdin</code>, <code>ArkTEST</code>, <code>peqTEST</code>,{' '}
          <code>p.two</code>, etc. They&apos;re marked <code>isActive</code>{' '}
          in the indexer but aren&apos;t on Centrifuge&apos;s published
          dashboard, presumably because they&apos;re not investable through
          official channels yet.
        </p>
        <p>
          We hide these by default to keep our headline numbers comparable
          to Centrifuge&apos;s public figures. They&apos;re still a single
          click away — the &ldquo;See all pools&rdquo; toggle on the Pools
          page reveals every pool the indexer reports.
        </p>
        <p style={{ fontSize: 12 }}>
          The curated allowlist lives in{' '}
          <code>lib/data/curation.ts</code>. Adding a new production pool
          is a one-line append; the rest of the UI picks it up
          automatically.
        </p>
      </div>
    </TuiPanel>
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
      <div className="prose-style space-y-3" style={{ marginBottom: 14 }}>
        <p>
          All API routes use <strong>stale-while-revalidate (SWR)</strong>{' '}
          backed by Vercel KV (Redis). When you load a page:
        </p>
        <ol style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 12 }}>
          <li>
            <strong>Cache hit + fresh</strong> (within the TTL below) → response is
            served from KV instantly
          </li>
          <li>
            <strong>Cache hit + stale</strong> (within 4× TTL) → stale response is
            served instantly AND a background refresh fires; next visitor
            gets the fresh result
          </li>
          <li>
            <strong>Cache miss / fully expired</strong> → fresh fetch, written to
            KV, returned. This is the only path that&apos;s slow, and only happens
            after a long idle window or a fresh deploy
          </li>
        </ol>
        <p style={{ fontSize: 12 }}>
          Net result: users almost never wait for a chart to load. The
          slow on-chain Swap event scan (~130 RPC calls) runs in the
          background out of view; the previous response is rendered
          immediately.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Fresh TTL</th>
              <th>Stale TTL (background refresh)</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>/api/overview</code></td>
              <td>5 min</td>
              <td>20 min</td>
              <td>Most-trafficked page; fresh enough for institutional analytics, slow enough to absorb traffic bursts</td>
            </tr>
            <tr>
              <td><code>/api/pools</code>, <code>/api/derwa</code></td>
              <td>5 min</td>
              <td>20 min</td>
              <td>Same as overview</td>
            </tr>
            <tr>
              <td><code>/api/derwa/[symbol]</code></td>
              <td>5 min</td>
              <td>20 min</td>
              <td>Detail pages — same cadence as their list views</td>
            </tr>
            <tr>
              <td><code>/api/derwa/[symbol]/swaps</code></td>
              <td>30 min</td>
              <td>4 hours</td>
              <td>~130 chunked eth_getLogs calls on cold cache; we keep stale data usable longer because the cold path is the most expensive</td>
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
