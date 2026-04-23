/**
 * Euler v2 reader — uses the official Goldsky subgraph.
 *
 * An Euler market has two EVaults:
 *   - Collateral vault: wraps the collateral (deSPXA → edeSPXA-1).
 *     Users deposit here; shares are used as collateral.
 *   - Borrow vault: wraps the borrowable asset (USDC → eUSDC-86).
 *     Users deposit for yield; borrowers draw from here.
 *
 * Both vaults live in the same subgraph. We fetch both in one query and
 * combine: supply/borrow/APY come from the borrow vault; collateral amount
 * comes from the collateral vault.
 *
 * Subgraph docs: https://docs.euler.finance/developers/data-querying/subgraphs/
 */

const EULER_BASE_SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn';

export interface EulerMarketStats {
  collateralVault: string;
  borrowVault: string;
  collateralSymbol: string;
  loanSymbol: string;
  /** USD value of deSPXA collateral locked in the collateral vault. */
  collateralUsd: number;
  /** USD supplied to the borrow vault (lenders). */
  supplyUsd: number;
  /** USD borrowed from the borrow vault. */
  borrowUsd: number;
  /** Utilization = borrow / supply (0..1). */
  utilization: number;
  /** Annualized supply APY (0..1). */
  supplyApy: number;
  /** Annualized borrow APY (0..1). */
  borrowApy: number;
  /** Chainlink / Chronicle oracle address used to price collateral. */
  oracleAddress: string;
}

/** Tiny formatUnits — avoids a viem dependency. */
function formatUnits(value: bigint, decimals: number): number {
  if (decimals <= 0) return Number(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  return Number(whole) + Number(remainder) / Number(divisor);
}

function safeBigInt(value: string | null | undefined): bigint {
  if (!value) return BigInt(0);
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

interface VaultNode {
  id: string;
  name: string;
  symbol: string;
  asset: string;
  oracle: string;
  state: {
    totalShares: string;
    totalBorrows: string;
    cash: string;
    supplyApy: string;
    borrowApy: string;
  } | null;
}

/**
 * Fetch live state for an Euler market given its two vault addresses.
 *
 * @param collateralVault  The EVault that holds the collateral (deSPXA).
 * @param borrowVault      The EVault users borrow from (USDC).
 * @param navUsd           Wrapper NAV — used to convert collateral shares to USD.
 * @param collateralDecimals  Decimals of the underlying collateral token (18 for deSPXA).
 * @param loanDecimals     Decimals of the loan asset (6 for USDC).
 */
export async function getEulerMarketStats(
  collateralVault: string,
  borrowVault: string,
  navUsd: number,
  collateralDecimals = 18,
  loanDecimals = 6,
): Promise<EulerMarketStats | null> {
  const query = `
    query EulerVaults($ids: [ID!]!) {
      eulerVaults(where: { id_in: $ids }) {
        id
        name
        symbol
        asset
        oracle
        state {
          totalShares
          totalBorrows
          cash
          supplyApy
          borrowApy
        }
      }
    }
  `;
  const ids = [collateralVault.toLowerCase(), borrowVault.toLowerCase()];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(EULER_BASE_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { ids } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const vaults = (json?.data?.eulerVaults ?? []) as VaultNode[];
    const collVault = vaults.find((v) => v.id.toLowerCase() === collateralVault.toLowerCase());
    const loanVault = vaults.find((v) => v.id.toLowerCase() === borrowVault.toLowerCase());
    if (!collVault || !loanVault) return null;

    // Collateral vault: totalShares ≈ totalAssets when share price is 1:1.
    // For an edeSPXA-1 vault with no borrows this is a good enough proxy.
    const collShares = safeBigInt(collVault.state?.totalShares);
    const collAmount = formatUnits(collShares, collateralDecimals);

    // Borrow vault: supply = cash + totalBorrows. (cash is what's lent-out-able.)
    const loanCash = safeBigInt(loanVault.state?.cash);
    const loanBorrows = safeBigInt(loanVault.state?.totalBorrows);
    const loanSupply = loanCash + loanBorrows;

    const supplyUsd = formatUnits(loanSupply, loanDecimals); // USDC is $1
    const borrowUsd = formatUnits(loanBorrows, loanDecimals);
    const utilization = supplyUsd > 0 ? borrowUsd / supplyUsd : 0;

    // Euler APYs come back as ray-scaled (1e27) strings.
    const RAY_SCALE = 1e27;
    const supplyApy = Number(loanVault.state?.supplyApy ?? 0) / RAY_SCALE;
    const borrowApy = Number(loanVault.state?.borrowApy ?? 0) / RAY_SCALE;

    return {
      collateralVault,
      borrowVault,
      collateralSymbol: collVault.symbol || 'edeSPXA',
      loanSymbol: loanVault.symbol || 'eUSDC',
      collateralUsd: collAmount * navUsd,
      supplyUsd,
      borrowUsd,
      utilization,
      supplyApy,
      borrowApy,
      oracleAddress: loanVault.oracle ?? '',
    };
  } catch (err) {
    console.error('[euler] subgraph query failed', err);
    return null;
  }
}
