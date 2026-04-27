'use client';

/**
 * Local chart panel — replaces the SDK's ChartWrapper.
 *
 * Now includes Screenshot + Expand actions on every chart:
 *   - Screenshot: html-to-image dynamic import, exports the panel as PNG
 *     at 2x pixel ratio. The action buttons themselves are stripped from
 *     the capture via a `data-chart-action` attribute filter.
 *   - Expand: portal-rendered fullscreen modal that re-renders the same
 *     children at viewport size. Recharts' ResponsiveContainer auto-fits.
 *     Esc / backdrop click / × button to close.
 *
 * Style mirrors `.tui-panel` so it visually matches the rest of the dashboard.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface ChartPanelProps {
  title: string;
  /** Plain text or React node (e.g. an inline badge component). */
  badge?: ReactNode;
  right?: ReactNode;
  height?: string; // tailwind height class, e.g. "h-80"
  children: ReactNode;
  /**
   * Set to false to suppress the Screenshot + Expand actions. Defaults
   * to true. Useful if a panel is wrapping non-chart content.
   */
  actions?: boolean;
}

export function ChartPanel({
  title,
  badge,
  right,
  height = 'h-80',
  children,
  actions = true,
}: ChartPanelProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const onScreenshot = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      // Dynamic import keeps html-to-image out of the initial bundle —
      // most users never click screenshot, and it's ~14KB gzipped.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
        // Skip the action buttons themselves so the screenshot doesn't
        // show "PNG | EXPAND" in the corner of the captured image.
        filter: (node) =>
          !(node as HTMLElement).getAttribute?.('data-chart-action'),
      });
      const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const link = document.createElement('a');
      link.download = `${safeName}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      // Capture failures (cross-origin images, font loading, etc.) shouldn't
      // crash the app — log and let the user retry.
      console.warn('[ChartPanel] screenshot failed:', err);
    }
  }, [title]);

  return (
    <>
      <div className="tui-panel" ref={captureRef}>
        <div className="tui-panel-header">
          <div className="flex items-center gap-3 min-w-0">
            <span className="tui-panel-title">{title}</span>
            {badge && <span className="tui-panel-badge">{badge}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {right}
            {actions && (
              <div data-chart-action className="flex items-center gap-1">
                <ActionButton title="Download as PNG" onClick={onScreenshot}>
                  PNG
                </ActionButton>
                <ActionButton
                  title="Expand chart"
                  onClick={() => setExpanded(true)}
                >
                  ⤢
                </ActionButton>
              </div>
            )}
          </div>
        </div>
        <div className={`p-4 ${height}`}>{children}</div>
      </div>
      {expanded && (
        <ExpandedPanel
          title={title}
          badge={badge}
          onClose={() => setExpanded(false)}
        >
          {children}
        </ExpandedPanel>
      )}
    </>
  );
}

/* ─── Action button ─── */

const ACTION_BUTTON_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '4px 8px',
  borderRadius: 3,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={ACTION_BUTTON_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--accent-orange)';
        e.currentTarget.style.borderColor = 'var(--accent-orange)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {children}
    </button>
  );
}

/* ─── Expanded modal ─── */

function ExpandedPanel({
  title,
  badge,
  children,
  onClose,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  // Esc to close. Bound on mount, cleaned up on unmount so we don't
  // leak listeners across multiple expand/collapse cycles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Render via portal so the modal escapes any parent stacking context
  // (table overflow:hidden, transform: translate, etc.) that would
  // otherwise clip it. Guard for SSR — document is undefined during
  // server render even though this is a client component.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} expanded`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tui-panel"
        style={{
          width: 'min(96vw, 1400px)',
          height: 'min(88vh, 880px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
        }}
      >
        <div className="tui-panel-header">
          <div className="flex items-center gap-3 min-w-0">
            <span className="tui-panel-title">{title}</span>
            {badge && <span className="tui-panel-badge">{badge}</span>}
          </div>
          <ActionButton title="Close (Esc)" onClick={onClose}>
            ✕ Close
          </ActionButton>
        </div>
        <div style={{ flex: 1, padding: 16, minHeight: 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
