import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Health probe for Setnel and the setnel-pings warmup. Dependency-free on purpose, so "dashboard up,
// upstream data flaky" stays distinguishable from "dashboard down".
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'centrifuge-rwa-dashboard',
    timestamp: new Date().toISOString(),
    commit: process.env.GIT_COMMIT_SHA ?? null,
  });
}
