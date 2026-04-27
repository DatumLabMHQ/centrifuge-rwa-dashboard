'use client';

/**
 * Live verification table for the deRWA wrapper → institutional pool
 * mapping. Renders one row per wrapper showing:
 *   - the on-chain symbol() and name() the contract self-reports
 *   - whether the name() contains the expected fund-name substring
 *   - the institutional token's balanceOf(wrapper) — almost always 0
 *     for these wrappers, surfacing the "no custody" finding inline
 *
 * Powered by /api/wrapper-verification (cached 6h server-side).
 */

import { useQuery } from '@tanstack/react-query';
import { TuiPanel } from '@/components/sdk';
import { formatAddress } from '@/lib/sdk/helpers';

interface WrapperVerificationRow {
  symbol: string;
  expectedInstSymbol: string;
  wrapperAddress: string;
  instAddress: string | null;
  chain: string;
  onchainSymbol: string | null;
  onchainName: string | null;
  expectedNameSubstring: string;
  nameMatches: boolean;
  totalSupplyRaw: string | null;
  instBalanceOfWrapperRaw: string | null;
  custodyModel: 'direct' | 'none' | 'cross-chain' | 'unknown';
  fetchedAt: number;
}

interface VerificationResponse {
  rows: WrapperVerificationRow[];
  cached: boolean;
  ageSeconds: number;
}

async function fetchVerification(): Promise<VerificationResponse> {
  const res = await fetch('/api/wrapper-verification');
  if (!res.ok) throw new Error('Failed to load wrapper verification');
  return res.json();
}

export function WrapperVerificationTable() {
  const q = useQuery<VerificationResponse>({
    queryKey: ['wrapper-verification'],
    queryFn: fetchVerification,
    // Verification rows are immutable per deployment, no need to refetch.
    staleTime: 6 * 60 * 60 * 1000,
  });

  return (
    <div id="wrapper-verification" style={{ scrollMarginTop: 80 }}>
    <TuiPanel
      title="WRAPPER ↔ INSTITUTIONAL MAPPING"
      badge="On-chain self-identification check"
    >
      <div className="prose-style space-y-3 mb-3">
        <p>
          The mapping <em>&ldquo;deSPXA wraps SPXA&rdquo;</em> (and analogous claims for
          deJTRSY, deJAAA, deCRDX) is hardcoded in our token registry,
          sourced originally from Centrifuge&apos;s announcements. To
          guard against the registry going stale or pointing at the
          wrong contract, we call <code>name()</code> and{' '}
          <code>symbol()</code> on each wrapper on-chain and assert
          the result self-identifies the expected fund. Centrifuge&apos;s
          wrappers return descriptive ERC-20 names like{' '}
          <em>&ldquo;DeFi Janus Henderson Anemoy S&P500® Fund Token&rdquo;</em>,
          so a substring check (&ldquo;S&amp;P500&rdquo;,
          &ldquo;Treasury&rdquo;, &ldquo;AAA CLO&rdquo;,
          &ldquo;Diversified Credit&rdquo;) is enough to catch a
          mis-mapping.
        </p>
        <p>
          We also call <code>balanceOf(wrapper)</code> on the institutional
          token contract. <strong>The wrappers do not custody
          institutional shares.</strong> Every wrapper returns a zero
          balance of its corresponding institutional token. The deRWA
          tokens are independent ERC-20s issued by Centrifuge V3, most
          likely as sibling share classes claiming against the same
          pool&apos;s assets, not literal wrapper contracts holding
          underlying tokens 1-for-1. The &ldquo;wrap ratio&rdquo; we
          display elsewhere is therefore a relative size comparison
          between two share classes, not a measure of escrowed supply.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Wrapper</th>
              <th>Verified on chain</th>
              <th>On-chain name()</th>
              <th>Expected substring</th>
              <th>Match</th>
              <th>Custody</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Calling <code>name()</code> on each wrapper…
                </td>
              </tr>
            )}
            {q.isError && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--accent-red)' }}>
                  Failed to load verification.
                </td>
              </tr>
            )}
            {q.data?.rows.map((r) => (
              <tr key={r.symbol}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.symbol}</div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {formatAddress(r.wrapperAddress)}
                  </div>
                </td>
                <td>
                  <div style={{ textTransform: 'capitalize' }}>{r.chain}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Maps to {r.expectedInstSymbol}
                  </div>
                </td>
                <td style={{ maxWidth: 320, fontSize: 11 }}>
                  {r.onchainName ? (
                    <span title={r.onchainName}>&ldquo;{r.onchainName}&rdquo;</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td className="font-mono text-[11px]">{r.expectedNameSubstring}</td>
                <td>
                  {r.nameMatches ? (
                    <Badge tone="green">VERIFIED</Badge>
                  ) : (
                    <Badge tone="red">MISMATCH</Badge>
                  )}
                </td>
                <td>
                  {r.custodyModel === 'direct' ? (
                    <Badge tone="green">DIRECT</Badge>
                  ) : r.custodyModel === 'none' ? (
                    <Badge tone="yellow">NO CUSTODY</Badge>
                  ) : r.custodyModel === 'cross-chain' ? (
                    <Badge tone="muted">CROSS-CHAIN</Badge>
                  ) : (
                    <Badge tone="muted">UNKNOWN</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && (
        <div className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
          Refreshed via batched <code>eth_call</code> against the registered
          chain RPC for each wrapper. Cached server-side for 6 hours since
          deployed contract addresses and{' '}
          <code>name()</code> values are immutable.
          {q.data.cached
            ? ` Served from cache (${Math.round(q.data.ageSeconds)}s old).`
            : ' Fresh fetch.'}
        </div>
      )}
    </TuiPanel>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'red' | 'yellow' | 'muted'; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    green: { bg: 'rgba(46,204,113,0.14)', fg: 'var(--accent-green)' },
    red: { bg: 'rgba(214,50,46,0.14)', fg: 'var(--accent-red)' },
    yellow: { bg: 'rgba(217,119,6,0.16)', fg: 'var(--accent-yellow)' },
    muted: { bg: 'rgba(100,116,139,0.14)', fg: 'var(--text-muted)' },
  };
  const s = styles[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: s.bg,
        color: s.fg,
      }}
    >
      {children}
    </span>
  );
}
