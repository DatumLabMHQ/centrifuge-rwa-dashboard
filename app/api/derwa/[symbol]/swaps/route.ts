/**
 * GET /api/derwa/[symbol]/swaps
 *
 * Returns daily Swap event aggregates for the wrapper's primary DEX pool,
 * read directly from the pool contract via RPC. Includes a side-by-side
 * GeckoTerminal volume series and a divergence indicator so the reader
 * can confirm the on-chain numbers.
 *
 * Cached for 1 hour. The on-chain scan is expensive (~330 chunked
 * eth_getLogs calls for a 90-day Base window).
 */

import { NextResponse } from 'next/server';
import { swr } from '@/lib/sdk/kv-cache';
import { getDerwaContext } from '@/lib/data/derwa-context';
import { scanPoolSwaps, type SwapsSnapshot } from '@/lib/data/onchain/swap-events';
import {
  getPoolOhlcv,
  reconcileVolumes,
  type GeckoOhlcvSnapshot,
  type VolumeReconciliation,
} from '@/lib/data/geckoterminal-ohlcv';
import { batchEthCall } from '@/lib/data/onchain/rpc';

/**
 * 5 minutes. Vercel will silently cap to whatever the project plan
 * allows — Hobby gets 60s, Pro 300s, Enterprise more. The on-chain
 * Swap event scan can exceed 60s on cold cache (130+ chunked
 * eth_getLogs calls for a 90-day Base window), which is why default
 * timeouts produced perpetual "fetching..." spinners.
 */
export const maxDuration = 300;

const WRAPPER_SYMBOLS = new Set(['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA']);
const DEFAULT_FRESH_TTL_S = 1800; // 30 min — DEX volume changes slowly enough
const DEFAULT_STALE_TTL_S = 14_400; // 4 hours — keep stale data usable through quiet periods
const ALLOWED_DAYS = new Set([30, 60, 90, 180]);

function freshTtlS(): number {
  const raw = process.env.CACHE_TTL_SWAPS;
  const v = raw ? Number(raw) : DEFAULT_FRESH_TTL_S;
  return Number.isFinite(v) ? v : DEFAULT_FRESH_TTL_S;
}

interface ResponsePayload {
  symbol: string;
  pool: string;
  network: string;
  windowDays: number;
  onchain: SwapsSnapshot | null;
  gecko: GeckoOhlcvSnapshot | null;
  reconciliation: VolumeReconciliation | null;
}

/**
 * Read a Slipstream pool's `token0()` and `token1()` so the scanner knows
 * which decimals to use and which side to treat as the USD axis. Selectors:
 *   token0() → 0x0dfe1681
 *   token1() → 0xd21220a7
 */
async function fetchPoolTokens(
  network: 'base',
  pool: string,
): Promise<{ token0: string; token1: string } | null> {
  const [t0, t1] = await batchEthCall(network, [
    { to: pool, data: '0x0dfe1681' },
    { to: pool, data: '0xd21220a7' },
  ]);
  if (!t0 || !t1) return null;
  // Address is right-aligned in the 32-byte response.
  const decode = (hex: string) => '0x' + hex.replace(/^0x/, '').slice(-40);
  return { token0: decode(t0), token1: decode(t1) };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await context.params;
    if (!WRAPPER_SYMBOLS.has(symbol)) {
      return NextResponse.json(
        { error: `Unknown wrapper symbol: ${symbol}` },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get('days') ?? '90');
    const days = ALLOWED_DAYS.has(requested) ? requested : 90;

    // Resolve the wrapper's DEX pool from the context registry. This part
    // happens outside SWR because it's pure config lookup, not a fetch.
    const ctx = getDerwaContext(symbol);
    const dex = ctx?.integrations.find(
      (i) => i.kind === 'dex' && i.status === 'live' && i.address,
    );
    if (!dex?.address) {
      return NextResponse.json(
        { error: `No live DEX integration registered for ${symbol}` },
        { status: 404 },
      );
    }

    const network = 'base' as const;
    const pool = dex.address;
    const cacheKey = `centrifuge:swaps:${symbol}:${days}`;

    const result = await swr<ResponsePayload>(
      cacheKey,
      { freshTtlS: freshTtlS() },
      async () => {
        const tokens = await fetchPoolTokens(network, pool);
        if (!tokens) {
          throw new Error('Failed to read pool token0/token1 from RPC');
        }
        // Run on-chain scan and GeckoTerminal fetch in parallel.
        const [onchain, gecko] = await Promise.all([
          scanPoolSwaps({
            network,
            pool,
            token0: tokens.token0,
            token1: tokens.token1,
            lookbackDays: days,
          }).catch((err) => {
            console.warn('[api/swaps] on-chain scan failed', err);
            return null;
          }),
          getPoolOhlcv(network, pool, days),
        ]);
        const reconciliation =
          onchain && gecko ? reconcileVolumes(onchain.series, gecko.series) : null;
        return {
          symbol,
          pool,
          network,
          windowDays: days,
          onchain,
          gecko,
          reconciliation,
        };
      },
    );

    void DEFAULT_STALE_TTL_S; // doc'd default; swr() supplies its own internal fallback
    return NextResponse.json({
      ...result.data,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
    });
  } catch (err) {
    console.error('[api/derwa/[symbol]/swaps] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load swap activity', detail: message },
      { status: 502 },
    );
  }
}
