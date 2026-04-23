import { NextResponse } from 'next/server';
import { globalCache } from '@/lib/sdk/cache';
import { getAllPools, getRecentFlowTransactions } from '@/lib/data/centrifuge';
import { aggregateOverview } from '@/lib/data/aggregate';
import { buildClassifierMap } from '@/lib/data/ipfs';
import { getAllOnchainSupplies } from '@/lib/data/onchain/supply';
import { reconcileAll, summarizeQuality } from '@/lib/data/reconcile';
import type { OverviewData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:overview';
const DEFAULT_TTL_S = 300;

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET() {
  try {
    const cached = globalCache.get<OverviewData>(CACHE_KEY, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const [pools, transactions] = await Promise.all([
      getAllPools(200),
      getRecentFlowTransactions(1000),
    ]);

    // Build nav-by-symbol map from the Centrifuge indexer's tokenPrice field
    // — this is still the source of truth for NAV. Only supply comes from
    // the on-chain tier.
    const navBySymbol: Record<string, number> = {};
    for (const p of pools) {
      for (const t of p.tokens.items) {
        const price = Number(t.tokenPrice ?? 0) / 1e18;
        if (price > 0) navBySymbol[t.symbol] = price;
      }
    }

    // Fetch classifier + on-chain supplies in parallel — both best-effort.
    const [classifier, onchainSupplies] = await Promise.all([
      buildClassifierMap(pools),
      getAllOnchainSupplies(navBySymbol).catch(() => ({})),
    ]);

    const base = aggregateOverview(pools, transactions, classifier, onchainSupplies);
    const tokens = reconcileAll({ pools, onchainSupplies });
    const summary = summarizeQuality(tokens);
    const data: OverviewData = {
      ...base,
      dataQuality: { summary, tokens },
    };
    globalCache.set(CACHE_KEY, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/overview] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load Centrifuge overview', detail: message },
      { status: 502 },
    );
  }
}
