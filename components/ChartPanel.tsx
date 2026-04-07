/**
 * Local chart panel — replaces the SDK's ChartWrapper.
 *
 * Differences vs the SDK version:
 *  - No center watermark image (SDK draws a logo image on top of every chart
 *    which is invisible on the dark theme but very obvious on the bright
 *    workstation theme)
 *  - No screenshot button
 *  - No expand/collapse modal
 *  - The chart area is just the children — caller is responsible for sizing
 *
 * Style mirrors `.tui-panel` so it visually matches the rest of the dashboard.
 */

import type { ReactNode } from 'react';

interface ChartPanelProps {
  title: string;
  badge?: string;
  right?: ReactNode;
  height?: string; // tailwind height class, e.g. "h-80"
  children: ReactNode;
}

export function ChartPanel({
  title,
  badge,
  right,
  height = 'h-80',
  children,
}: ChartPanelProps) {
  return (
    <div className="tui-panel">
      <div className="tui-panel-header">
        <div className="flex items-center gap-3">
          <span className="tui-panel-title">{title}</span>
          {badge && <span className="tui-panel-badge">{badge}</span>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      <div className={`p-4 ${height}`}>{children}</div>
    </div>
  );
}
