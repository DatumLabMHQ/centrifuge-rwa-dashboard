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
}

export function PanelSkeleton({ height = 'h-72', label }: PanelSkeletonProps) {
  return (
    <div className="tui-panel">
      <div className="tui-panel-header">
        <span className="tui-panel-title">{label ?? 'Loading'}</span>
        <span className="tui-panel-badge">fetching…</span>
      </div>
      <div className={`p-4 ${height}`}>
        <div className="h-full w-full skeleton rounded" />
      </div>
    </div>
  );
}
