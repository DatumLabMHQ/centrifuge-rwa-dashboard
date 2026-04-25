/**
 * Cron pre-warmer for the on-chain Swap event cache.
 *
 * Vercel cron hits this endpoint every hour. We trigger a fetch for
 * every wrapper's swaps route, which forces the SWR layer to write a
 * fresh result to Upstash Redis. End-users land on warm cache and get
 * instant responses.
 *
 * Schedule lives in vercel.json. To enable: ensure your Vercel project
 * is on Pro (Hobby doesn't support cron).
 *
 * Auth: Vercel injects `Authorization: Bearer ${CRON_SECRET}` when it
 * triggers cron jobs. We compare against process.env.CRON_SECRET.
 * Without that env var set, the endpoint accepts any caller — fine for
 * a non-destructive read but you should set CRON_SECRET to lock it down.
 */

import { NextResponse } from 'next/server';
import { invalidate } from '@/lib/sdk/kv-cache';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const WRAPPERS = ['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA'];
const WINDOW_DAYS = 30;

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // unset = open (dev / staging)
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Build base URL from headers so we work regardless of which Vercel
  // domain the cron fires against.
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (!host) {
    return NextResponse.json({ error: 'Missing host header' }, { status: 500 });
  }
  const base = `${proto}://${host}`;

  const started = Date.now();
  // Invalidate the cache key for each wrapper before re-fetching, so the
  // SWR layer is forced to recompute. Without this, calling the endpoint
  // could return cached data instantly (no-op refresh) when the previous
  // cron run just populated it.
  await Promise.all(
    WRAPPERS.map((sym) => invalidate(`centrifuge:swaps:${sym}:${WINDOW_DAYS}`)),
  );
  const results = await Promise.allSettled(
    WRAPPERS.map(async (sym) => {
      const url = `${base}/api/derwa/${sym}/swaps?days=${WINDOW_DAYS}`;
      const t0 = Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const ms = Date.now() - t0;
      return { symbol: sym, ok: res.ok, status: res.status, ms };
    }),
  );

  const summary = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { symbol: WRAPPERS[i], ok: false, error: String(r.reason) },
  );

  return NextResponse.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    targets: summary,
  });
}
