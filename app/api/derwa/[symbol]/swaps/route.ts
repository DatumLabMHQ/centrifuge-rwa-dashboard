/**
 * GET /api/derwa/[symbol]/swaps
 *
 * Returns daily DEX volume aggregates for the wrapper's primary DEX pool,
 * sourced from the Aerodrome Base Full subgraph on The Graph Network.
 *
 * Previous implementation read raw Swap event logs via chunked
 * eth_getLogs (130+ calls per request, 60-90s on Vercel Hobby). The
 * subgraph returns the same data in one GraphQL query (~200ms) and never
 * times out. See lib/data/aerodrome-subgraph.ts for the reader.
 *
 * Cached for 30 minutes via the shared SWR layer.
 */

import { NextResponse } from 'next/server';
import { getDerwaContext } from '@/lib/data/derwa-context';
import {
  getAerodromeDailyVolume,
  type AerodromeSwapsSnapshot,
} from '@/lib/data/aerodrome-subgraph';

const WRAPPER_SYMBOLS = new Set(['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA']);

/**
 * Window cap. The subgraph is fast enough that we could go to 365+ days,
 * but most user-visible charts read fine at 90 days and a smaller payload
 * keeps responses snappy. Bump this if a chart needs more history.
 */
const MAX_DAYS = 365;
const DEFAULT_DAYS = 90;

interface ResponsePayload {
  symbol: string;
  pool: string;
  network: string;
  windowDays: number;
  onchain: AerodromeSwapsSnapshot | null;
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
    const requested = Number(url.searchParams.get('days') ?? String(DEFAULT_DAYS));
    const days = Math.min(
      Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_DAYS,
      MAX_DAYS,
    );

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

    const network = 'base' as const;
    const pool = dex.address;
    // The subgraph reader has its own SWR cache keyed by pool+days, so
    // we don't wrap it again here. The dex page UI sees the same shape
    // it did before — the `onchain` field stays for back-compat with
    // the existing UI naming (it's now subgraph-sourced, not on-chain
    // RPC, but downstream pages don't need to know).
    const data = await getAerodromeDailyVolume(pool, days);

    const payload: ResponsePayload = {
      symbol,
      pool,
      network,
      windowDays: days,
      onchain: data,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[api/derwa/[symbol]/swaps] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load swap activity', detail: message },
      { status: 502 },
    );
  }
}
