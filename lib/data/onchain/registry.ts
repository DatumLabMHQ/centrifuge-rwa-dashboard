/**
 * Canonical on-chain address registry for Centrifuge RWA tokens.
 *
 * Source of truth: https://docs.centrifuge.io/developer/protocol/deployments/
 * Commit: 6b9d36eabee48728486f377ea2766a5cd233c555 (v3.1.0)
 *
 * This is the AUTHORITATIVE source for token addresses. We read totalSupply()
 * and balanceOf() directly from these contracts, which means our TVL numbers
 * never depend on Centrifuge's indexer being healthy.
 *
 * Non-EVM chains (Solana, Stellar) are omitted — they need separate SDK
 * handling and contribute marginally to TVL.
 */

export const CHAINS = {
  ethereum:  { id: 1,     rpc: 'https://eth.drpc.org',        explorer: 'https://etherscan.io' },
  optimism:  { id: 10,    rpc: 'https://optimism.drpc.org',   explorer: 'https://optimistic.etherscan.io' },
  bsc:       { id: 56,    rpc: 'https://bsc.drpc.org',        explorer: 'https://bscscan.com' },
  plume:     { id: 98866, rpc: 'https://rpc.plume.org',       explorer: 'https://explorer.plume.org' },
  base:      { id: 8453,  rpc: 'https://base.drpc.org',       explorer: 'https://basescan.org' },
  arbitrum:  { id: 42161, rpc: 'https://arbitrum.drpc.org',   explorer: 'https://arbiscan.io' },
  avalanche: { id: 43114, rpc: 'https://avalanche.drpc.org',  explorer: 'https://snowtrace.io' },
  monad:     { id: 143,   rpc: 'https://rpc.monad.xyz',       explorer: '' },
} as const;

export type ChainKey = keyof typeof CHAINS;

/** Centrifuge V3 internal chain IDs (centrifugeId). */
export const CENTRIFUGE_ID: Record<ChainKey, number> = {
  ethereum: 1,
  base: 2,
  arbitrum: 3,
  plume: 4,
  avalanche: 5,
  bsc: 6,
  optimism: 10,
  monad: 11,
};

/** Resolve our chain-key from Centrifuge's internal chain name. */
export function chainKeyFromName(name: string | undefined | null): ChainKey | undefined {
  if (!name) return undefined;
  const norm = name.toLowerCase();
  if (norm === 'binance') return 'bsc';
  return norm in CHAINS ? (norm as ChainKey) : undefined;
}

export interface TokenDef {
  /** Display symbol. */
  symbol: string;
  /** ERC-20 decimals — all Centrifuge tokens use 18. */
  decimals: number;
  /** For deRWA wrappers, the underlying institutional symbol. */
  instSymbol?: string;
  /** EVM deployments — each chain has the ERC-20 contract address. */
  deployments: Partial<Record<ChainKey, string>>;
  /**
   * Optional: earliest block to scan Transfer events from. Set to the
   * contract deployment block when known, so the holders reader doesn't
   * waste requests scanning pre-deployment history. When omitted, the
   * reader falls back to a bounded recent lookback window.
   */
  fromBlock?: Partial<Record<ChainKey, number>>;
}

/** Institutional (whitelisted) pool tokens.
 *
 * `fromBlock` values were discovered once via binary-search eth_getCode
 * (see scripts/discover-deployment-blocks.ts). Chains not listed fall back
 * to a bounded `defaultLookback` window in the holders reader. */
