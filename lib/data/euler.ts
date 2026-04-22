/**
 * Euler v2 EVault reader — reads lending market state directly from the
 * chain because:
 *   1. Euler doesn't expose a public GraphQL/subgraph API
 *   2. DefiLlama doesn't index the specific Clearstar-curated deSPXA market
 *   3. The market just launched — we need live on-chain numbers as it fills
 *
 * An Euler market has two vaults:
 *   - Collateral vault: wraps the collateral token (deSPXA in our case).
 *     Users deposit deSPXA here and it becomes eDeSPXA-1 shares.
 *   - Borrow vault: wraps the borrowable asset (USDC). Users borrow from here.
 *
 * We read ERC-4626 totalAssets/totalBorrows from both, convert to USD using
 * the wrapper's NAV (passed in by the caller), and return a compact summary.
 */

/** Tiny formatUnits — avoids pulling in viem just for this. */
function formatUnits(value: bigint, decimals: number): string {
  if (decimals <= 0) return value.toString();
  const str = value.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals);
  const frac = str.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export interface EulerMarketStats {
  /** The collateral vault address (eDeSPXA-1). */
  collateralVault: string;
  /** The borrow vault address (eUSDC-86). */
  borrowVault: string;
  /** Collateral symbol as reported by the vault. */
  collateralSymbol: string;
  /** Loan symbol as reported by the borrow vault. */
  loanSymbol: string;
  /** Collateral deposited, in USD. */
  collateralUsd: number;
  /** USDC supplied to the borrow vault, in USD. */
  supplyUsd: number;
  /** USDC borrowed, in USD. */
  borrowUsd: number;
  /** Utilization of the borrow vault (0..1). */
  utilization: number;
  /** Annualized borrow APR from the IRM, approximated from the spot rate. */
  borrowApr: number | null;
}

interface EthCall {
  to: string;
  data: string;
}

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  const res = await fetch('https://mainnet.base.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!res.ok) throw new Error(`Base RPC failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as string;
}

const eth_call = (call: EthCall) =>
  rpcCall('eth_call', [{ to: call.to, data: call.data }, 'latest']);

// Function selectors (first 4 bytes of keccak256)
const SEL = {
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalAssets: '0x01e1d114',
  totalBorrows: '0x47bd3718',
  interestRate: '0x7c3a00fd', // uint256 interestRate() — per-second rate in ray
};

function hexToNumber(hex: string): bigint {
  if (!hex || hex === '0x') return BigInt(0);
  return BigInt(hex);
}

function decodeString(hex: string): string {
  if (!hex || hex === '0x') return '';
  try {
    const bytes = Buffer.from(hex.slice(2), 'hex');
    // ERC20 symbol is either raw bytes32 or abi-encoded string.
    // Heuristic: if the offset word exists, decode as string.
    if (bytes.length >= 64) {
      const length = Number(BigInt(`0x${bytes.slice(32, 64).toString('hex')}`));
      if (length > 0 && length < 100) {
        return bytes.slice(64, 64 + length).toString('utf-8').replace(/\0/g, '').trim();
      }
    }
    return bytes.toString('utf-8').replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

/**
 * Read an Euler market's live state from two EVault addresses.
 * Returns `null` if any required read fails — caller should gracefully hide
 * the Euler section in that case rather than showing partial data.
 */
export async function getEulerMarketStats(
  collateralVault: string,
  borrowVault: string,
  navUsd: number,
  loanDecimals = 6,
): Promise<EulerMarketStats | null> {
  try {
    const [
      collSymbolHex,
      collDecHex,
      collTotalAssetsHex,
      loanSymbolHex,
      loanTotalAssetsHex,
      loanTotalBorrowsHex,
      loanIrHex,
    ] = await Promise.all([
      eth_call({ to: collateralVault, data: SEL.symbol }),
      eth_call({ to: collateralVault, data: SEL.decimals }),
      eth_call({ to: collateralVault, data: SEL.totalAssets }),
      eth_call({ to: borrowVault, data: SEL.symbol }),
      eth_call({ to: borrowVault, data: SEL.totalAssets }),
      eth_call({ to: borrowVault, data: SEL.totalBorrows }),
      eth_call({ to: borrowVault, data: SEL.interestRate }).catch(() => '0x'),
    ]);

    const collDecimals = Number(hexToNumber(collDecHex));
    const collRaw = hexToNumber(collTotalAssetsHex);
    const loanSupplyRaw = hexToNumber(loanTotalAssetsHex);
    const loanBorrowRaw = hexToNumber(loanTotalBorrowsHex);

    const collAmt = Number(formatUnits(collRaw, collDecimals || 18));
    const loanSupply = Number(formatUnits(loanSupplyRaw, loanDecimals));
    const loanBorrow = Number(formatUnits(loanBorrowRaw, loanDecimals));

    // Euler's interestRate() returns per-second interest as a ray (1e27).
    // APR = rate * seconds_per_year / 1e27. Null when we can't read it.
    const irRay = hexToNumber(loanIrHex);
    const SECONDS_PER_YEAR = BigInt(31536000);
    const RAY = BigInt(10) ** BigInt(27);
    const SCALE = BigInt(10000);
    const borrowApr =
      irRay > BigInt(0)
        ? Number((irRay * SECONDS_PER_YEAR * SCALE) / RAY) / 10000
        : null;

    const utilization = loanSupply > 0 ? loanBorrow / loanSupply : 0;

    return {
      collateralVault,
      borrowVault,
      collateralSymbol: decodeString(collSymbolHex) || 'eDeSPXA',
      loanSymbol: decodeString(loanSymbolHex) || 'eUSDC',
      collateralUsd: collAmt * navUsd,
      supplyUsd: loanSupply, // USDC is 1:1 with USD
      borrowUsd: loanBorrow,
      utilization,
      borrowApr,
    };
  } catch (err) {
    console.error('[euler] reader failed', err);
    return null;
  }
}
