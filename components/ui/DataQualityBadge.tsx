import type { DataQualityEntry, DataQualityLevel, DataQualityReport } from '@/lib/data/types';

const LEVEL_STYLES: Record<DataQualityLevel, { bg: string; fg: string; label: string }> = {
  ok: {
    bg: 'rgba(46, 204, 113, 0.14)',
    fg: 'var(--green)',
    label: 'VERIFIED',
  },
  degraded: {
    bg: 'rgba(217, 119, 6, 0.16)',
    fg: 'var(--yellow)',
    label: 'DEGRADED',
  },
  broken: {
    bg: 'rgba(214, 50, 46, 0.14)',
    fg: 'var(--red)',
    label: 'BROKEN',
  },
};

interface DataQualityBadgeProps {
  /** Single-token payload (per-wrapper pages). */
  entry?: DataQualityEntry | null;
  /** Full report — when passed, the badge shows the worst level found. */
  report?: DataQualityReport | null;
  /** Override the visible label. */
  labelOverride?: string;
  /** Tooltip placement hint for small badges. */
  size?: 'sm' | 'md';
}

/**
 * Tier 1 vs Tier 2 data-quality badge. Pass either a single-token `entry`
 * (wrapper detail page) or a `report` (overview / pools / derwa index) —
 * in the report case the badge surfaces the worst level present so users
 * see the warning at a glance.
 *
 * Hover reveals the reconciliation detail (on-chain vs indexer number).
 */
export default function DataQualityBadge({
  entry,
  report,
  labelOverride,
  size = 'sm',
}: DataQualityBadgeProps) {
  const { level, tooltip } = resolve(entry, report);
  const style = LEVEL_STYLES[level];
  const label = labelOverride ?? style.label;

  return (
    <span
      title={tooltip}
      className="dq-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: size === 'sm' ? 10 : 11,
        letterSpacing: '0.08em',
        fontWeight: 600,
        padding: size === 'sm' ? '3px 8px' : '4px 10px',
        borderRadius: 3,
        background: style.bg,
        color: style.fg,
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
          background: style.fg,
          boxShadow: `0 0 0 2px ${style.bg}`,
        }}
      />
      {label}
    </span>
  );
}

/**
 * Resolve which level + tooltip to render. For reports, the badge takes on
 * the worst level (broken > degraded > ok). Tooltip lists problem symbols.
 */
function resolve(
  entry: DataQualityEntry | null | undefined,
  report: DataQualityReport | null | undefined,
): { level: DataQualityLevel; tooltip: string } {
  if (entry) {
    return {
      level: entry.quality,
      tooltip: formatEntryTooltip(entry),
    };
  }
  if (report) {
    const s = report.summary;
    const level: DataQualityLevel = s.hasBroken ? 'broken' : s.degraded > 0 ? 'degraded' : 'ok';
    const badTokens = Object.values(report.tokens)
      .filter((t) => t.quality !== 'ok')
      .slice(0, 8)
      .map((t) => `• ${t.symbol}: ${t.message}`)
      .join('\n');
    const header =
      level === 'ok'
        ? `All ${s.total} tokens reconciled cleanly against on-chain state.`
        : `${s.broken + s.degraded} of ${s.total} tokens have data-quality issues:\n`;
    return {
      level,
      tooltip: badTokens ? `${header}\n${badTokens}` : header,
    };
  }
  return {
    level: 'ok',
    tooltip: 'Data quality unavailable.',
  };
}

function formatEntryTooltip(e: DataQualityEntry): string {
  const src =
    e.source === 'onchain'
      ? 'Source: on-chain read (Tier 1, authoritative)'
      : e.source === 'indexer'
      ? 'Source: Centrifuge indexer (Tier 2, fallback)'
      : 'Source: none available';
  const divLine =
    e.source === 'onchain' || e.source === 'indexer'
      ? `On-chain: ${e.onchainSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}  •  Indexer: ${e.indexerIssuance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : '';
  const chainLine =
    e.chainsOk + e.chainsFailed > 0
      ? `Chains: ${e.chainsOk} ok / ${e.chainsFailed} failed`
      : '';
  return [e.message, divLine, chainLine, src].filter(Boolean).join('\n');
}
