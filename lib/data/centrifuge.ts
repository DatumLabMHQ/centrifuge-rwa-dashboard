/**
 * Thin server-side wrapper around the Centrifuge GraphQL API.
 *
 * Uses the SDK's GraphConnector with a single "chain" entry, because the
 * Centrifuge V3 indexer at https://api.centrifuge.io is one cross-chain
 * endpoint — there is no per-chain subgraph to register.
 */

import { GraphConnector } from '@/lib/sdk/graph-connector';
import {
  ALL_POOLS_QUERY,
  RECENT_FLOW_TRANSACTIONS_QUERY,
  RECENT_CROSS_CHAIN_TRANSACTIONS_QUERY,
  TOKEN_SNAPSHOTS_QUERY,
  TOP_POSITIONS_QUERY,
} from '@/lib/queries/overview';
import type {
  CrossChainTransaction,
  Pool,
  InvestorTransaction,
  TokenInstancePosition,
} from '@/lib/data/types';

const CENTRIFUGE_KEY = 'centrifuge';

const centrifuge = new GraphConnector({
  chains: {
    [CENTRIFUGE_KEY]: {
      name: 'Centrifuge',
      shortName: 'CFG',
      subgraphUrl:
        process.env.CENTRIFUGE_GRAPHQL_URL ?? 'https://api.centrifuge.io',
    },
  },
});

interface PoolsResponse {
  pools: { items: Pool[] };
}

interface TxResponse {
  investorTransactions: { items: InvestorTransaction[] };
}

export async function getAllPools(limit = 200): Promise<Pool[]> {
  const data = await centrifuge.query<PoolsResponse>(
    CENTRIFUGE_KEY,
    ALL_POOLS_QUERY,
    { limit },
  );
  return data.pools.items;
}

export async function getRecentFlowTransactions(
  limit = 1000,
): Promise<InvestorTransaction[]> {
  const data = await centrifuge.query<TxResponse>(
    CENTRIFUGE_KEY,
    RECENT_FLOW_TRANSACTIONS_QUERY,
    { limit },
  );
  return data.investorTransactions.items;
}

interface CrossChainTxResponse {
  crosschainPayloads: { items: CrossChainTransaction[] };
}

export async function getRecentCrossChainTransactions(
  limit = 1000,
): Promise<CrossChainTransaction[]> {
  const data = await centrifuge.query<CrossChainTxResponse>(
    CENTRIFUGE_KEY,
    RECENT_CROSS_CHAIN_TRANSACTIONS_QUERY,
    { limit },
  );
  return data.crosschainPayloads.items;
}

interface PositionsResponse {
  tokenInstancePositions: { items: TokenInstancePosition[] };
}

/** Single-point of a token's historical supply + price. */
export interface TokenSnapshot {
  timestamp: string;
  totalIssuance: string;
  tokenPrice: string;
}

interface SnapshotResponse {
  tokenSnapshots: { items: TokenSnapshot[] };
}

export async function getTokenSnapshots(
  tokenId: string,
  limit = 365,
): Promise<TokenSnapshot[]> {
  const data = await centrifuge.query<SnapshotResponse>(
    CENTRIFUGE_KEY,
    TOKEN_SNAPSHOTS_QUERY,
    { tokenId, limit },
  );
  return data.tokenSnapshots.items;
}

export async function getTopPositions(limit = 1000): Promise<TokenInstancePosition[]> {
  const data = await centrifuge.query<PositionsResponse>(
    CENTRIFUGE_KEY,
    TOP_POSITIONS_QUERY,
    { limit },
  );
  return data.tokenInstancePositions.items;
}
