'use client';

/**
 * Inlined from @datumlabs/dashboard-kit
 * Error state with retry button — used by every page when data fetch fails.
 */

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Failed to load data.', onRetry }: ErrorStateProps) {
  return (
    <div className="tui-panel">
      <div className="tui-panel-header">
        <span className="tui-panel-title">Error</span>
        <span className="text-[10px]" style={{ color: 'var(--accent-red)' }}>
          ERR
        </span>
      </div>
      <div className="p-4 lg:p-5">
        <p className="text-xs mb-3" style={{ color: 'var(--accent-red)' }}>
          {message}
        </p>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
          className="text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 rounded transition-colors"
          style={{
            border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)',
            background: 'var(--card)',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
