interface ErrorMsgProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorMsg({
  message = 'Something went wrong loading this view.',
  onRetry,
}: ErrorMsgProps) {
  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--red)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--red)',
          }}
        >
          Error
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: onRetry ? 14 : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="dropdown-trigger"
          style={{
            background: 'var(--orange)',
            borderColor: 'var(--orange)',
            color: 'white',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
