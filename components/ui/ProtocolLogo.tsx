'use client';

import { useState } from 'react';

/**
 * Map of protocol-name → logo source. Names match the strings stored in
 * `lib/data/derwa-context.ts:integrations[].protocol` so the component
 * can be passed a row's protocol verbatim.
 *
 * Two value forms are accepted:
 *   - Bare slug (e.g. `'aerodrome'`) → resolves to DefiLlama's CDN at
 *     `icons.llamao.fi/icons/protocols/<slug>`. We default to this
 *     because the URL convention is stable and covers most protocols.
 *   - Full URL (must start with `http://` or `https://`) → used as-is.
 *     Use this when DefiLlama's slug points at a *different* protocol
 *     with the same name, or when we want the official brand asset.
 *
 * Anything not in this map falls through to a colored letter-pill
 * fallback below.
 */
const PROTOCOL_ICON_SLUG: Record<string, string> = {
  Aerodrome: 'aerodrome',
  Morpho: 'morpho',
  Euler: 'euler',
  // DefiLlama's "chronicle" icon points at an unrelated project. Use
  // the official Chronicle Labs logo from chroniclelabs.org directly.
  // Both PoA and Price Proxy feeds use the same parent brand mark.
  'Chronicle Proof of Asset':
    'https://chroniclelabs.org/_next/static/media/Chronicle%20logo%20green.50e6db12.svg',
  'Chronicle Price Proxy':
    'https://chroniclelabs.org/_next/static/media/Chronicle%20logo%20green.50e6db12.svg',
  Chronicle:
    'https://chroniclelabs.org/_next/static/media/Chronicle%20logo%20green.50e6db12.svg',
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
  const value = PROTOCOL_ICON_SLUG[protocol];
  if (!value) return null;
  // Full URL passed through as-is (e.g. official brand asset). Otherwise
  // treat as a DefiLlama slug.
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `https://icons.llamao.fi/icons/protocols/${value}?w=${size}&h=${size}`;
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
