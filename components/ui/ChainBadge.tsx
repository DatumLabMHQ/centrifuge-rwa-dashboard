'use client';

import { useState } from 'react';

/**
 * Map of chain name → DefiLlama icon URL slug. Centrifuge's indexer reports
 * chains with these names; we standardize to the slugs DefiLlama publishes.
 *
 * For chains not on DefiLlama's CDN (Pharos, Monad in some windows) we fall
 * back to the colored-dot version of `.chain-badge` from globals.css.
 */
const CHAIN_ICON_SLUG: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  avalanche: 'avalanche',
  optimism: 'optimism',
  plume: 'plume',
  binance: 'binance',
  bsc: 'bsc',
  monad: 'monad',
};

/**
 * Pretty display name. The indexer uses lowercase keys; users expect
 * "Ethereum" not "ethereum" in the UI.
 */
const CHAIN_DISPLAY: Record<string, string> = {
  ethereum: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  avalanche: 'Avalanche',
  optimism: 'Optimism',
  plume: 'Plume',
  binance: 'BNB Chain',
  bsc: 'BNB Chain',
  monad: 'Monad',
  pharos: 'Pharos',
};

function chainIconUrl(name: string, size = 20): string | null {
  const slug = CHAIN_ICON_SLUG[name.toLowerCase()];
  if (!slug) return null;
  return `https://icons.llamao.fi/icons/chains/rsz_${slug}?w=${size}&h=${size}`;
}

interface ChainBadgeProps {
  /** Chain name as reported by the indexer (lowercase preferred). */
  chain: string;
  /** Show the chain's display name next to the icon. */
  showLabel?: boolean;
  /** Icon size in px. Default 16. */
  size?: number;
  /** Override the displayed name (for cases like "Ethereum (mainnet)"). */
  label?: string;
}

/**
 * Visual badge for a single chain. Renders the chain logo when available
 * (via DefiLlama's CDN), with a colored-dot fallback for chains not on
 * the CDN. Falls back to the existing `.chain-badge` class so styling
 * stays consistent if the image fails to load at runtime.
 */
export function ChainBadge({
  chain,
  showLabel = true,
  size = 16,
  label,
}: ChainBadgeProps) {
  const normalized = chain.toLowerCase();
  const url = chainIconUrl(normalized, size * 2);
  const display = label ?? CHAIN_DISPLAY[normalized] ?? chain;
  const [errored, setErrored] = useState(false);

  // No icon hosted, or image failed to load → fall back to the colored
  // dot version (existing CSS handles per-chain colors).
  if (!url || errored) {
    return (
      <span className={`chain-badge ${normalized}`}>
        {showLabel && display}
      </span>
    );
  }

  return (
    <span
      className="chain-badge-icon"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: showLabel ? '2px 8px 2px 4px' : '2px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        border: '1px solid var(--border)',
        borderRadius: 3,
        color: 'var(--fg-muted)',
        background: 'var(--surface)',
        fontWeight: 600,
        lineHeight: 1,
      }}
      title={display}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={display}
        width={size}
        height={size}
        style={{
          display: 'block',
          borderRadius: '50%',
          objectFit: 'cover',
        }}
        onError={() => setErrored(true)}
      />
      {showLabel && display}
    </span>
  );
}

/**
 * Render a small stack of chain logos (no labels). For tables where the
 * chains column would otherwise wrap badly with multiple labeled badges.
 *
 * Up to 5 logos render directly, the rest collapse to a "+N" indicator
 * with a tooltip listing the overflow.
 */
interface ChainStackProps {
  chains: string[];
  size?: number;
  /** Max number of icons to render before collapsing to "+N". Default 5. */
  max?: number;
}

export function ChainStack({ chains, size = 18, max = 5 }: ChainStackProps) {
  if (chains.length === 0) return null;
  const shown = chains.slice(0, max);
  const overflow = chains.slice(max);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {shown.map((chain) => {
        const url = chainIconUrl(chain.toLowerCase(), size * 2);
        const display = CHAIN_DISPLAY[chain.toLowerCase()] ?? chain;
        if (!url) {
          // No icon → small colored dot using existing chain-badge color.
          return (
            <span
              key={chain}
              className={`chain-badge ${chain.toLowerCase()}`}
              style={{ padding: 0, border: 'none', background: 'transparent' }}
              title={display}
            />
          );
        }
        return (
          <ChainIcon
            key={chain}
            url={url}
            display={display}
            size={size}
            chain={chain.toLowerCase()}
          />
        );
      })}
      {overflow.length > 0 && (
        <span
          title={overflow.map((c) => CHAIN_DISPLAY[c.toLowerCase()] ?? c).join(', ')}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--fg-muted)',
            padding: '2px 6px',
            border: '1px solid var(--border)',
            borderRadius: 9,
            background: 'var(--surface)',
            cursor: 'help',
            lineHeight: 1,
          }}
        >
          +{overflow.length}
        </span>
      )}
    </span>
  );
}

/**
 * Individual icon image with onError fallback to a colored dot. Extracted
 * so the parent component doesn't re-render the whole stack on one image's
 * load failure.
 */
function ChainIcon({
  url,
  display,
  size,
  chain,
}: {
  url: string;
  display: string;
  size: number;
  chain: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span
        className={`chain-badge ${chain}`}
        style={{ padding: 0, border: 'none', background: 'transparent' }}
        title={display}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={display}
      width={size}
      height={size}
      title={display}
      style={{ display: 'block', borderRadius: '50%', objectFit: 'cover' }}
      onError={() => setErrored(true)}
    />
  );
}
