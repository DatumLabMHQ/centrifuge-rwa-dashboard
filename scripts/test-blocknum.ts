import { getLatestBlock } from '../lib/data/onchain/rpc';

async function main() {
  for (let i = 0; i < 3; i += 1) {
    const b = await getLatestBlock('base');
    console.log('base latest:', b);
  }
}
main();
