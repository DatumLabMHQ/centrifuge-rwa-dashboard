/**
 * On-chain verification of the deRWA wrapper → institutional pool mapping.
 *
 * The mapping (e.g. "deSPXA wraps SPXA") lives in two hardcoded registries:
 * `lib/data/derwa-context.ts` (UI) and `lib/data/onchain/registry.ts`
 * (on-chain reads). Both are sourced from Centrifuge's announcements, not
 * derived from on-chain data. This module closes that loop by:
 *
 *   1. Calling `symbol()` and `name()` on each wrapper contract — the
 *      canonical Centrifuge wrappers self-identify in `name()` with the
 *      underlying fund's marketing name (e.g. "DeFi Janus Henderson
 *      Anemoy S&P500® Fund Token"). We assert the expected substring
 *      appears in the on-chain string.
 *
 *   2. Calling `balanceOf(wrapper)` on the institutional token contract.
 *      This reveals an important methodology truth: **the wrappers do
 *      not custody institutional shares.** Every wrapper has a zero
 *      balance of its corresponding institutional token. The "wrap" is
 *      not literal token-for-token escrow; the wrappers are independent
 *      ERC-20s issued by Centrifuge V3, most likely as sibling share
 *      classes claiming against the same pool's assets.
 *
 * What the report surfaces:
 *   - `nameOk`: true iff `name()` contains the expected fund-name token
 *   - `custodyModel`: 'none' (balanceOf=0) vs 'direct' (balanceOf>0)
 *   - the actual on-chain name() string for transparency
 *
 * Read-only. Cached at the API layer.
 */

import { batchEthCall, decodeString, decodeUint, encodeAddress, SEL } from './rpc';
import {
  DERWA_TOKENS,
  INSTITUTIONAL_TOKENS,
  type ChainKey,
  type TokenDef,
} from './registry';

/**
 * Expected substring that must appear (case-insensitive) in the wrapper's
 * on-chain `name()` string for the registry mapping to be considered
 * verified. Sourced from the actual current on-chain values.
 */
const EXPECTED_NAME_SUBSTRING: Record<string, string> = {
  deSPXA: 'S&P500',
  deJTRSY: 'Treasury',
  deJAAA: 'AAA CLO',
  deCRDX: 'Diversified Credit',
};

/** What share-class / custody model the on-chain evidence supports. */
export type CustodyModel =
  /** Wrapper holds the institutional token directly (escrow model). */
  | 'direct'
  /** Wrapper holds zero of the institutional token — independent ERC-20. */
  | 'none'
  /** No same-chain pair to test (wrapper deployed to a chain the institutional isn't on). */
  | 'cross-chain'
  /** RPC call failed — we couldn't determine custody. UI should retry or surface a warning. */
  | 'unknown';

/**
 * Chain preference order when picking which chain to verify on. Earlier
 * entries are tried first. Base is at the top because that's where our
 * paid Alchemy RPC lives in production (`BASE_RPC_URL` set on Vercel),
 * and most Centrifuge wrappers are also deployed on Base. Without this
 * ordering we'd fall back to free Ethereum RPCs which throttle batch
 * calls and silently fail.
 */
const CHAIN_PREFERENCE: ChainKey[] = [
  'base',
  'ethereum',
  'arbitrum',
  'avalanche',
  'plume',
  'optimism',
  'bsc',
  'monad',
];

export interface WrapperVerificationRow {
  /** deRWA wrapper symbol (e.g. "deSPXA"). */
  symbol: string;
  /** Institutional symbol the registry says it wraps. */
  expectedInstSymbol: string;
  /** Wrapper's address on the chain where we verified. */
  wrapperAddress: string;
  /** Institutional token address used for balanceOf check, if available. */
  instAddress: string | null;
  /** Chain we verified on (typically the chain with the most wrapper TVL). */
  chain: ChainKey;
  /** On-chain symbol() return. */
  onchainSymbol: string | null;
  /** On-chain name() return. */
  onchainName: string | null;
  /** Substring we required in name() for the mapping to be verified. */
  expectedNameSubstring: string;
  /** True iff onchainName contains expectedNameSubstring (case-insensitive). */
  nameMatches: boolean;
  /** Wrapper's totalSupply (raw 18-dec units). null when the RPC call failed. */
  totalSupplyRaw: string | null;
  /**
   * Institutional token's balanceOf(wrapper) — i.e. does the wrapper
   * physically hold any institutional shares? Centrifuge wrappers have
   * been observed to return 0 here, which is what `custodyModel: 'none'`
   * encodes.
   */
  instBalanceOfWrapperRaw: string | null;
  /** Derived: how the wrapper relates to the institutional token. */
  custodyModel: CustodyModel;
  /** When this snapshot was taken (epoch ms). */
  fetchedAt: number;
}

