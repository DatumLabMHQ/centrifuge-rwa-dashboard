import { NextResponse } from 'next/server';
import { globalCache } from '@datumlabs/data-connectors';
import { getTopPositions } from '@/lib/data/centrifuge';
import { aggregateInvestors } from '@/lib/data/aggregate';
import type { InvestorsData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:investors';
const DEFAULT_TTL_S = 300;

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET() {
  try {
    const cached = globalCache.get<InvestorsData>(CACHE_KEY, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const positions = await getTopPositions(1000);
    const data = aggregateInvestors(positions);
    globalCache.set(CACHE_KEY, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/investors] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load investors', detail: message },
      { status: 502 },
    );
  }
}
