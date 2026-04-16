/**
 * Centrifuge GraphQL types — confirmed via live introspection of
 * https://api.centrifuge.io on 2026-04-07.
 *
 * Numeric fields are BigInt-as-string in the API. Convert with
 * Number(value) / 10**decimals at the display layer.
 */

export interface Blockchain {
  id: string;
  centrifugeId: string;
  network: string;
  chainId: number;
  name: string;
  explorer?: string;
  icon?: string;
}

export interface TokenInstance {
  centrifugeId: string;
  tokenId: string;
  isActive: boolean;
  address: string;
  tokenPrice: string; // BigInt, 18 decimals
  totalIssuance: string; // BigInt, token.decimals
  blockchain: Pick<Blockchain, 'name' | 'chainId' | 'centrifugeId'>;
}

export interface Token {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  isActive: boolean;
  totalIssuance: string; // BigInt, sum across all tokenInstances
  tokenPrice: string; // BigInt, 18 decimals
  poolId: string;
  tokenInstances: { items: TokenInstance[] };
}

export interface Pool {
  id: string;
  centrifugeId: string;
  isActive: boolean;
  currency: string; // ISO 4217 code, e.g. "840" for USD
  decimals: number;
  metadata?: string; // ipfs:// URI to the canonical pool description JSON
  name: string | null;
  createdAt: string;
  tokens: { items: Token[] };
}

export type InvestorTransactionType =
  | 'DEPOSIT_REQUEST_UPDATED'
  | 'REDEEM_REQUEST_UPDATED'
  | 'DEPOSIT_REQUEST_CANCELLED'
  | 'REDEEM_REQUEST_CANCELLED'
  | 'DEPOSIT_REQUEST_EXECUTED'
  | 'REDEEM_REQUEST_EXECUTED'
  | 'DEPOSIT_CLAIMABLE'
  | 'REDEEM_CLAIMABLE'
  | 'DEPOSIT_CLAIMED'
  | 'REDEEM_CLAIMED'
  | 'SYNC_DEPOSIT'
  | 'SYNC_REDEEM'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

/** Transaction types that count as net positive flow into a pool. */
export const DEPOSIT_TYPES: InvestorTransactionType[] = [
  'DEPOSIT_REQUEST_EXECUTED',
  'DEPOSIT_CLAIMED',
  'SYNC_DEPOSIT',
];

/** Transaction types that count as net negative flow out of a pool. */
export const REDEEM_TYPES: InvestorTransactionType[] = [
  'REDEEM_REQUEST_EXECUTED',
  'REDEEM_CLAIMED',
  'SYNC_REDEEM',
];

/**
 * Per-(account, chain, token) holding row from `tokenInstancePositions`.
 * Schema confirmed against api.centrifuge.io 2026-04-07.
 */
export interface TokenInstancePosition {
  tokenId: string;
  centrifugeId: string;
  accountAddress: string;
  balance: string; // BigInt, scale by token.decimals
  isFrozen: boolean;
  tokenInstance: {
    token: {
      id: string;
      symbol: string;
      decimals: number;
      tokenPrice: string; // BigInt, 18 decimals
      pool: { id: string; name: string | null };
    };
    blockchain: { name: string; chainId: number };
  };
}

export interface InvestorTransaction {
  txHash: string;
  centrifugeId: string;
  poolId: string;
  tokenId: string;
  type: InvestorTransactionType;
  account: string;
  tokenAmount: string; // BigInt
  currencyAmount: string; // BigInt, in the pool's currency
  tokenPrice: string; // BigInt, 18 decimals
  createdAt: string;
  blockchain: Pick<Blockchain, 'name' | 'chainId' | 'centrifugeId'>;
}

/**
 * Cross-chain bridge payload from `crosschainPayloads`. Represents a single
 * message routed between chains via the Centrifuge V3 spoke. We aggregate
 * these per (fromBlockchain → toBlockchain) pair to render the cross-chain
 * Sankey on the Flow page.
 */