export const INSTITUTIONAL_TOKENS: Record<string, TokenDef> = {
  JTRSY: {
    symbol: 'JTRSY',
    decimals: 18,
    deployments: {
      ethereum:  '0x8c213ee79581ff4984583c6a801e5263418c4b86',
      base:      '0x8c213ee79581ff4984583c6a801e5263418c4b86',
      arbitrum:  '0x8c213ee79581ff4984583c6a801e5263418c4b86',
      avalanche: '0xa5d465251fbcc907f5dd6bb2145488dfc6a2627b',
      plume:     '0xa5d465251fbcc907f5dd6bb2145488dfc6a2627b',
      bsc:       '0xa5d465251fBCc907f5Dd6bB2145488DFC6a2627b',
      monad:     '0xc18e6f730896971a79d748e8dea61067a9bc6040',
    },
    fromBlock: {
      ethereum:  20460672,
      base:      18046774,
      avalanche: 65905795,
      plume:     28912530,
      monad:     66899825,
    },
  },
  JAAA: {
    symbol: 'JAAA',
    decimals: 18,
    deployments: {
      ethereum:  '0x5a0f93d040de44e78f251b03c43be9cf317dcf64',
      base:      '0x5a0F93D040De44e78F251b03c43be9CF317Dcf64',
      avalanche: '0x58f93d6b1ef2f44ec379cb975657c132cbed3b6b',
      bsc:       '0x58F93d6b1EF2F44eC379Cb975657C132CBeD3B6b',
      monad:     '0xad48f183e586e92a591a610397ebf534609df797',
    },
    fromBlock: {
      ethereum:  22409087,
      avalanche: 79416333,
      monad:     66900049,
    },
  },
  ACRDX: {
    symbol: 'ACRDX',
    decimals: 18,
    deployments: {
      ethereum: '0x9477724Bb54AD5417de8Baff29e59DF3fB4DA74f',
      base:     '0x9477724Bb54AD5417de8Baff29e59DF3fB4DA74f',
      plume:    '0x9477724bb54ad5417de8baff29e59df3fb4da74f',
      monad:    '0x2fabf1c784b8583d63c00c5c9c0377d8cf1a3245',
    },
    fromBlock: {
      ethereum: 24064811,
      base:     37352337,
      plume:    28873096,
      monad:    66899053,
    },
  },
  SPXA: {
    symbol: 'SPXA',
    decimals: 18,
    deployments: {
      base: '0x09b61343097c1f9b159a3ae7151298efd10f0db2',
    },
    fromBlock: {
      base: 35916021,
    },
  },
};

/** deRWA wrapper tokens (freely transferable, composable in DeFi). */
export const DERWA_TOKENS: Record<string, TokenDef> = {
  deJTRSY: {
    symbol: 'deJTRSY',
    instSymbol: 'JTRSY',
    decimals: 18,
    deployments: {
      ethereum:  '0xa6233014b9b7aaa74f38fa1977ffc7a89642dc72',
      base:      '0xa6233014b9b7aaa74f38fa1977ffc7a89642dc72',
      arbitrum:  '0xa6233014b9b7aaa74f38fa1977ffc7a89642dc72',
      avalanche: '0xa6233014b9b7aaa74f38fa1977ffc7a89642dc72',
    },
    fromBlock: {
      avalanche: 66355492,
    },
  },
  deJAAA: {
    symbol: 'deJAAA',
    instSymbol: 'JAAA',
    decimals: 18,
    deployments: {
      ethereum:  '0xaaa0008c8cf3a7dca931adaf04336a5d808c82cc',
      base:      '0xaaa0008c8cf3a7dca931adaf04336a5d808c82cc',
      arbitrum:  '0xaaa0008c8cf3a7dca931adaf04336a5d808c82cc',
      avalanche: '0xaaa0008c8cf3a7dca931adaf04336a5d808c82cc',
    },
    fromBlock: {
      ethereum: 23589729,
      arbitrum: 439550451,
    },
  },
  deCRDX: {
    symbol: 'deCRDX',
    instSymbol: 'ACRDX',
    decimals: 18,
    deployments: {
      optimism: '0x9e2679eabff131b8b1b48ff7566140794e0eedc4',
    },
    fromBlock: {
      optimism: 147401663,
    },
  },
  deSPXA: {
    symbol: 'deSPXA',
    instSymbol: 'SPXA',
    decimals: 18,
    deployments: {
      base: '0x9c5C365e764829876243d0b289733B9D2b729685',
    },
    fromBlock: {
      base: 43171719,
    },
  },
};

/** All tokens keyed by symbol — used by the onchain supply reader. */
export const ALL_TOKENS: Record<string, TokenDef> = {
  ...INSTITUTIONAL_TOKENS,
  ...DERWA_TOKENS,
};

/** Core protocol contracts (same address across all chains). */
export const PROTOCOL = {
  hub:              '0xA4A7Bb3831958463b3FE3E27A6a160F764341953',
  hubRegistry:      '0x19f46D8130e610C6C0f0116EA40Fb781dEFaDE93',
  accounting:       '0x050206c38f06e4710C4a37D39F75Ddc5c16a7396',
  holdings:         '0x3f0c8D8d2637881c3f6d8531F51a47c2094C918d',
  shareClassManager:'0xaFFC269c8fe18EE9C7DDb22301AC2c2507d69BEf',
  spoke:            '0xEC3582fcDc34078a4B7a8c75a5a3AE46f48525aB',
  balanceSheet:     '0x12a110cE5f0FC871cC72Bc7ECaF35cf39DD0f43e',
  tokenFactory:     '0xcE1616505F93215751FBb41Efac618b631997c38',
  vaultRegistry:    '0xd9531AC47928c3386346f82d9A2478960bf2CA7B',
} as const;
