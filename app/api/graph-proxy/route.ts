import { NextResponse } from 'next/server';

/**
 * Pass-through to api.centrifuge.io for the Datum data platform.
 *
 * Centrifuge's API answers US-east callers with 520/524 errors on real queries (2026-09-04) while
 * European callers get sub-second responses. This deployment runs in London, so the platform's
 * GitHub runner (US) posts its GraphQL here and we forward it unchanged. Requires the shared key
 * in `x-proxy-key`; refuses everything when GRAPH_PROXY_KEY is unset. Only the Centrifuge
 * endpoint is reachable through it.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const UPSTREAM = process.env.CENTRIFUGE_GRAPHQL_URL ?? 'https://api.centrifuge.io';

export async function POST(req: Request) {
  const key = process.env.GRAPH_PROXY_KEY;
  if (!key || req.headers.get('x-proxy-key') !== key) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.text();
  try {
    const res = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(50_000),
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'upstream failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
