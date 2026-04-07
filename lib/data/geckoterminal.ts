/**
 * GeckoTerminal API helper — fetches DEX pool stats (TVL, 24h volume, current
 * trade price) so the deRWA page can show:
 *   - Live DEX liquidity + volume per integration
 *   - Premium/discount of the wrapper's DEX price vs its NAV (from Centrifuge)
 *
 * Public API, no key required. Free tier is rate-limited (~30 req/min) so the
 * caller is expected to cache results in `globalCache`.
 *
 * Endpoint: https://api.geckoterminal.com/api/v2/networks/{network}/pools/{address}
 */

export interface GeckoPoolStats {
  address: string;
  network: string;
  /** Current trade price (USD) of the base token in this pool. */
  priceUsd: number | null;
  /** Total liquidity in USD locked in the pool. */
  liquidityUsd: number;
  /** 24h volume in USD. */
  volume24hUsd: number;
  /** 24h price change percent. */
  priceChange24h: number | null;
  /** ISO timestamp when the pool was created. */
  poolCreatedAt: string | null;
}

interface GtAttributes {
  base_token_price_usd?: string;
  reserve_in_usd?: string;
  volume_usd?: { h24?: string };
  price_change_percentage?: { h24?: string };
  pool_created_at?: string;
}

interface GtResponse {
  data?: { attributes?: GtAttributes };
  errors?: unknown;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getDexPoolStats(
  network: string,
  address: string,
): Promise<GeckoPoolStats | null> {
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${address}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as GtResponse;
    const attrs = json.data?.attributes;
    if (!attrs) return null;
    return {
      address,
      network,
      priceUsd: attrs.base_token_price_usd ? num(attrs.base_token_price_usd) : null,
      liquidityUsd: num(attrs.reserve_in_usd),
      volume24hUsd: num(attrs.volume_usd?.h24),
      priceChange24h: attrs.price_change_percentage?.h24
        ? num(attrs.price_change_percentage.h24)
        : null,
      poolCreatedAt: attrs.pool_created_at ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve many DEX pools in parallel. Failures are silently turned into
 * `null` so a single rate-limit doesn't break the whole API call.
 */
export async function getManyDexPoolStats(
  pools: Array<{ network: string; address: string }>,
): Promise<Map<string, GeckoPoolStats | null>> {
  const results = await Promise.all(
    pools.map(async (p) => [p.address.toLowerCase(), await getDexPoolStats(p.network, p.address)] as const),
  );
  return new Map(results);
}
