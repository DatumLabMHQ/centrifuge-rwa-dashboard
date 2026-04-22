import { NextResponse } from 'next/server';
import { globalCache } from '@/lib/sdk/cache';
import {
  getAllPools,
  getRecentFlowTransactions,
  getTokenSnapshots,
  getTopPositions,
} from '@/lib/data/centrifuge';
import { getDefiLlamaPool } from '@/lib/data/defillama-yields';
import { getDexPoolStats } from '@/lib/data/geckoterminal';
import { getEulerMarketStats, type EulerMarketStats } from '@/lib/data/euler';
import { aggregateDerwa } from '@/lib/data/derwa-aggregate';
import { getDerwaContext } from '@/lib/data/derwa-context';
import type { DerwaData } from '@/lib/data/types';

const DEFAULT_TTL_S = 300;
const ALLOWED_DAYS = new Set([7, 30, 90, 365]);
const WRAPPER_SYMBOLS = ['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA'];

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get('days') ?? '365');
    const days = ALLOWED_DAYS.has(requested) ? requested : 365;

    const cacheKey = `centrifuge:derwa:${days}`;
    const cached = globalCache.get<DerwaData>(cacheKey, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const [pools, transactions, positions] = await Promise.all([
      getAllPools(200),
      getRecentFlowTransactions(1000),
      getTopPositions(1000),
    ]);

    // Snapshots per wrapper
    const wrapperTokenMap = new Map<string, string>();
    for (const p of pools) {
      const t = p.tokens.items.find((tok) => WRAPPER_SYMBOLS.includes(tok.symbol));
      if (t) wrapperTokenMap.set(t.symbol, t.id);
    }
    const snapshotResults = await Promise.all(
      Array.from(wrapperTokenMap.entries()).map(async ([sym, tokenId]) => {
        const snaps = await getTokenSnapshots(tokenId, 1000);
        return [sym, snaps] as const;
      }),
    );
    const snapshotsBySymbol = new Map(snapshotResults);

    // DEX pools from DefiLlama yields API
    const dexPools = new Map<string, Awaited<ReturnType<typeof getDefiLlamaPool>>>();
    for (const sym of WRAPPER_SYMBOLS) {
      const ctx = getDerwaContext(sym);
      if (!ctx) continue;
      for (const i of ctx.integrations) {
        if (i.kind === 'dex' && i.status === 'live' && i.defiLlamaPoolId) {
          const pool = await getDefiLlamaPool(i.defiLlamaPoolId);
          dexPools.set(i.defiLlamaPoolId, pool);
        }
      }
    }

    // GeckoTerminal for live trade price (premium/discount calc)
    const geckoStats = new Map<string, Awaited<ReturnType<typeof getDexPoolStats>>>();
    for (const sym of WRAPPER_SYMBOLS) {
      const ctx = getDerwaContext(sym);
      if (!ctx) continue;
      for (const i of ctx.integrations) {
        if (i.kind === 'dex' && i.status === 'live' && i.address) {
          const stats = await getDexPoolStats('base', i.address);
          geckoStats.set(i.address.toLowerCase(), stats);
        }
      }
    }

    // Euler on-chain reads — need NAV per wrapper for collateral valuation.
    const navBySymbol = new Map<string, number>();
    for (const p of pools) {
      for (const t of p.tokens.items) {
        if (WRAPPER_SYMBOLS.includes(t.symbol)) {
          navBySymbol.set(t.symbol, Number(t.tokenPrice) / 1e18);
        }
      }
    }
    const eulerStats = new Map<string, EulerMarketStats | null>();
    for (const sym of WRAPPER_SYMBOLS) {
      const ctx = getDerwaContext(sym);
      const euler = ctx?.integrations.find(
        (i) => i.kind === 'lending' && i.protocol === 'Euler' && i.status === 'live',
      );
      if (!euler?.address || !euler.url) continue;
      // Parse the second vault address from the Euler borrow URL:
      //   /borrow/{collateralVault}/{borrowVault}?network=8453
      const match = euler.url.match(/\/borrow\/(0x[a-fA-F0-9]+)\/(0x[a-fA-F0-9]+)/);
      if (!match) continue;
      const [, collateralVault, borrowVault] = match;
      const nav = navBySymbol.get(sym) ?? 0;
      const stats = await getEulerMarketStats(collateralVault, borrowVault, nav);
      eulerStats.set(sym, stats);
    }

    const data = aggregateDerwa({
      pools,
      transactions,
      positions,
      snapshotsBySymbol,
      dexPools,
      geckoStats,
      eulerStats,
      windowDays: days,
    });

    globalCache.set(cacheKey, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/derwa] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load deRWA data', detail: message },
      { status: 502 },
    );
  }
}
