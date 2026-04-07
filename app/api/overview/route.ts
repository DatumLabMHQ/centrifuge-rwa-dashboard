import { NextResponse } from 'next/server';
import { globalCache } from '@datumlabs/data-connectors';
import { getAllPools, getRecentFlowTransactions } from '@/lib/data/centrifuge';
import { aggregateOverview } from '@/lib/data/aggregate';
import { buildClassifierMap } from '@/lib/data/ipfs';
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

    // Resolve canonical asset classes from IPFS in parallel. Best-effort —
    // if it fails or returns null, the aggregator falls back to its name
    // heuristic, so the response is never blocked.
    const classifier = await buildClassifierMap(pools);

    const data = aggregateOverview(pools, transactions, classifier);
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
