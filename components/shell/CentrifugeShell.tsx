'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { TickerBar } from '@/components/TickerBar';
import { DEFAULTS, TWEAK_KEYS, type Aesthetic, type Density, type Theme } from './tweaks-context';

interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface CentrifugeShellProps {
  dashboardName: string;
  sections: NavSection[];
  children: React.ReactNode;
}

/**
 * CentrifugeShell — topbar / sidebar / main / statusbar port of the SDK
 * shell, tailored for the Centrifuge RWA terminal. The ticker bar lives
 * inside the main content area so it stays visible as operators navigate
 * between pages.
 */
export default function CentrifugeShell({
  dashboardName,
  sections,
  children,
}: CentrifugeShellProps) {
  const pathname = usePathname();

  const [theme, setTheme] = useState<Theme>(DEFAULTS.theme);
  const [aesthetic, setAesthetic] = useState<Aesthetic>(DEFAULTS.aesthetic);
  const [density, setDensity] = useState<Density>(DEFAULTS.density);

  // Hydrate from localStorage after mount (server HTML uses defaults; the
  // inline script in app/layout.tsx beats us to the paint).
  useEffect(() => {
    const t = (localStorage.getItem(TWEAK_KEYS.theme) as Theme) ?? DEFAULTS.theme;
    const a = (localStorage.getItem(TWEAK_KEYS.aesthetic) as Aesthetic) ?? DEFAULTS.aesthetic;
    const d = (localStorage.getItem(TWEAK_KEYS.density) as Density) ?? DEFAULTS.density;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    setAesthetic(a);
    setDensity(d);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.dataset.aesthetic = aesthetic;
    document.body.dataset.density = density;
    localStorage.setItem(TWEAK_KEYS.theme, theme);
    localStorage.setItem(TWEAK_KEYS.aesthetic, aesthetic);
    localStorage.setItem(TWEAK_KEYS.density, density);
  }, [theme, aesthetic, density]);

  // Vibe-only status bar ticker.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(id);
  }, []);
  const block = useMemo(() => 20_482_193 + tick, [tick]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/dashboard/overview" className="topbar-brand">
            <Image
              src="/branding/icon.png"
              alt="Datum Labs"
              width={22}
              height={22}
              style={{ borderRadius: 4 }}
            />
            <span className="topbar-brand-name">
              datum<span style={{ color: 'var(--orange)' }}>labs</span>
            </span>
          </Link>
          <span className="topbar-terminal">
            <span className="prompt">❯</span>
            <span>{dashboardName}</span>
          </span>
        </div>
        <div className="topbar-right">
          <span className="live-pill">
            <span className="dot" /> LIVE
          </span>
          <div className="theme-toggle" role="tablist" aria-label="Theme">
            <button
              className={theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
              title="Light"
              type="button"
            >
              <Sun size={12} />
            </button>
            <button
              className={theme === 'dark' ? 'active' : ''}
              onClick={() => setTheme('dark')}
              title="Dark"
              type="button"
            >
              <Moon size={12} />
            </button>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        {sections.map((sec) => (
          <div key={sec.label}>
            <div className="sidebar-section-label">{sec.label}</div>
            {sec.items.map((it) => {
              const active =
                pathname === it.href || (it.href !== '/' && pathname?.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                >
                  {it.icon && <span className="nav-icon">{it.icon}</span>}
                  <span>{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <div
          style={{
            marginTop: 'auto',
            padding: '16px 10px 8px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--fg-dim)',
              letterSpacing: '0.1em',
            }}
          >
            BUILT WITH
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--fg-muted)',
              marginTop: 3,
            }}
          >
            @datumlabs/<span style={{ color: 'var(--orange)' }}>dashboard-kit</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <div style={{ marginBottom: 16 }}>
          <TickerBar />
        </div>
        {children}
      </main>

      <footer className="statusbar">
        <div className="left">
          <span style={{ color: 'var(--orange)' }}>❯</span>
          <span>centrifuge.io</span>
          <span className="sep">│</span>
          <span>
            cache: <span style={{ color: 'var(--green)' }}>healthy</span>
          </span>
          <span className="sep">│</span>
          <span>sources: Centrifuge GraphQL · DefiLlama · IPFS</span>
        </div>
        <div className="right">
          <span>block #{block.toLocaleString()}</span>
          <span className="sep">│</span>
          <span>Powered by DatumLabs</span>
        </div>
      </footer>
    </div>
  );
}
