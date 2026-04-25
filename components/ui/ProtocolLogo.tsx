'use client';

import { useState } from 'react';

/**
 * Map of protocol-name → DefiLlama icon slug. Names match the strings
 * stored in `lib/data/derwa-context.ts:integrations[].protocol` so the
 * component can be passed a row's protocol verbatim.
 *
 * We use DefiLlama's CDN (`icons.llamao.fi/icons/protocols/<slug>`) for
 * the same reasons we use it for chain logos: stable URL convention,
 * comprehensive coverage, no maintenance overhead. Failures fall through
 * to a colored letter-pill fallback below.
 */
const PROTOCOL_ICON_SLUG: Record<string, string> = {
  Aerodrome: 'aerodrome',
  Morpho: 'morpho',
  Euler: 'euler',
  // Both Chronicle feed types use the same Chronicle Labs logo.
  'Chronicle Proof of Asset': 'chronicle',
  'Chronicle Price Proxy': 'chronicle',
  Chronicle: 'chronicle',
  // Future entries add here.
};

/** Per-kind fallback color when we don't have a logo for the protocol. */
const KIND_COLOR: Record<string, string> = {
  lending: '#9333EA',
  dex: '#2563EB',
  oracle: '#CA8A04',
  wallet: '#64748B',
  cex: '#0EA5E9',
};

function protocolIconUrl(protocol: string, size = 32): string | null {
  const slug = PROTOCOL_ICON_SLUG[protocol];
  if (!slug) return null;
  return `https://icons.llamao.fi/icons/protocols/${slug}?w=${size}&h=${size}`;
}

interface ProtocolLogoProps {
  /** Protocol name as stored in derwa-context.ts (e.g. "Aerodrome"). */
  protocol: string;
  /** Integration kind — drives the fallback color when no logo is found. */
  kind?: string;
  /** Pixel size of the logo. Default 32 (matches IntegrationBadge dims). */
  size?: number;
}

/**
 * Square logo badge for an integrated protocol. Shows the protocol's logo
 * when known, falls back to a colored letter pill (first 3 chars of the
 * integration kind) when not.
 *
 * Used on the deSPXA detail page (DeFi Activity rows + Oracle Feeds rows)
 * and anywhere else we render a protocol identity. Mirrors the existing
 * IntegrationBadge sizing (8×8) so it's a drop-in replacement.
 */
export function ProtocolLogo({ protocol, kind, size = 32 }: ProtocolLogoProps) {
  const url = protocolIconUrl(protocol, size * 2);
  const [errored, setErrored] = useState(false);

  if (!url || errored) {
    const color = KIND_COLOR[kind ?? ''] ?? '#64748B';
    return (
      <span
        className="inline-flex items-center justify-center rounded text-white font-bold uppercase"
        style={{
          width: size,
          height: size,
          background: color,
          fontSize: Math.round(size * 0.28),
          letterSpacing: 0.5,
        }}
        title={protocol}
      >
        {(kind ?? protocol).slice(0, 3)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={protocol}
      title={protocol}
      width={size}
      height={size}
      style={{
        display: 'block',
        borderRadius: 6,
        objectFit: 'cover',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
      onError={() => setErrored(true)}
    />
  );
}

/**
 * Compact logo stack for cells that need to show several integrations at
 * once (e.g. an "Integrations" column in the wrapper comparison table).
 * Up to `max` logos render directly; the rest collapse into a "+N" pill
 * with a hover tooltip naming the overflow protocols.
 */
interface ProtocolStackProps {
  protocols: Array<{ protocol: string; kind?: string }>;
  size?: number;
  max?: number;
}

export function ProtocolStack({
  protocols,
  size = 24,
  max = 4,
}: ProtocolStackProps) {
  if (protocols.length === 0) return null;
  const shown = protocols.slice(0, max);
  const overflow = protocols.slice(max);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {shown.map((p) => (
        <ProtocolLogo
          key={`${p.protocol}-${p.kind ?? ''}`}
          protocol={p.protocol}
          kind={p.kind}
          size={size}
        />
      ))}
      {overflow.length > 0 && (
        <span
          title={overflow.map((p) => p.protocol).join(', ')}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--fg-muted)',
            padding: '0 6px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--surface)',
            cursor: 'help',
            lineHeight: `${size}px`,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          +{overflow.length}
        </span>
      )}
    </span>
  );
}
