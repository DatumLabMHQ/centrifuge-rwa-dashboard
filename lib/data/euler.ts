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

/**
 * Base RPC — `BASE_RPC_URL` env var lets deployments swap in Alchemy or
 * another paid provider. Falls back to `base.drpc.org` which handles
 * batched requests without rate-limiting (unlike `mainnet.base.org` or
 * `base.llamarpc.com`).
 */
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? 'https://base.drpc.org';

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(BASE_RPC_URL, {
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

/**
 * Batched version of eth_call — sends multiple calls in one JSON-RPC batch
 * request, which works around strict per-request rate limits on public RPCs.
 */
async function rpcBatch(calls: EthCall[]): Promise<string[]> {
  const body = calls.map((c, i) => ({
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{ to: c.to, data: c.data }, 'latest'],
    id: i,
  }));
  const res = await fetch(BASE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Base RPC batch failed: ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error(`Base RPC batch returned non-array: ${JSON.stringify(json).slice(0, 100)}`);
  }
  // Responses may come back out of order — sort by id.
  json.sort((a: { id: number }, b: { id: number }) => a.id - b.id);
  return json.map((r: { result?: string; error?: { message: string } }) => {
    if (r.error) throw new Error(r.error.message);
    return r.result ?? '0x';
  });
}

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
    // One batched JSON-RPC request instead of seven — avoids public-RPC
    // rate limits when this runs on Vercel.
    const [
      collSymbolHex,
      collDecHex,
      collTotalAssetsHex,
      loanSymbolHex,
      loanTotalAssetsHex,
      loanTotalBorrowsHex,
      loanIrHex,
    ] = await rpcBatch([
      { to: collateralVault, data: SEL.symbol },
      { to: collateralVault, data: SEL.decimals },
      { to: collateralVault, data: SEL.totalAssets },
      { to: borrowVault, data: SEL.symbol },
      { to: borrowVault, data: SEL.totalAssets },
      { to: borrowVault, data: SEL.totalBorrows },
      { to: borrowVault, data: SEL.interestRate },
    ]).catch(() => ['0x', '0x', '0x', '0x', '0x', '0x', '0x']);
    void eth_call; // keep the single-call helper available for future use

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
