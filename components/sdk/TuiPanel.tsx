'use client';

/**
 * Inlined from @datumlabs/dashboard-kit
 *
 * Terminal-UI styled panel wrapper. The core layout primitive used across
 * the dashboard. Renders a card with an orange-accented header bar, optional
 * badge, and content area.
 */

import type { ReactNode } from 'react';

interface TuiPanelProps {
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function TuiPanel({
  title,
  badge,
  children,
  className = '',
  noPadding = false,
}: TuiPanelProps) {
  return (
    <div className={`tui-panel ${className}`}>
      <div className="tui-panel-header">
        <span className="tui-panel-title">{title}</span>
        {badge && <span className="tui-panel-badge">{badge}</span>}
      </div>
      <div className={noPadding ? '' : 'p-4 lg:p-5'}>{children}</div>
    </div>
  );
}
