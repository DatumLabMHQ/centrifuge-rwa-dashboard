/**
 * Loading — lightweight skeleton using the shell's shimmer animation.
 */
export default function Loading({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="panel" style={{ padding: 24 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--fg-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        <span className="live-pill">
          <span className="dot" /> {message}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 72, borderRadius: 'var(--panel-radius)' }}
          />
        ))}
      </div>
      <div
        className="skeleton"
        style={{ height: 240, borderRadius: 'var(--panel-radius)' }}
      />
    </div>
  );
}
