import { NextResponse } from 'next/server';
import { swr } from '@/lib/sdk/kv-cache';
import { getAllPools, getRecentFlowTransactions } from '@/lib/data/centrifuge';
import { aggregatePools } from '@/lib/data/aggregate';
import { buildClassifierMap } from '@/lib/data/ipfs';
import { getAllOnchainSupplies } from '@/lib/data/onchain/supply';
import { reconcileAll, summarizeQuality } from '@/lib/data/reconcile';
import type { PoolsData } from '@/lib/data/types';

const CACHE_KEY = 'centrifuge:pools';
const DEFAULT_FRESH_TTL_S = 300;

function freshTtlS(): number {
  const raw = process.env.CACHE_TTL_OVERVIEW;
  const v = raw ? Number(raw) : DEFAULT_FRESH_TTL_S;
  return Number.isFinite(v) ? v : DEFAULT_FRESH_TTL_S;
}

export async function GET() {
  try {
    const result = await swr<PoolsData>(
      CACHE_KEY,
      { freshTtlS: freshTtlS() },
      async () => {
        const [pools, transactions] = await Promise.all([
          getAllPools(200),
          getRecentFlowTransactions(1000),
        ]);

        const navBySymbol: Record<string, number> = {};
        for (const p of pools) {
          for (const t of p.tokens.items) {
            const price = Number(t.tokenPrice ?? 0) / 1e18;
            if (price > 0) navBySymbol[t.symbol] = price;
          }
        }

        const [classifier, onchainSupplies] = await Promise.all([
          buildClassifierMap(pools),
          getAllOnchainSupplies(navBySymbol).catch(() => ({})),
        ]);

        const base = aggregatePools(pools, transactions, classifier, onchainSupplies);
        const tokens = reconcileAll({ pools, onchainSupplies });
        const summary = summarizeQuality(tokens);
        return { ...base, dataQuality: { summary, tokens } };
      },
    );

    return NextResponse.json({
      ...result.data,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
    });
  } catch (err) {
    console.error('[api/pools] failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load pools', detail: message },
      { status: 502 },
    );
  }
}