export interface CrossChainTransaction {
  id: string;
  poolId: string;
  tokenId: string;
  status: string;
  createdAt: string;
  fromCentrifugeId: string | null;
  toCentrifugeId: string | null;
  fromBlockchain: Pick<Blockchain, 'name' | 'chainId' | 'centrifugeId'> | null;
  toBlockchain: Pick<Blockchain, 'name' | 'chainId' | 'centrifugeId'> | null;
}

/**
 * Enriched payload for one deRWA wrapper, returned by /api/derwa.
 * Combines:
 *  - Centrifuge pool data (TVL, supply, chains)
 *  - Wrap ratio vs the institutional underlying
 *  - Holder count + top holders (from tokenInstancePositions)
 *  - Historical sparkline (from tokenSnapshots)
 *  - DEX stats from GeckoTerminal (when an Aerodrome pool address is known)
 *  - Computed premium/discount: (DEX price - NAV) / NAV
 */
export interface DerwaWrapperRow {
  symbol: string;
  name: string;
  tokenId: string;
  manager: string;
  description: string;

  /** Current wrapper TVL in USD. */
  tvlUsd: number;
  /** Wrapper price = NAV from Centrifuge. */
  navUsd: number;
  /** Total token supply across all chains. */
  totalSupply: number;

  /** Net flow over the active window (deposits − redemptions). */
  flowUsd: number;

  /** Wrap ratio: wrapper TVL / institutional pool TVL. Null if no inst pool found. */
  wrapRatio: number | null;
  /** Companion institutional pool TVL. Null if not found. */
  instTvlUsd: number | null;
  /** Symbol of the institutional pool. */
  instSymbol: string;

  /** Per-chain breakdown (existing pattern). */
  chains: Array<{ name: string; chainId: number; supply: number; tvlUsd: number; address: string }>;

  /** Distinct holder count. */
  holderCount: number;
  /** Top 5 holders by USD value. */
  topHolders: Array<{ account: string; chain: string; shares: number; valueUsd: number }>;

  /** Historical TVL series (within the active window). */
  sparkline: Array<{ t: number; tvl: number }>;

  /** DEX stats from GeckoTerminal — null if no known pool address or fetch failed. */
  dex: {
    network: string;
    address: string;
    priceUsd: number | null;
    liquidityUsd: number;
    volume24hUsd: number;
    /** (dexPrice - NAV) / NAV * 100. Null if no dex price. */
    premiumPct: number | null;
  } | null;
}

export interface DerwaData {
  wrappers: DerwaWrapperRow[];
  windowDays: number;
  totalDerwaTvl: number;
  totalInstTvl: number;
  totalWrapRatio: number;
  totalHolders: number;
  lastUpdated: string;
}

/** Per-wrapper recent transaction (mint/burn) for the detail page. */
export interface DerwaTxRow {
  txHash: string;
  type: InvestorTransactionType;
  account: string;
  chain: string;
  valueUsd: number;
  tokenAmount: number;
  createdAt: number; // ms-since-epoch
}

/** Per-chain holder count breakdown for the detail page. */
export interface ChainHolderRow {
  chain: string;
  chainId: number;
  holderCount: number;
  supply: number;
  tvlUsd: number;
}

/**
 * Detailed wrapper payload — richer than `DerwaWrapperRow`. Returned by
 * `/api/derwa/[symbol]` and consumed by the per-wrapper detail page.
 */
/** Live Morpho lending market stats — null if no Morpho integration or fetch failed. */
export interface MorphoMarketData {
  marketId: string;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  supplyUsd: number;
  borrowUsd: number;
  collateralUsd: number;
  liquidityUsd: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  lltv: number;
  fee: number;
  marketUrl: string;
  createdAt: number;
  oracleType: string;
  oracleAddress: string;
  dailyPriceVariation: number;
  badDebtUsd: number;
  collateralRatio: number;
  distanceToLiquidation: number;
  historicalSupplyUsd: Array<{ x: number; y: number }>;
  historicalBorrowUsd: Array<{ x: number; y: number }>;
  historicalUtilization: Array<{ x: number; y: number }>;
  historicalSupplyApy: Array<{ x: number; y: number }>;
  historicalBorrowApy: Array<{ x: number; y: number }>;
  irmCurve: Array<{ utilization: number; supplyApy: number; borrowApy: number }>;
}

