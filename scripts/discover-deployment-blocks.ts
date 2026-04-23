/**
 * One-off discovery script. Binary-searches eth_getCode to find the
 * deployment block of every (token, chain) deployment in the registry,
 * then prints a drop-in `fromBlock:` object for registry.ts.
 *
 * Run: npx tsx scripts/discover-deployment-blocks.ts
 */

import { ALL_TOKENS, CHAINS, type ChainKey } from '../lib/data/onchain/registry';
import { getLatestBlock, rpcUrl } from '../lib/data/onchain/rpc';

async function getCode(chain: ChainKey, addr: string, block: number): Promise<string> {
  const url = rpcUrl(chain);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [addr, '0x' + block.toString(16)],
      id: 1,
    }),
  });
  const json = await res.json();
  return json.result ?? '0x';
}

async function findDeploymentBlock(
  chain: ChainKey,
  addr: string,
): Promise<number | null> {
  const latest = await getLatestBlock(chain);
  if (latest == null) return null;

  // Sanity: contract exists at latest?
  const codeAtLatest = await getCode(chain, addr, latest);
  if (codeAtLatest === '0x' || codeAtLatest === '0x0') {
    return null; // Contract doesn't exist on this chain
  }

  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await getCode(chain, addr, mid);
    if (code === '0x' || code === '0x0') {
      lo = mid + 1;
    } else {
      hi = mid;
    }
    // gentle pacing — drpc rate limits bursts
    await new Promise((r) => setTimeout(r, 50));
  }
  return lo;
}

async function main() {
  const output: Record<string, Partial<Record<ChainKey, number>>> = {};

  for (const [symbol, def] of Object.entries(ALL_TOKENS)) {
    output[symbol] = {};
    for (const chainKey of Object.keys(def.deployments) as ChainKey[]) {
      const addr = def.deployments[chainKey]!;
      process.stderr.write(`[${symbol}] ${chainKey}… `);
      try {
        const block = await findDeploymentBlock(chainKey, addr);
        if (block != null) {
          output[symbol][chainKey] = block;
          process.stderr.write(`${block}\n`);
        } else {
          process.stderr.write(`not-found\n`);
        }
      } catch (err) {
        process.stderr.write(`ERROR: ${(err as Error).message}\n`);
      }
    }
  }

  // Pretty-print as TS snippet for copy-paste into registry.ts
  console.log('\n/* ──── Discovered deployment blocks ──── */\n');
  for (const [symbol, blocks] of Object.entries(output)) {
    if (Object.keys(blocks).length === 0) continue;
    console.log(`${symbol}: {`);
    for (const [chain, block] of Object.entries(blocks)) {
      console.log(`  ${chain}: ${block},`);
    }
    console.log(`},`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
