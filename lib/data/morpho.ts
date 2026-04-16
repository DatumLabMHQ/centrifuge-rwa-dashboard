/**
 * Morpho Blue API connector — fetches live + historical lending market stats.
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
  createdAt: number; // unix timestamp

  // Current state
  supplyUsd: number;       // direct supply to this market only
  borrowUsd: number;       // direct borrows from this market only
  collateralUsd: number;
  liquidityUsd: number;    // available = supply - borrow (direct)
  sizeUsd: number;         // total market size incl. shared vault liquidity (matches Morpho UI)
  totalLiquidityUsd: number; // total liquidity incl. shared vaults (matches Morpho UI)
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  netSupplyApy: number;
  netBorrowApy: number;
  lltv: number;
  fee: number;
  oraclePrice: string;
  oracleType: string;
  oracleAddress: string;
  dailyPriceVariation: number;
  badDebtUsd: number;
  realizedBadDebtUsd: number;

  // Collateral health (derived)
  collateralRatio: number; // collateral / borrow
  distanceToLiquidation: number; // 1 - (borrow / (collateral * lltv))

  // Historical series (hourly, x=unix timestamp, y=value)
  historicalSupplyUsd: Array<{ x: number; y: number }>;
  historicalBorrowUsd: Array<{ x: number; y: number }>;
  historicalUtilization: Array<{ x: number; y: number }>;
  historicalSupplyApy: Array<{ x: number; y: number }>;
  historicalBorrowApy: Array<{ x: number; y: number }>;

  // IRM curve (101 points: utilization 0-100% → APY)
  irmCurve: Array<{ utilization: number; supplyApy: number; borrowApy: number }>;
}

const MORPHO_GQL = 'https://blue-api.morpho.org/graphql';

const FULL_MARKET_QUERY = `
  query MorphoMarketFull($marketId: String!, $chainId: Int!) {
    marketById(marketId: $marketId, chainId: $chainId) {
      creationTimestamp
      lltv
      oracle { address type }
      badDebt { usd }
      realizedBadDebt { usd }
      collateralAsset { symbol decimals address }
      loanAsset { symbol decimals address }
      state {
        supplyAssetsUsd
        borrowAssetsUsd
        collateralAssetsUsd
        liquidityAssetsUsd
        sizeUsd
        totalLiquidityUsd
        utilization
        supplyApy
        borrowApy
        netSupplyApy
        netBorrowApy
        price
        dailyPriceVariation
        fee
        rewards { asset { symbol } supplyApr borrowApr }
      }
      historicalState {
        supplyAssetsUsd { x y }
        borrowAssetsUsd { x y }
        utilization { x y }
        supplyApy { x y }
        borrowApy { x y }
      }
      currentIrmCurve { utilization supplyApy borrowApy }
    }
  }
`;

export async function getMorphoMarketStats(
  marketId: string,
  chainId: number,
): Promise<MorphoMarketStats | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(MORPHO_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: FULL_MARKET_QUERY,
        variables: { marketId, chainId },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const m = json?.data?.marketById;
    if (!m) return null;

    const s = m.state ?? {};
    const lltv = Number(m.lltv ?? '0') / 1e18;
    const supplyUsd = s.supplyAssetsUsd ?? 0;
    const borrowUsd = s.borrowAssetsUsd ?? 0;
    const collateralUsd = s.collateralAssetsUsd ?? 0;

    // Derived health metrics
    const collateralRatio = borrowUsd > 0 ? collateralUsd / borrowUsd : Infinity;
    const maxBorrow = collateralUsd * lltv;
    const distanceToLiquidation = maxBorrow > 0 ? 1 - (borrowUsd / maxBorrow) : 1;

    // Clean historical series (filter nulls)
    const cleanSeries = (arr: Array<{ x: number; y: number | null }> | null) =>
      (arr ?? [])
        .filter((p): p is { x: number; y: number } => p.y != null && Number.isFinite(p.y))
        .map((p) => ({ x: p.x, y: p.y }));

    return {
      marketId,
      chainId,
      collateralSymbol: m.collateralAsset?.symbol ?? 'unknown',
      collateralAddress: m.collateralAsset?.address ?? '',
      loanSymbol: m.loanAsset?.symbol ?? 'unknown',
      loanAddress: m.loanAsset?.address ?? '',
      createdAt: Number(m.creationTimestamp ?? 0),

      supplyUsd,
      borrowUsd,
      collateralUsd,
      liquidityUsd: s.liquidityAssetsUsd ?? 0,
      sizeUsd: s.sizeUsd ?? 0,
      totalLiquidityUsd: s.totalLiquidityUsd ?? 0,
      utilization: s.utilization ?? 0,
      supplyApy: s.supplyApy ?? 0,
      borrowApy: s.borrowApy ?? 0,
      netSupplyApy: s.netSupplyApy ?? 0,
      netBorrowApy: s.netBorrowApy ?? 0,
      lltv,
      fee: s.fee ?? 0,
      oraclePrice: String(s.price ?? ''),
      oracleType: m.oracle?.type ?? 'Unknown',
      oracleAddress: m.oracle?.address ?? '',
      dailyPriceVariation: s.dailyPriceVariation ?? 0,
      badDebtUsd: m.badDebt?.usd ?? 0,
      realizedBadDebtUsd: m.realizedBadDebt?.usd ?? 0,

      collateralRatio,
      distanceToLiquidation,

      historicalSupplyUsd: cleanSeries(m.historicalState?.supplyAssetsUsd),
      historicalBorrowUsd: cleanSeries(m.historicalState?.borrowAssetsUsd),
      historicalUtilization: cleanSeries(m.historicalState?.utilization),
      historicalSupplyApy: cleanSeries(m.historicalState?.supplyApy),
      historicalBorrowApy: cleanSeries(m.historicalState?.borrowApy),

      irmCurve: (m.currentIrmCurve ?? []).map((p: { utilization: number; supplyApy: number; borrowApy: number }) => ({
        utilization: p.utilization,
        supplyApy: p.supplyApy,
        borrowApy: p.borrowApy,
      })),
    };
  } catch {
    return null;
  }
}
