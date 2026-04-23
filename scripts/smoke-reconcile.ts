/**
 * End-to-end smoke test: fetch pools + on-chain supplies, reconcile,
 * print a table showing on-chain vs indexer for every known token.
 *
 * Run: npx tsx scripts/smoke-reconcile.ts
 */

import { getAllPools } from '../lib/data/centrifuge';
import { getAllOnchainSupplies } from '../lib/data/onchain/supply';
import { reconcileAll, summarizeQuality } from '../lib/data/reconcile';

async function main() {
  const pools = await getAllPools(200);
  const navBySymbol: Record<string, number> = {};
  for (const p of pools) {
    for (const t of p.tokens.items) {
      const price = Number(t.tokenPrice ?? 0) / 1e18;
      if (price > 0) navBySymbol[t.symbol] = price;
    }
  }
  const onchainSupplies = await getAllOnchainSupplies(navBySymbol);
  const tokens = reconcileAll({ pools, onchainSupplies });
  const summary = summarizeQuality(tokens);

  console.log('\nToken reconciliation:');
  console.log('─'.repeat(120));
  console.log(
    'symbol'.padEnd(10),
    'onchain'.padStart(16),
    'indexer'.padStart(16),
    'diff%'.padStart(8),
    'quality'.padStart(10),
    'source'.padStart(10),
    '  message',
  );
  console.log('─'.repeat(120));

  const sorted = Object.values(tokens).sort((a, b) => {
    // broken first, then degraded, then ok
    const order: Record<string, number> = { broken: 0, degraded: 1, ok: 2 };
    return order[a.quality] - order[b.quality];
  });

  for (const r of sorted) {
    console.log(
      r.symbol.padEnd(10),
      r.onchainSupply.toFixed(2).padStart(16),
      r.indexerIssuance.toFixed(2).padStart(16),
      (r.divergence * 100).toFixed(1).padStart(7) + '%',
      r.quality.padStart(10),
      r.source.padStart(10),
      '  ' + r.message,
    );
  }

  console.log('─'.repeat(120));
  console.log(
    `Summary: ${summary.ok} ok, ${summary.degraded} degraded, ${summary.broken} broken (total ${summary.total})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
