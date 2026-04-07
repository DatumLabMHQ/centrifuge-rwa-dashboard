import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Centrifuge RWA Terminal — Datum Labs',
  description:
    'Real-time flow-of-funds analytics for Centrifuge V3 — TVL, pools, deposits, redemptions, deRWA composability.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${jetbrainsMono.variable} font-mono antialiased min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
