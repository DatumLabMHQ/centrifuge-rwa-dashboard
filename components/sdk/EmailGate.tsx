'use client';

/**
 * Inlined from @datumlabs/dashboard-kit
 *
 * Newsletter subscription gate — blurs content behind a modal until the user
 * subscribes via Beehiiv. Persists unlock state in localStorage.
 */

import { useState, useEffect, type ReactNode, type FormEvent } from 'react';

export interface EmailGateConfig {
  storageKey?: string;
  subscribeEndpoint?: string;
  dashboardName?: string;
  features?: string[];
  footerText?: string;
}

interface EmailGateProps extends EmailGateConfig {
  children: ReactNode;
}

export function EmailGate({
  children,
  storageKey = 'datumlabs_unlocked',
  subscribeEndpoint = '/api/subscribe',
  dashboardName = 'Dashboard',
  features = [],
  footerText = 'Join the Datum Labs newsletter for full access',
}: EmailGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'true') {
      setUnlocked(true);
    }
  }, [storageKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(subscribeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Subscription failed. Please try again.');
      }
      localStorage.setItem(storageKey, 'true');
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="relative">
      <div
        className="select-none max-h-[500px] overflow-hidden"
        style={{ filter: 'blur(6px)', pointerEvents: 'none' }}
      >
        {children}
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0D0F]/40 backdrop-blur-sm">
        <div className="tui-panel max-w-md w-full mx-4">
          <div className="tui-panel-header">
            <span className="tui-panel-title">Access Required</span>
            <span className="tui-panel-badge">LOCKED</span>
          </div>
          <div className="p-6 space-y-5">
            <div className="text-[11px] space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p>
                <span style={{ color: 'var(--accent-orange)' }}>&gt;</span> Full {dashboardName} access includes:
              </p>
              {features.map((feature, i) => (
                <p key={i} className="pl-4">
                  - {feature}
                </p>
              ))}
              <p className="mt-2">
                <span style={{ color: 'var(--accent-orange)' }}>&gt;</span> Enter email to unlock
                <span className="cursor-blink" />
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div
                className="flex items-center gap-2 rounded px-3 py-2.5 transition-colors"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border-bright)',
                }}
              >
                <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>
                  &gt;
                </span>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-sm placeholder:text-[#6B7280] focus:outline-none"
                  style={{ color: 'var(--foreground)' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full font-bold rounded py-2.5 text-xs uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--accent-orange)',
                  color: '#FFFFFF',
                }}
              >
                {submitting ? 'Authenticating...' : 'Unlock Dashboard'}
              </button>
            </form>
            {error && (
              <p className="text-[11px]" style={{ color: 'var(--accent-red)' }}>
                <span>[ERR]</span> {error}
              </p>
            )}
            <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              {footerText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
