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
import { globalCache } from '@/lib/sdk/cache';
import { getDerwaContext } from '@/lib/data/derwa-context';
import { scanPoolSwaps, type SwapsSnapshot } from '@/lib/data/onchain/swap-events';
import {
  getPoolOhlcv,
  reconcileVolumes,
  type GeckoOhlcvSnapshot,
  type VolumeReconciliation,
} from '@/lib/data/geckoterminal-ohlcv';
import { batchEthCall } from '@/lib/data/onchain/rpc';

const WRAPPER_SYMBOLS = new Set(['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA']);
const DEFAULT_TTL_S = 3600;
const ALLOWED_DAYS = new Set([30, 60, 90, 180]);

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_SWAPS;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
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

    const cacheKey = `centrifuge:swaps:${symbol}:${days}`;
    const cached = globalCache.get<ResponsePayload>(cacheKey, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // Resolve the wrapper's DEX pool from the context registry.
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

    // Aerodrome on Base is the only live DEX integration for our wrappers.
    // Hardcode to 'base' for now — when more chains come online this will
    // resolve from the integration entry's chain field.
    const network = 'base' as const;
    const pool = dex.address;

    const tokens = await fetchPoolTokens(network, pool);
    if (!tokens) {
      return NextResponse.json(
        { error: 'Failed to read pool token0/token1 from RPC' },
        { status: 502 },
      );
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
      onchain && gecko
        ? reconcileVolumes(onchain.series, gecko.series)
        : null;

    const payload: ResponsePayload = {
      symbol,
      pool,
      network,
      windowDays: days,
      onchain,
      gecko,
      reconciliation,
    };
    globalCache.set(cacheKey, payload);
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[api/derwa/[symbol]/swaps] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load swap activity', detail: message },
      { status: 502 },
    );
  }
}
