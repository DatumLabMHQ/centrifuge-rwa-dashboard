import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Health probe for datum-monitor. Intentionally dependency-free so the monitor
// can distinguish "dashboard is up, Centrifuge indexer flaky" from
// "dashboard is down".
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'centrifuge-rwa-dashboard',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
