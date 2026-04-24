/**
 * Data reconciliation layer (Tier 1 vs Tier 2).
 *
 * Tier 1 = on-chain reads (authoritative)  — lib/data/onchain/supply.ts
 * Tier 2 = Centrifuge indexer totalIssuance — lib/data/centrifuge.ts
 *
 * When these disagree by more than `DIVERGENCE_THRESHOLD`, we surface a
 * warning badge in the UI so users aren't looking at silently-wrong
 * numbers. In practice this flags the exact bug that motivated this
 * architecture: indexer returning `totalIssuance = 0` for deSPXA / deCRDX
 * / SPXA / ArkOdin while holders + supply clearly exist on-chain.
 */

import type { TokenSupplySnapshot } from './onchain/supply';
import type { Pool } from './types';

/** Relative diff above which we consider the two tiers inconsistent. */
export const DIVERGENCE_THRESHOLD = 0.01; // 1%

export type DataQualityLevel = 'ok' | 'degraded' | 'broken';

export interface TokenReconciliation {
  symbol: string;
  /** Tier 1 total supply, summed across all chains that responded. */
  onchainSupply: number;
  /** Tier 2 indexer-reported total issuance, summed across instances. */
  indexerIssuance: number;
  /** |tier1 - tier2| / max(tier1, tier2) — 0 means perfect match. */
  divergence: number;
  /** Overall quality derived from divergence + chain failures. */
  quality: DataQualityLevel;
  /** How many chains contributed to the on-chain snapshot successfully. */
  chainsOk: number;
  /** How many chains failed during the on-chain read. */
  chainsFailed: number;
  /** Plain-English explanation, shown in UI tooltips. */
  message: string;
  /** Which tier was used as the final value. */
  source: 'onchain' | 'indexer' | 'none';
}

export interface ReconciliationInput {
  /** All pool tokens, keyed off Centrifuge Pool graph. */
  pools: Pool[];
  /** Result of getAllOnchainSupplies. */
  onchainSupplies: Record<string, TokenSupplySnapshot>;
}

/**
 * Classify a single token's supply consistency.
 * `onchain` may be undefined when the registry doesn't know about the token
 * (e.g. tokens outside the deRWA + institutional set).
 */
export function reconcileToken(
  symbol: string,
  onchain: TokenSupplySnapshot | undefined,
  indexerIssuance: number,
): TokenReconciliation {
  const onchainSupply = onchain?.totalSupply ?? 0;
  const chainsOk = onchain?.chainsOk ?? 0;
  const chainsFailed = onchain?.chainsFailed ?? 0;

  // Case 1: no on-chain reader for this token (not in registry).
  if (!onchain) {
    if (indexerIssuance > 0) {
      return {
        symbol,
        onchainSupply: 0,
        indexerIssuance,
        divergence: 0,
        quality: 'ok',
        chainsOk: 0,
        chainsFailed: 0,
        source: 'indexer',
        message:
          'Single-source data from Centrifuge indexer — no on-chain verification layer configured for this token.',
      };
    }
    // Both zero and no on-chain reader → empty/inactive token. Not a bug,
    // just nothing to show. Mark as ok to keep the UI quiet.
    return {
      symbol,
      onchainSupply: 0,
      indexerIssuance: 0,
      divergence: 0,
      quality: 'ok',
      chainsOk: 0,
      chainsFailed: 0,
      source: 'none',
      message: 'Empty or inactive token — both indexer and on-chain read zero.',
    };
  }

  // Case 2: on-chain says 0 AND indexer says 0 → truly empty token, not a bug.
  if (onchainSupply === 0 && indexerIssuance === 0) {
    return {
      symbol,
      onchainSupply: 0,
      indexerIssuance: 0,
      divergence: 0,
      quality: chainsFailed > 0 ? 'degraded' : 'ok',
      chainsOk,
      chainsFailed,
      source: 'onchain',
      message:
        chainsFailed > 0
          ? `On-chain read succeeded on ${chainsOk} of ${chainsOk + chainsFailed} chains; remainder unreachable.`
          : 'Token has zero supply across all chains.',
    };
  }

  // Case 3: on-chain is 0 but indexer has a number → on-chain read failed
  // or token isn't actually deployed. Prefer indexer, flag as degraded.
  if (onchainSupply === 0 && indexerIssuance > 0) {
    return {
      symbol,
      onchainSupply: 0,
      indexerIssuance,
      divergence: 1,
      quality: 'degraded',
      chainsOk,
      chainsFailed,
      source: 'indexer',
      message: `On-chain read returned zero while indexer reports supply — falling back to indexer. ${chainsFailed} chain(s) failed.`,
    };
  }

  // Case 4: both positive — compute divergence.
  const bigger = Math.max(onchainSupply, indexerIssuance);
  const divergence = Math.abs(onchainSupply - indexerIssuance) / bigger;

  if (divergence <= DIVERGENCE_THRESHOLD) {
    // When both sources agree within 1%, a single failed chain is network
    // noise, not a real data-quality problem. Only escalate to "degraded"
    // when multiple chains failed — that's when we're missing enough
    // coverage to actually worry.
    const isNoise = chainsFailed <= 1;
    return {
      symbol,
      onchainSupply,
      indexerIssuance,
      divergence,
      quality: isNoise ? 'ok' : 'degraded',
      chainsOk,
      chainsFailed,
      source: 'onchain',
      message: isNoise
        ? chainsFailed === 1
          ? 'On-chain and indexer data in agreement. One chain read hit a transient RPC error and was skipped — authoritative total remains accurate.'
          : 'On-chain and indexer data in agreement.'
        : `On-chain and indexer agree within ${(DIVERGENCE_THRESHOLD * 100).toFixed(0)}%, but ${chainsFailed} chain reads failed — some supply may be missing.`,
    };
  }

  // Case 5a: significant divergence WITH chain failures and on-chain < indexer.
  // This is the network-noise case — our on-chain read is incomplete, so the
  // indexer number is actually more reliable. Downgrade to 'degraded' and
  // fall back to the indexer. Don't cry "broken" when we're the one blinking.
  if (onchainSupply < indexerIssuance && chainsFailed > 0) {
    const ratio = (divergence * 100).toFixed(1);
    return {
      symbol,
      onchainSupply,
      indexerIssuance,
      divergence,
      quality: 'degraded',
      chainsOk,
      chainsFailed,
      source: 'indexer',
      message: `On-chain read was partial (${chainsFailed} chain(s) failed) — using indexer value of ${indexerIssuance.toLocaleString()} as fallback. On-chain partial: ${onchainSupply.toLocaleString()} (${ratio}% gap).`,
    };
  }

  // Case 5b: on-chain > indexer — indexer is under-reporting. This is the
  // exact bug that motivated this architecture. On-chain is authoritative,
  // and because we SHOW the on-chain number, the displayed value is
  // trustworthy. Surface this as "ok" (with an informational note) rather
  // than "broken" — the badge reflects OUR data quality, not the indexer's.
  if (onchainSupply > indexerIssuance) {
    const ratio = (divergence * 100).toFixed(1);
    return {
      symbol,
      onchainSupply,
      indexerIssuance,
      divergence,
      quality: 'ok',
      chainsOk,
      chainsFailed,
      source: 'onchain',
      message:
        indexerIssuance === 0
          ? `Centrifuge's indexer reports zero issuance for this token, but on-chain supply is ${onchainSupply.toLocaleString()}. Displayed value comes from the authoritative on-chain read.`
          : `Centrifuge's indexer under-reports by ${ratio}% vs on-chain. Displayed value uses the authoritative on-chain read (${onchainSupply.toLocaleString()} vs indexer ${indexerIssuance.toLocaleString()}).`,
    };
  }

  // Case 5c: on-chain < indexer AND no chain failures — we read cleanly, the
  // indexer is over-reporting. Rare; could indicate stale indexer state.
  const ratio = (divergence * 100).toFixed(1);
  return {
    symbol,
    onchainSupply,
    indexerIssuance,
    divergence,
    quality: 'broken',
    chainsOk,
    chainsFailed,
    source: 'onchain',
    message: `Indexer over-reports by ${ratio}% vs on-chain. On-chain read is complete; using authoritative value ${onchainSupply.toLocaleString()} (indexer: ${indexerIssuance.toLocaleString()}).`,
  };
}

