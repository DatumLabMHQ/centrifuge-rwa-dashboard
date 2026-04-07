'use client';

/**
 * Reusable 7D / 30D / 90D / 365D button group used across pages that show
 * time-windowed data (TVL history, flow of funds, etc.).
 */

export type TimeRange = '7D' | '30D' | '90D' | '365D';

const RANGES: TimeRange[] = ['7D', '30D', '90D', '365D'];

interface TimeSlicerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  ranges?: TimeRange[];
}

export function TimeSlicer({ value, onChange, ranges = RANGES }: TimeSlicerProps) {
  return (
    <div className="inline-flex items-center gap-1">
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          className={`time-btn ${value === r ? 'active' : ''}`}
          onClick={() => onChange(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
