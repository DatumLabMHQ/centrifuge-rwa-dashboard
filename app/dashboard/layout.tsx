'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EmailGate } from '@datumlabs/dashboard-kit';
import { TickerBar } from '@/components/TickerBar';

const navItems = [
  { href: '/dashboard/overview', label: 'Overview' },
  { href: '/dashboard/pools', label: 'Pools' },
  { href: '/dashboard/flow', label: 'Flow of Funds' },
  { href: '/dashboard/derwa', label: 'deRWA' },
  { href: '/dashboard/investors', label: 'Investors' },
];

const DASHBOARD_TITLE = 'Centrifuge RWA Terminal';
const CONTAINER = 'max-w-[1600px] mx-auto px-4 lg:px-8';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      className="min-h-screen font-mono flex flex-col"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      {/* Top Navigation Bar */}
      <nav
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        <div className={`${CONTAINER} flex items-center justify-between h-14`}>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/icon.png"
              alt="Datum Labs"
              width={28}
              height={28}
              className="rounded"
            />
            <div className="flex flex-col leading-tight">
              <span
                className="text-[13px] font-bold tracking-tight"
                style={{ color: 'var(--foreground)' }}
              >
                {DASHBOARD_TITLE}
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--text-muted)' }}
              >
                by datumlabs
              </span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] rounded transition-colors font-semibold"
                  style={{
                    color: isActive ? 'var(--accent-orange)' : 'var(--text-muted)',
                    background: isActive ? 'var(--accent-orange-soft)' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <span
            className="hidden md:inline-flex items-center gap-2 text-[10px] font-semibold"
            style={{ color: 'var(--accent-green)' }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--accent-green)' }}
            />
            LIVE
          </span>
        </div>
      </nav>

      {/* Mobile Nav */}
      <div
        className="md:hidden flex items-center gap-1 px-4 py-2 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--card)' }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded whitespace-nowrap transition-colors font-semibold"
              style={{
                color: isActive ? 'var(--accent-orange)' : 'var(--text-muted)',
                background: isActive ? 'var(--accent-orange-soft)' : 'transparent',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Bloomberg-style ticker bar */}
      <div className={`${CONTAINER} pt-4`}>
        <TickerBar />
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {process.env.NODE_ENV === 'production' ? (
          <EmailGate
            dashboardName="Centrifuge RWA Terminal"
            subscribeEndpoint="/api/subscribe"
            features={[
              'Real-time TVL across 9 Centrifuge V3 chains',
              'Pool-by-pool flow of funds (deposits / redemptions)',
              'deRWA composability tracker (deJTRSY, deJAAA, deCRDX, deSPXA)',
              'DefiLlama cross-source validation',
            ]}
          >
            <div className={`${CONTAINER} py-6`}>{children}</div>
          </EmailGate>
        ) : (
          <div className={`${CONTAINER} py-6`}>{children}</div>
        )}
      </main>

      {/* Status Bar */}
      <div
        className="flex items-center justify-between px-4 lg:px-8 h-8 text-[10px] mt-4"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text-muted)',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>›</span>
          <span>centrifuge.io</span>
          <span>·</span>
          <span>Centrifuge GraphQL · DefiLlama · IPFS metadata</span>
        </div>
        <span>Powered by DatumLabs</span>
      </div>
    </div>
  );
}