/**
 * Pick the chain a wrapper is most meaningful on for verification.
 * Prefer chains where BOTH the wrapper and its institutional token are
 * deployed (so balanceOf is comparable), iterating in CHAIN_PREFERENCE
 * order so we hit a known-working RPC (Base / Alchemy) first. Falls
 * back to any chain the wrapper is on.
 */
function pickVerifyChain(
  wrapper: TokenDef,
  inst: TokenDef | undefined,
): ChainKey | null {
  if (inst) {
    for (const chain of CHAIN_PREFERENCE) {
      if (wrapper.deployments[chain] && inst.deployments[chain]) return chain;
    }
  }
  for (const chain of CHAIN_PREFERENCE) {
    if (wrapper.deployments[chain]) return chain;
  }
  return null;
}

/**
 * Run the verification across all configured wrappers. One batched eth_call
 * per chain (so usually 2-3 RPC round-trips total).
 */
export async function verifyWrapperRegistry(): Promise<WrapperVerificationRow[]> {
  const out: WrapperVerificationRow[] = [];
  const fetchedAt = Date.now();

  for (const wrapper of Object.values(DERWA_TOKENS)) {
    const expectedInstSymbol = wrapper.instSymbol ?? '';
    const inst = expectedInstSymbol ? INSTITUTIONAL_TOKENS[expectedInstSymbol] : undefined;
    const chain = pickVerifyChain(wrapper, inst);
    if (!chain) continue;

    const wrapperAddress = wrapper.deployments[chain];
    const instAddress = inst?.deployments[chain] ?? null;
    if (!wrapperAddress) continue;

    const calls: Array<{ to: string; data: string }> = [
      { to: wrapperAddress, data: SEL.symbol },
      { to: wrapperAddress, data: SEL.name },
      { to: wrapperAddress, data: SEL.totalSupply },
    ];
    if (instAddress) {
      // balanceOf(wrapperAddress) on the institutional token contract.
      calls.push({
        to: instAddress,
        data: SEL.balanceOf + encodeAddress(wrapperAddress),
      });
    }

    const [symHex, nameHex, supplyHex, balHex] = await batchEthCall(chain, calls);

    const onchainSymbol = decodeString(symHex);
    const onchainName = decodeString(nameHex);
    // supplyHex==null means the RPC call failed. Distinguish from a real
    // zero return so we don't claim totalSupply=0 when we just couldn't
    // reach the chain.
    const totalSupplyRaw = supplyHex ? decodeUint(supplyHex).toString() : null;
    const instBalanceOfWrapperRaw = balHex ? decodeUint(balHex).toString() : null;

    const expectedNameSubstring = EXPECTED_NAME_SUBSTRING[wrapper.symbol] ?? '';
    const nameMatches =
      !!onchainName &&
      !!expectedNameSubstring &&
      onchainName.toLowerCase().includes(expectedNameSubstring.toLowerCase());

    // Custody classification carefully separates "RPC said 0" from
    // "RPC didn't answer." A null balance must NOT be classified as
    // 'direct' just because the != 0 path falls through.
    let custodyModel: CustodyModel;
    if (instAddress == null) {
      custodyModel = 'cross-chain';
    } else if (instBalanceOfWrapperRaw == null) {
      custodyModel = 'unknown';
    } else if (instBalanceOfWrapperRaw === '0') {
      custodyModel = 'none';
    } else {
      custodyModel = 'direct';
    }

    out.push({
      symbol: wrapper.symbol,
      expectedInstSymbol,
      wrapperAddress,
      instAddress,
      chain,
      onchainSymbol,
      onchainName,
      expectedNameSubstring,
      nameMatches,
      totalSupplyRaw,
      instBalanceOfWrapperRaw,
      custodyModel,
      fetchedAt,
    });
  }

  return out;
}

/** Console-log the verification report on app boot. Throws if a mapping fails. */
export async function assertWrapperRegistryOnBoot(): Promise<void> {
  const rows = await verifyWrapperRegistry();
  const failures = rows.filter((r) => !r.nameMatches);
  if (failures.length > 0) {
    const detail = failures
      .map(
        (f) =>
          `  ${f.symbol}: name()="${f.onchainName ?? '(null)'}" does not contain "${f.expectedNameSubstring}"`,
      )
      .join('\n');
    throw new Error(
      `[wrapper-verification] Registry mapping failed on-chain check:\n${detail}\n` +
        `Either the contract address in lib/data/onchain/registry.ts is wrong, ` +
        `or Centrifuge has redeployed the wrapper. Investigate before continuing.`,
    );
  }
}