export interface DerwaDetailData {
  wrapper: DerwaWrapperRow;
  /** Top 25 holders instead of top 5. */
  topHolders: Array<{ account: string; chain: string; shares: number; valueUsd: number }>;
  /** Recent mints/burns for this wrapper, newest first. */
  recentTransactions: DerwaTxRow[];
  /** Distinct holder count per chain. */
  chainHolders: ChainHolderRow[];
  /** Full integrations list (already in DerwaContext but flattened for the UI). */
  integrations: Array<{
    protocol: string;
    kind: 'dex' | 'oracle' | 'lending' | 'wallet' | 'cex';
    chain?: string;
    address?: string;
    url?: string;
    status: 'live' | 'announced' | 'planned';
  }>;
  /** Live Morpho market stats — null if no Morpho market or fetch failed. */
  morpho: MorphoMarketData | null;
  windowDays: number;
  lastUpdated: string;
}

export interface CrossChainFlowData {
  /** Sankey nodes — one per chain that has any cross-chain activity. */
  nodes: Array<{ name: string; centrifugeId: string }>;
  /** One link per (source chain, target chain) pair with non-zero flow. */
  links: Array<{ source: number; target: number; value: number }>;
  totalVolumeUsd: number;
  txCount: number;
  windowDays: number;
}

/** Aggregated overview payload returned by /api/overview */
export interface OverviewData {
  totals: {
    tvlUsd: number;
    activePools: number;
    activeChains: number;
    netFlows30dUsd: number;
  };
  byChain: Array<{ name: string; chainId: number; tvlUsd: number }>;
  byAssetClass: Array<{ class: string; tvlUsd: number; pools: number }>;
  topPools: Array<{
    id: string;
    name: string;
    symbol: string;
    tvlUsd: number;
    chains: string[];
  }>;
  lastUpdated: string;
}

/** TVL history payload returned by /api/tvl-history (DefiLlama) */
export interface TvlHistoryData {
  totalTvlUsd: number;
  currentChainTvls: Record<string, number>;
  series: Array<{ date: string; total: number; byChain: Record<string, number> }>;
  lastUpdated: string;
}

/** A row in the Pools table — one row per pool, flattened from GraphQL. */
export interface PoolRow {
  id: string;
  name: string;
  symbol: string;
  isActive: boolean;
  assetClass: string;
  isDeRwa: boolean;
  decimals: number;
  tokenPriceUsd: number;
  totalSupply: number;
  tvlUsd: number;
  chains: Array<{ name: string; chainId: number; supply: number; tvlUsd: number; address: string }>;
  flows30dUsd: number;
  txCount30d: number;
  managerAddress?: string;
}

export interface PoolsData {
  pools: PoolRow[];
  lastUpdated: string;
}

/** A holder row on the Investors page. */
export interface HolderRow {
  account: string;
  poolId: string;
  poolName: string;
  symbol: string;
  chain: string;
  shares: number;
  tokenPriceUsd: number;
  valueUsd: number;
}

export interface InvestorsData {
  topHolders: HolderRow[];
  totalUniqueAccounts: number;
  totalPositions: number;
  lastUpdated: string;
}

/** A node/link in the flow-of-funds Sankey diagram. */
export interface FlowNode {
  name: string;
  category: 'currency' | 'vault' | 'pool' | 'wrapper' | 'venue';
  valueUsd: number;
}

export interface FlowLink {
  source: number;
  target: number;
  value: number;
}

export interface FlowData {
  nodes: FlowNode[];
  links: FlowLink[];
  totalDepositsUsd: number;
  totalRedemptionsUsd: number;
  txCount: number;
  windowDays: number;
  lastUpdated: string;
}
