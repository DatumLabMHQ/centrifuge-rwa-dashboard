import { NextResponse } from 'next/server';
import { globalCache } from '@/lib/sdk/cache';
import {
  getAllPools,
  getRecentFlowTransactions,
  getRecentCrossChainTransactions,
} from '@/lib/data/centrifuge';
import { aggregateFlow, aggregateCrossChainFlow } from '@/lib/data/aggregate';
import type { FlowData } from '@/lib/data/types';

const DEFAULT_TTL_S = 300;
const ALLOWED_DAYS = new Set([7, 30, 90, 365]);

/**
 * TTL resolution: prefer a flow-specific env var, then fall back to the
 * shared overview TTL, then to DEFAULT_TTL_S. Lets operators tune flow
 * freshness independently if they want — useful since flow data can shift
 * faster than headline TVL during volatile periods.
 */
function ttlMs(): number {
  const raw = process.env.CACHE_TTL_FLOW ?? process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get('days') ?? '30');
    const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 30;

    const cacheKey = `centrifuge:flow:${days}`;
    const cached = globalCache.get<FlowData & { crossChain: ReturnType<typeof aggregateCrossChainFlow> }>(
      cacheKey,
      ttlMs(),
    );
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // Cross-chain transfers come from `crosschainPayloads` (the bridge
    // message entity itself) — NOT the pool-flow investorTransactions.
    //
    // Centrifuge's indexer rejects (502s) limits over ~1000, so we stay at
    // the cap. When the response hits the cap exactly the aggregator flags
    // `hitFetchCap` so the UI shows "X+" instead of a misleadingly precise
    // count. To get a true count above 1000 we'd need pagination, which is
    // a future-work item.
    const CROSS_CHAIN_LIMIT = 1000;
    const [pools, txs, crossChainTxs] = await Promise.all([
      getAllPools(200),
      getRecentFlowTransactions(1000),
      getRecentCrossChainTransactions(CROSS_CHAIN_LIMIT),
    ]);

    const flow = aggregateFlow(pools, txs, days);
    const crossChain = aggregateCrossChainFlow(pools, crossChainTxs, days, CROSS_CHAIN_LIMIT);

    const data = { ...flow, crossChain };
    globalCache.set(cacheKey, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/flow] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load flow data', detail: message },
      { status: 502 },
    );
  }
}
