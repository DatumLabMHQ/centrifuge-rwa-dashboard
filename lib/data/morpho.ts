/**
 * Morpho Blue API connector — fetches live lending market stats for
 * deSPXA (or any future deRWA wrapper used as collateral on Morpho).
 *
 * Endpoint: https://blue-api.morpho.org/graphql
 * Public API, no key required.
 */

export interface MorphoMarketStats {
  marketId: string;
  chainId: number;
  collateralSymbol: string;
  collateralAddress: string;
  loanSymbol: string;
  loanAddress: string;
  /** Total USDC supplied to this market (USD). */
  supplyUsd: number;
  /** Total USDC borrowed against collateral (USD). */
  borrowUsd: number;
  /** Utilization ratio (0..1). */
  utilization: number;
  /** Annualized yield for suppliers. */
  supplyApy: number;
  /** Annualized cost for borrowers. */
  borrowApy: number;
  /** Liquidation loan-to-value (0..1). */
  lltv: number;
  /** Protocol fee (0..1). */
  fee: number;
  /** Oracle contract address on the chain. */
  oracleAddress: string;
}

const MORPHO_GQL = 'https://blue-api.morpho.org/graphql';

const MARKET_QUERY = `
  query MorphoMarket($marketId: String!, $chainId: Int!) {
    marketById(marketId: $marketId, chainId: $chainId) {
      loanAsset { symbol decimals address }
      collateralAsset { symbol decimals address }
      state {
        supplyAssetsUsd
        borrowAssetsUsd
        utilization
        supplyApy
        borrowApy
        fee
      }
      lltv
    }
  }
`;

export async function getMorphoMarketStats(
  marketId: string,
  chainId: number,
): Promise<MorphoMarketStats | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(MORPHO_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: MARKET_QUERY,
        variables: { marketId, chainId },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const m = json?.data?.marketById;
    if (!m) return null;

    return {
      marketId,
      chainId,
      collateralSymbol: m.collateralAsset?.symbol ?? 'unknown',
      collateralAddress: m.collateralAsset?.address ?? '',
      loanSymbol: m.loanAsset?.symbol ?? 'unknown',
      loanAddress: m.loanAsset?.address ?? '',
      supplyUsd: m.state?.supplyAssetsUsd ?? 0,
      borrowUsd: m.state?.borrowAssetsUsd ?? 0,
      utilization: m.state?.utilization ?? 0,
      supplyApy: m.state?.supplyApy ?? 0,
      borrowApy: m.state?.borrowApy ?? 0,
      lltv: Number(m.lltv ?? '0') / 1e18,
      fee: m.state?.fee ?? 0,
      oracleAddress: '',
    };
  } catch {
    return null;
  }
}
