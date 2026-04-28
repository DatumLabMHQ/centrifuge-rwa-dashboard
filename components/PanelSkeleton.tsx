/**
 * Subtle inline loading state — used in place of the SDK's full-page
 * `LoadingState` so navigating to a page with no cached data doesn't
 * replace the entire layout with a generic skeleton.
 *
 * Renders a panel-shaped placeholder of a specified height. Always pair
 * with a real `PageHeader` above so the page chrome stays put.
 */

interface PanelSkeletonProps {
  /** Tailwind height class, e.g. "h-80". Defaults to h-72. */
  height?: string;
  /** Optional label to render at the top of the skeleton. */
  label?: string;
  /**
   * Optional context line shown inside the skeleton. Use for slow loads
   * where a generic "fetching…" badge undersells the work — e.g.
   * `"On-chain Swap event scan · ~10s on cold cache"` so the user knows
   * the wait is real work, not a hung request.
   */
  description?: string;
}

export function PanelSkeleton({
  height = 'h-72',
  label,
  description,
}: PanelSkeletonProps) {
  return (
    <div className="tui-panel">
      <div className="tui-panel-header">
        <span className="tui-panel-title">{label ?? 'Loading'}</span>
        <span className="tui-panel-badge">fetching…</span>
      </div>
      <div className={`p-4 ${height} relative`}>
        <div className="h-full w-full skeleton rounded" />
        {description && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {/* Translucent panel-coloured pill so the description reads
                 against both the light skeleton (light theme) and the
                 darker skeleton (dark theme). bg-white/80 was light-only
                 and made the pill glow weirdly in dark mode. */}
            <span
              className="text-[11px] font-mono px-3 py-1.5 rounded border"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--border)',
                opacity: 0.92,
              }}
            >
              {description}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
