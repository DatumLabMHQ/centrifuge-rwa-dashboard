import type { ReactNode } from 'react';

interface MetricProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' };
}

/**
 * Metric — single KPI cell. Typically rendered in a row inside a `Panel`
 * with `flush` so the vertical borders join up cleanly.
 */
export default function Metric({ label, value, delta }: MetricProps) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {delta && (
        <div className="metric-label" style={{ color: delta.direction === 'up' ? 'var(--green)' : 'var(--red)' }}>
          {delta.direction === 'up' ? '▲' : '▼'} {delta.value}
        </div>
      )}
    </div>
  );
}
