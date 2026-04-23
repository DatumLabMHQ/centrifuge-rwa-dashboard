import { getOnchainHolders } from '../lib/data/onchain/holders';

async function main() {
  const symbol = process.argv[2] ?? 'deSPXA';
  const nav = Number(process.argv[3] ?? 708.45);
  const lookback = Number(process.argv[4] ?? 3_000_000);
  const t0 = Date.now();
  const snap = await getOnchainHolders(symbol, { navUsd: nav, defaultLookback: lookback });
  if (!snap) {
    console.log('null');
    return;
  }
  console.log('symbol:', snap.symbol);
  console.log('totalHolders:', snap.totalHolders);
  console.log('degraded:', snap.degraded);
  console.log('diagnostics:');
  for (const d of snap.diagnostics) {
    console.log(
      `  ${d.chain} ${d.fromBlock}→${d.toBlock} candidates=${d.candidatesScanned} holders=${d.holdersFound} partial=${d.partial} failed=${d.failed}`,
    );
  }
  console.log('top 10 holders:');
  for (const h of snap.holders.slice(0, 10)) {
    console.log(
      `  ${h.address}  ${h.totalBalance.toFixed(4).padStart(14)}  $${h.totalUsd.toFixed(2)}`,
    );
  }
  const supplyFromHolders = snap.holders.reduce((s, h) => s + h.totalBalance, 0);
  console.log(`sum-of-balances: ${supplyFromHolders.toFixed(4)}`);
  console.log(`elapsed: ${Date.now() - t0}ms`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
