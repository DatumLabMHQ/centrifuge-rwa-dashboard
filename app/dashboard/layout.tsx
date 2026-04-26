import { Suspense } from 'react';
import CentrifugeShell from '@/components/shell/CentrifugeShell';
import EmailGate from '@/components/shell/EmailGate';
import PathSync from '@/components/shell/PathSync';

const DASHBOARD_NAME = 'Centrifuge RWA Terminal';

const SECTIONS = [
  {
    label: 'Terminals',
    items: [
      { href: '/dashboard/overview', label: 'Overview', icon: '◆' },
      { href: '/dashboard/pools', label: 'Pools', icon: '▦' },
      { href: '/dashboard/flow', label: 'Flow of Funds', icon: '≈' },
      { href: '/dashboard/derwa', label: 'deRWA', icon: '◈' },
      { href: '/dashboard/investors', label: 'Investors', icon: '§' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { href: '/dashboard/methodology', label: 'Methodology', icon: '¶' },
    ],
  },
];

/**
 * Dashboard layout — wraps every /dashboard/* route in:
 *  - EmailGate (production only — dev is never gated)
 *  - CentrifugeShell (topbar + sidebar + ticker + statusbar)
 *
 * Gate and shell both read body data-attrs for theme/density, which the
 * inline boot script in app/layout.tsx sets before React hydrates.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <EmailGate
      dashboardName={DASHBOARD_NAME}
      disabled={isDev}
      features={[
        'Real-time TVL across 9 Centrifuge V3 chains',
        'Pool-by-pool flow of funds (deposits / redemptions)',
        'deRWA composability tracker (deJTRSY, deJAAA, deCRDX, deSPXA)',
        'On-chain Swap event tracking, validated against on-chain reads',
      ]}
    >
      <CentrifugeShell dashboardName={DASHBOARD_NAME} sections={SECTIONS}>
        {/* PathSync is wrapped in <Suspense> because it reads useSearchParams,
            which Next 16 requires be inside a Suspense boundary so the page
            can pre-render the rest. */}
        <Suspense fallback={null}>
          <PathSync />
        </Suspense>
        {children}
      </CentrifugeShell>
    </EmailGate>
  );
}