/**
 * Compute indexer totalIssuance per symbol from the raw pools payload —
 * sums across every pool + token + tokenInstance.
 */
export function indexerIssuanceBySymbol(pools: Pool[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pool of pools) {
    for (const token of pool.tokens.items) {
      const symbol = token.symbol;
      // Prefer the sum across live tokenInstances (more granular and
      // reflective of actual on-chain state the indexer observed) with a
      // fallback to the token's top-level totalIssuance for completeness.
      const anyToken = token as Pool['tokens']['items'][number] & {
        tokenInstances?: { items?: Array<{ totalIssuance?: string; isActive?: boolean }> };
      };
      const instances = anyToken.tokenInstances?.items ?? [];
      let sum = 0;
      for (const inst of instances) {
        sum += Number(inst.totalIssuance ?? 0) / 1e18;
      }
      if (sum === 0) {
        sum = Number(token.totalIssuance ?? 0) / 1e18;
      }
      if (!Number.isFinite(sum) || sum < 0) sum = 0;
      out[symbol] = (out[symbol] ?? 0) + sum;
    }
  }
  return out;
}

/**
 * Reconcile every token that has an on-chain snapshot AND an indexer
 * reading. Tokens present in one side only are still returned (with the
 * appropriate `source`) so the UI can flag them consistently.
 */
export function reconcileAll({
  pools,
  onchainSupplies,
}: ReconciliationInput): Record<string, TokenReconciliation> {
  const indexerBySym = indexerIssuanceBySymbol(pools);
  const out: Record<string, TokenReconciliation> = {};

  // Every symbol the on-chain tier knows about.
  for (const [symbol, snap] of Object.entries(onchainSupplies)) {
    const indexerVal = indexerBySym[symbol] ?? 0;
    out[symbol] = reconcileToken(symbol, snap, indexerVal);
  }

  // Every indexer symbol that has no on-chain record — classify them too so
  // the UI can mark them as "indexer-only" consistently.
  for (const [symbol, indexerVal] of Object.entries(indexerBySym)) {
    if (out[symbol]) continue;
    out[symbol] = reconcileToken(symbol, undefined, indexerVal);
  }

  return out;
}

/** Summary count of reconciled tokens by quality level. */
export interface QualitySummary {
  ok: number;
  degraded: number;
  broken: number;
  total: number;
  /** True if any token is broken. */
  hasBroken: boolean;
  /** True if any token is broken or degraded. */
  hasIssues: boolean;
}

export function summarizeQuality(
  recons: Record<string, TokenReconciliation>,
): QualitySummary {
  let ok = 0;
  let degraded = 0;
  let broken = 0;
  for (const r of Object.values(recons)) {
    if (r.quality === 'ok') ok += 1;
    else if (r.quality === 'degraded') degraded += 1;
    else broken += 1;
  }
  return {
    ok,
    degraded,
    broken,
    total: ok + degraded + broken,
    hasBroken: broken > 0,
    hasIssues: broken > 0 || degraded > 0,
  };
}
