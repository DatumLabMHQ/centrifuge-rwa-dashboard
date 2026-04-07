/**
 * Standardized page header — title, subtitle, and an optional right-aligned
 * slot (typically a badge or time slicer). Used at the top of every dashboard
 * page so they share the same vertical rhythm.
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4 pt-2">
      <div>
        <h1
          className="text-[22px] font-bold tracking-tight"
          style={{ color: 'var(--foreground)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-[12px] mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
