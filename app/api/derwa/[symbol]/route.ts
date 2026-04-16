import { NextResponse } from 'next/server';
import { globalCache } from '@/lib/sdk/cache';
import {
  getAllPools,
  getRecentFlowTransactions,
  getTokenSnapshots,
  getTopPositions,
} from '@/lib/data/centrifuge';
import { getManyDexPoolStats } from '@/lib/data/geckoterminal';
import { getMorphoMarketStats } from '@/lib/data/morpho';
import { aggregateDerwaDetail } from '@/lib/data/derwa-aggregate';
import { getDerwaContext } from '@/lib/data/derwa-context';
import type { DerwaDetailData, MorphoMarketData } from '@/lib/data/types';

const DEFAULT_TTL_S = 300;
const ALLOWED_DAYS = new Set([7, 30, 90, 365]);
const WRAPPER_SYMBOLS = new Set(['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA']);

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

/**
 * Per-wrapper detail endpoint.
 *
 * Next.js 16 dynamic route handlers receive `params` as a Promise — must
 * `await` before accessing path segments.
 */
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
    const requested = Number(url.searchParams.get('days') ?? '365');
    const days = ALLOWED_DAYS.has(requested) ? requested : 365;

    const cacheKey = `centrifuge:derwa:detail:${symbol}:${days}`;
    const cached = globalCache.get<DerwaDetailData>(cacheKey, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // Pull pools, transactions, positions in parallel
    const [pools, transactions, positions] = await Promise.all([
      getAllPools(200),
      getRecentFlowTransactions(1000),
      getTopPositions(1000),
    ]);

    // Resolve token IDs for the wrappers (we need all 4 for the wrap-ratio
    // computation in aggregateDerwa, even though we only return one)
    const wrapperTokenMap = new Map<string, string>();
    for (const p of pools) {
      const t = p.tokens.items.find((tok) => WRAPPER_SYMBOLS.has(tok.symbol));
      if (t) wrapperTokenMap.set(t.symbol, t.id);
    }

    const snapshotResults = await Promise.all(
      Array.from(wrapperTokenMap.entries()).map(async ([sym, tokenId]) => {
        const snaps = await getTokenSnapshots(tokenId, 1000);
        return [sym, snaps] as const;
      }),
    );
    const snapshotsBySymbol = new Map(snapshotResults);

    // GeckoTerminal stats (only for the wrapper we care about, but we
    // include all 4 because the cache may be reused)
    const dexFetches: Array<{ network: string; address: string }> = [];
    for (const sym of WRAPPER_SYMBOLS) {
      const ctx = getDerwaContext(sym);
      if (!ctx) continue;
      for (const i of ctx.integrations) {
        if (i.kind === 'dex' && i.status === 'live' && i.address && i.chain) {
          dexFetches.push({ network: i.chain.toLowerCase(), address: i.address });
        }
      }
    }
    const dexStats = await getManyDexPoolStats(dexFetches);

    const data = aggregateDerwaDetail({
      pools,
      transactions,
      positions,
      snapshotsBySymbol,
      dexStats,
      windowDays: days,
      symbol,
    });

    if (!data) {
      return NextResponse.json({ error: 'Wrapper not found in live data' }, { status: 404 });
    }

    // Fetch live Morpho market stats if this wrapper has a LIVE lending
    // integration on Morpho. Best-effort — null on failure.
    let morpho: MorphoMarketData | null = null;
    const ctx = getDerwaContext(symbol);
    const morphoIntegration = ctx?.integrations.find(
      (i) => i.kind === 'lending' && i.protocol === 'Morpho' && i.status === 'live' && i.address,
    );
    if (morphoIntegration?.address) {
      const chainId =
        morphoIntegration.chain?.toLowerCase() === 'base' ? 8453 : 1;
      const stats = await getMorphoMarketStats(morphoIntegration.address, chainId);
      if (stats) {
        morpho = {
          marketId: stats.marketId,
          collateralSymbol: stats.collateralSymbol,
          loanSymbol: stats.loanSymbol,
          supplyUsd: stats.supplyUsd,
          borrowUsd: stats.borrowUsd,
          utilization: stats.utilization,
          supplyApy: stats.supplyApy,
          borrowApy: stats.borrowApy,
          lltv: stats.lltv,
          fee: stats.fee,
          marketUrl: morphoIntegration.url ?? '',
        };
      }
    }

    const enriched = { ...data, morpho };
    globalCache.set(cacheKey, enriched);
    return NextResponse.json({ ...enriched, cached: false });
  } catch (err) {
    console.error('[api/derwa/[symbol]] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load wrapper detail', detail: message },
      { status: 502 },
    );
  }
}
