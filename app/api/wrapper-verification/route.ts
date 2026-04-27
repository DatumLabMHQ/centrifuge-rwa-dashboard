/**
 * GET /api/wrapper-verification
 *
 * On-chain verification of the deRWA wrapper → institutional pool mapping.
 * For each registered wrapper:
 *   - Calls `name()` and `symbol()` on the wrapper contract.
 *   - Calls `balanceOf(wrapper)` on the institutional token (when both
 *     are deployed on the same chain).
 *   - Reports whether the name() string self-identifies the expected
 *     fund, and whether the wrapper holds any institutional shares.
 *
 * The methodology page consumes this endpoint to render the verification
 * table that proves to readers we didn't just hardcode the mapping.
 */
import { NextResponse } from 'next/server';
import { swr } from '@/lib/sdk/kv-cache';
import { verifyWrapperRegistry } from '@/lib/data/onchain/wrapper-verification';

const CACHE_KEY = 'centrifuge:wrapper-verification:v2';
// Wrapper addresses + name() values are immutable once deployed, so we
// can cache aggressively. 6 hours strikes a balance between staying fresh
// in case Centrifuge redeploys and avoiding redundant RPC calls.
const FRESH_TTL_S = 6 * 60 * 60;

export async function GET() {
  try {
    const result = await swr(
      CACHE_KEY,
      { freshTtlS: FRESH_TTL_S },
      () => verifyWrapperRegistry(),
    );
    return NextResponse.json({
      rows: result.data,
      cached: result.cached,
      ageSeconds: result.ageSeconds,
    });
  } catch (err) {
    console.error('[api/wrapper-verification] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to verify wrappers', detail: message },
      { status: 502 },
    );
  }
}
