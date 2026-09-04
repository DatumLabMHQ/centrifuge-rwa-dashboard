import { gql } from '@apollo/client';

/**
 * Top holders across all chains/tokens.
 *
 * Schema entity is `tokenInstancePositions`, not `investorPositions`.
 * Returns one row per (account, chain, token) — we group by (account, token)
 * client-side to roll up cross-chain holdings of the same wrapper.
 */
export const TOP_POSITIONS_QUERY = gql`
  query TopPositions($limit: Int!) {
    tokenInstancePositions(limit: $limit, orderBy: "balance", orderDirection: "desc") {
      items {
        tokenId
        centrifugeId
        accountAddress
        balance
        isFrozen
        tokenInstance {
          token {
            id
            symbol
            decimals
            tokenPrice
            pool {
              id
              name
            }
          }
          blockchain {
            name
            chainId
          }
        }
      }
    }
  }
`;

/**
 * GraphQL queries for the Centrifuge RWA Overview page.
 *
 * Schema notes (introspected 2026-04-07 from https://api.centrifuge.io):
 *  - List queries return { items: [...] } pages.
 *  - Numeric fields (totalIssuance, tokenPrice, currencyAmount, tokenAmount)
 *    are BigInt-as-string. tokenPrice is always 18 decimals; everything else
 *    uses the token's `decimals` field.
 *  - Pool.currency is an ISO 4217 numeric code, "840" = USD.
 *  - Pool.name can be null for partial/test pools — filter or fall back at the
 *    display layer.
 */

/**
 * Pull every active pool with its tokens and per-chain instances.
 * Used by /api/overview to compute total TVL, active pools, active chains
 * and the per-chain breakdown.
 */
export const ALL_POOLS_QUERY = gql`
  query AllPools($limit: Int!) {
    pools(limit: $limit, where: { isActive: true }) {
      items {
        id
        name
        isActive
        currency
        decimals
        metadata
        tokens {
          items {
            id
            symbol
            name
            decimals
            isActive
            totalIssuance
            tokenPrice
            tokenInstances {
              items {
                centrifugeId
                address
                isActive
                totalIssuance
                tokenPrice
                blockchain {
                  name
                  chainId
                  centrifugeId
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Pull recent deposit/redeem transactions to compute net 30-day flow.
 *
 * We filter to the meaningful flow types at the query level using
 * `where: { type_in: [...] }`, because the most recent untyped transactions
 * are dominated by cross-chain TRANSFER_IN/TRANSFER_OUT events (which have
 * tokenPrice=0 and currencyAmount=0 and don't represent net new capital).
 *
 * createdAt is millis-since-epoch as a STRING — parse with Number(), not
 * Date.parse().
 */
/**
 * Cross-chain payloads — actual bridge messages routed between chains via the
 * Centrifuge V3 spoke messaging layer. Each payload moves a token between
 * `fromBlockchain` and `toBlockchain`. We count these per chain-pair to show
 * which cross-chain routes are most active.
 *
 * (TRANSFER_IN / TRANSFER_OUT investorTransactions are just intra-chain ERC20
 * movements — they always have fromCentrifugeId === toCentrifugeId and are
 * NOT what we want for the cross-chain Sankey.)
 */
export const RECENT_CROSS_CHAIN_TRANSACTIONS_QUERY = gql`
  query RecentCrossChainPayloads($limit: Int!) {
    crosschainPayloads(
      limit: $limit
      orderBy: "createdAt"
      orderDirection: "desc"
    ) {
      items {
        id
        fromCentrifugeId
        toCentrifugeId
        poolId
        tokenId
        status
        createdAt
        fromBlockchain {
          name
          chainId
          centrifugeId
        }
        toBlockchain {
          name
          chainId
          centrifugeId
        }
      }
    }
  }
`;

/**
 * Per-token historical snapshots — supply and price over time. Used to draw
 * the deRWA wrapper sparklines (multiply totalIssuance × tokenPrice for TVL
 * at each point in time).
 */
export const TOKEN_SNAPSHOTS_QUERY = gql`
  query TokenSnapshots($tokenId: String!, $limit: Int!) {
    tokenSnapshots(
      limit: $limit
      orderBy: "timestamp"
      orderDirection: "desc"
      where: { id: $tokenId }
    ) {
      items {
        timestamp
        totalIssuance
        tokenPrice
      }
    }
  }
`;

export const RECENT_FLOW_TRANSACTIONS_QUERY = gql`
  query RecentFlowTransactions($limit: Int!) {
    investorTransactions(
      limit: $limit
      orderBy: "createdAt"
      orderDirection: "desc"
      where: {
        type_in: [
          SYNC_DEPOSIT
          DEPOSIT_CLAIMED
          DEPOSIT_REQUEST_EXECUTED
          SYNC_REDEEM
          REDEEM_CLAIMED
          REDEEM_REQUEST_EXECUTED
        ]
      }
    ) {
      items {
        txHash: createdAtTxHash
        poolId
        tokenId
        type
        currencyAmount
        tokenAmount
        tokenPrice
        createdAt
        blockchain {
          name
          chainId
          centrifugeId
        }
      }
    }
  }
`;
