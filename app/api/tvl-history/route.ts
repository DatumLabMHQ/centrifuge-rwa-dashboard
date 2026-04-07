import { NextResponse } from 'next/server';
import { globalCache } from '@datumlabs/data-connectors';
import { getCentrifugeTvlHistory } from '@/lib/data/defillama';
import type { TvlHistoryData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:tvl-history';
const DEFAULT_TTL_S = 3600;

function ttlMs(): number {
  const raw = process.env.CACHE_TTL_TVL_HISTORY;
  const seconds = raw ? Number(raw) : DEFAULT_TTL_S;
  return (Number.isFinite(seconds) ? seconds : DEFAULT_TTL_S) * 1000;
}

export async function GET() {
  try {
    const cached = globalCache.get<TvlHistoryData>(CACHE_KEY, ttlMs());
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const data = await getCentrifugeTvlHistory();
    globalCache.set(CACHE_KEY, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error('[api/tvl-history] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load TVL history', detail: message },
      { status: 502 },
    );
  }
}
