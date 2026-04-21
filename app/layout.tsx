import type { Metadata } from 'next';
import { JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-next',
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-next',
});

export const metadata: Metadata = {
  title: 'Centrifuge RWA Terminal — Datum Labs',
  description:
    'Real-time flow-of-funds analytics for Centrifuge V3 — TVL, pools, deposits, redemptions, deRWA composability.',
};

/**
 * Pre-paint script — reads saved theme / aesthetic / density from
 * localStorage and sets body data-attrs before React mounts, so the first
 * frame matches the user's last session (no theme flash).
 */
const THEME_BOOT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('datumlabs.theme') || 'light';
    var a = localStorage.getItem('datumlabs.aesthetic') || 'evolved';
    var d = localStorage.getItem('datumlabs.density') || 'cozy';
    document.body.dataset.theme = t;
    document.body.dataset.aesthetic = a;
    document.body.dataset.density = d;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        data-theme="light"
        data-aesthetic="evolved"
        data-density="cozy"
        className={`${jetbrainsMono.variable} ${ibmPlex.variable} antialiased min-h-screen`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
