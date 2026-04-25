/**
 * GET /api/protocol-yield
 *
 * Returns:
 *   - `yield`: Daily Pool Yield series, derived 100% from Centrifuge GraphQL
 *     (poolSnapshots / tokenSnapshots / investorTransactions). NAV growth
 *     net of investor flows. Honest label: "yield + fees combined."
 *   - `revenue`: DefiLlama's protocol-revenue series, surfaced alongside
 *     for comparison. The gap between yield and revenue ≈ asset-side yield
 *     that flowed to investors instead of the protocol. May be null if the
 *     DefiLlama call fails — the route still returns yield in that case.
 *
 * Cached for 1 hour (yield doesn't move minute to minute, and the
 * underlying snapshot fetch is heavy: one tokenSnapshots query per pool).
 */

import { NextResponse } from 'next/server';
import { swr } from '@/lib/sdk/kv-cache';
import {
  getAllPools,
  getRecentFlowTransactions,
  getTokenSnapshots,
} from '@/lib/data/centrifuge';
import {
  computeProtocolYield,
  pickPrimaryToken,
  type ProtocolYieldData,
  type TokenSnapshotBundle,
} from '@/lib/data/protocol-yield';
import { getCentrifugeDailyRevenue, type DefiLlamaRevenueData } from '@/lib/data/defillama-fees';

const CACHE_KEY = 'centrifuge:protocol-yield';
const DEFAULT_FRESH_TTL_S = 3600; // 1 hour
const ALLOWED_DAYS = new Set([30, 90, 180, 365]);

function freshTtlS(): number {
  const raw = process.env.CACHE_TTL_PROTOCOL_YIELD;
  const v = raw ? Number(raw) : DEFAULT_FRESH_TTL_S;
  return Number.isFinite(v) ? v : DEFAULT_FRESH_TTL_S;
}

interface ResponsePayload {
  yield: ProtocolYieldData;
  revenue: DefiLlamaRevenueData | null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get('days') ?? '90');
    const days = ALLOWED_DAYS.has(requested) ? requested : 90;

    const cacheKey = `${CACHE_KEY}:${days}`;
    const result = await swr<ResponsePayload>(
      cacheKey,
      { freshTtlS: freshTtlS() },
      async () => {
        const [pools, transactions] = await Promise.all([
          getAllPools(200),
          getRecentFlowTransactions(1000),
        ]);
        const primary = pools
          .map((pool) => {
            const token = pickPrimaryToken(pool);
            return token ? { tokenId: token.id, decimals: token.decimals } : null;
          })
          .filter((x): x is { tokenId: string; decimals: number } => !!x);

        const snapLimit = Math.max(120, days + 30);
        const snapshotBundles: TokenSnapshotBundle[] = await Promise.all(
          primary.map(async ({ tokenId, decimals }) => {
            try {
              const snapshots = await getTokenSnapshots(tokenId, snapLimit);
              return { tokenId, decimals, snapshots };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`[api/protocol-yield] snapshots failed for ${tokenId}: ${msg}`);
              return { tokenId, decimals, snapshots: [] };
            }
          }),
        );

        const yieldData = computeProtocolYield({
          snapshots: snapshotBundles,
          transactions,
          windowDays: days,
        });
        const revenue = await getCentrifugeDailyRevenue();
        return { yield: yieldData, revenue };
      },
    );

    return NextResponse.json({
      ...result.data,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
    });
  } catch (err) {
    console.error('[api/protocol-yield] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to compute protocol yield', detail: message },
      { status: 502 },
    );
  }
}
