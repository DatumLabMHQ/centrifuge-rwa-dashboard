import Link from 'next/link';
import { formatCurrency } from '@/lib/format';

interface ChainSumNoteProps {
  /** Sum of TVL across the per-chain breakdown rows. */
  chainSumUsd: number;
  /** Headline TVL for the same token (matches Centrifuge). */
  headlineUsd: number;
}

/**
 * Inline note that explains a gap between the per-chain sum and the
 * headline TVL.
 *
 * The gap appears when Centrifuge's indexer reports a smaller
 * "circulating supply" than what's actually on-chain — typically because
 * the issuer holds treasury / pre-mint shares that aren't allocated to
 * investors yet. We use the indexer number for the headline (matches
 * Centrifuge's official dashboard) and the on-chain number for the
 * per-chain breakdown (the indexer's per-chain values are unreliable).
 *
 * Renders nothing when the two sums agree within 0.5% — at that scale
 * it's just rounding noise and the note would be visual clutter.
 */
export function ChainSumNote({ chainSumUsd, headlineUsd }: ChainSumNoteProps) {
  if (headlineUsd <= 0 || chainSumUsd <= 0) return null;
  const gap = chainSumUsd - headlineUsd;
  const pct = Math.abs(gap) / headlineUsd;
  if (pct < 0.005) return null;

  // Positive gap = chain-sum exceeds headline = issuer holds extra supply
  // on-chain that the indexer doesn't count as circulating. This is the
  // common case (JTRSY, etc).
  // Negative gap = chain-sum is below headline = chain reads incomplete
  // (RPC failures), indexer captured more than on-chain.
  const isExcess = gap > 0;
  const formatted = formatCurrency(Math.abs(gap));

  return (
    <div
      className="text-[11px]"
      style={{
        color: 'var(--text-muted)',
        marginTop: 8,
        padding: '8px 10px',
        background: 'rgba(255, 107, 53, 0.06)',
        border: '1px solid rgba(255, 107, 53, 0.18)',
        borderRadius: 4,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: 'var(--accent-orange)' }}>
        Note: chain sum is {isExcess ? `${formatted} above` : `${formatted} below`} the headline TVL.
      </strong>{' '}
      {isExcess ? (
        <>
          The headline matches Centrifuge&apos;s &ldquo;circulating
          supply&rdquo; (allocated to investors). The extra on-chain
          supply is issuer-held treasury / pre-mint not yet distributed.{' '}
          <Link href="/dashboard/methodology" style={{ color: 'var(--accent-orange)' }}>
            Methodology →
          </Link>
        </>
      ) : (
        <>
          The on-chain reads were partial (one or more chain RPCs failed).
          The headline uses the indexer&apos;s authoritative aggregate
          while we wait for the failed reads to recover.
        </>
      )}
    </div>
  );
}
