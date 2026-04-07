import { NextResponse } from 'next/server';
import { globalCache } from '@datumlabs/data-connectors';
import { getAllPools, getRecentFlowTransactions } from '@/lib/data/centrifuge';
import { aggregatePools } from '@/lib/data/aggregate';
import { buildClassifierMap } from '@/lib/data/ipfs';
import type { PoolsData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:pools';
const DEFAULT_TTL_S = 300;

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET() {
  try {
    const cached = globalCache.get<PoolsData>(CACHE_KEY, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const [pools, transactions] = await Promise.all([
      getAllPools(200),
      getRecentFlowTransactions(1000),
    ]);

    const classifier = await buildClassifierMap(pools);
    const data = aggregatePools(pools, transactions, classifier);
    globalCache.set(CACHE_KEY, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/pools] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load pools', detail: message },
      { status: 502 },
    );
  }
}
