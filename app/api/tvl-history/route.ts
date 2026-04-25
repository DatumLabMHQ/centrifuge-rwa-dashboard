import { NextResponse } from 'next/server';
import { swr } from '@/lib/sdk/kv-cache';
import { getCentrifugeTvlHistory } from '@/lib/data/defillama';
import type { TvlHistoryData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:tvl-history';
const DEFAULT_FRESH_TTL_S = 3600;

function freshTtlS(): number {
  const raw = process.env.CACHE_TTL_TVL_HISTORY;
  const v = raw ? Number(raw) : DEFAULT_FRESH_TTL_S;
  return Number.isFinite(v) ? v : DEFAULT_FRESH_TTL_S;
}

export async function GET() {
  try {
    const result = await swr<TvlHistoryData>(
      CACHE_KEY,
      { freshTtlS: freshTtlS() },
      async () => getCentrifugeTvlHistory(),
    );
    return NextResponse.json({
      ...result.data,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
    });
  } catch (err) {
    console.error('[api/tvl-history] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load TVL history', detail: message },
      { status: 502 },
    );
  }
}
