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

/** Relative diff above which we flag the two tiers as actually disagreeing
 *  in the UI — anything within this band is "agreement," even if values
 *  aren't byte-identical. */
export const DIVERGENCE_THRESHOLD = 0.01; // 1%

/**
 * When on-chain is HIGHER than indexer by less than this threshold, we
 * defer to the indexer because the gap is almost certainly issuer-held
 * supply / pre-mint that hasn't been allocated to investors yet — the
 * meaningful "circulating" number is what Centrifuge's official dashboard
 * shows. Above this threshold we treat the indexer as broken and prefer
 * the on-chain authoritative value (the deSPXA / deCRDX-style cases where
 * the indexer reports 0 or near-0).
 *
 * Calibrated against the JTRSY case: ~6% gap = issuer treasury exclusion.
 * Set to 10% for headroom.
 */
export const INDEXER_PREFERENCE_THRESHOLD = 0.10; // 10%

/**
 * Decide which value to use for TVL: on-chain `totalSupply()` or the
 * indexer's `Token.totalIssuance`. Single source of truth — both the
 * reconciliation classifier (this file) AND the page-level aggregators
 * route through this function so the displayed number matches the
 * data-quality badge.
 *
 * Returns the chosen supply and which source it came from.
 */
export function preferredSupply(
  onchainSupply: number,
  indexerIssuance: number,
  chainsFailed: number,
): { supply: number; source: 'onchain' | 'indexer' | 'none' } {
  const bothZero = onchainSupply === 0 && indexerIssuance === 0;
  if (bothZero) return { supply: 0, source: 'none' };

  // Indexer reports 0 but on-chain has supply → indexer is broken (the
  // deSPXA / deCRDX bug). Use authoritative on-chain.
  if (indexerIssuance === 0 && onchainSupply > 0) {
    return { supply: onchainSupply, source: 'onchain' };
  }

  // On-chain returned 0 (e.g. all chain RPCs failed or token isn't
  // actually deployed) but indexer has data → use indexer fallback.
  if (onchainSupply === 0 && indexerIssuance > 0) {
    return { supply: indexerIssuance, source: 'indexer' };
  }

  // Both positive. Use the indexer value when the two sources are within
  // the preference threshold — Centrifuge's indexer counts "supply
  // allocated to investors," excluding issuer-held / pre-mint balances.
  // That's the meaningful "circulating TVL" number their official
  // dashboard publishes; we want to match it where possible.
  const bigger = Math.max(onchainSupply, indexerIssuance);
  const divergence = Math.abs(onchainSupply - indexerIssuance) / bigger;
  if (divergence <= INDEXER_PREFERENCE_THRESHOLD) {
    return { supply: indexerIssuance, source: 'indexer' };
  }

  // Significant divergence. If on-chain > indexer the indexer is broken
  // (full deSPXA-style 0 case, or under-counts catastrophically). Use
  // authoritative on-chain.
  if (onchainSupply > indexerIssuance) {
    // Note: `chainsFailed` could mean our on-chain read is incomplete,
    // but if we're already higher than the indexer the read clearly
    // captured most of supply — failures here would only widen the gap.
    void chainsFailed;
    return { supply: onchainSupply, source: 'onchain' };
  }

  // On-chain < indexer with significant gap — rare. Likely an incomplete
  // on-chain read (chain failures pushed our number lower than reality).
  // Fall back to indexer.
  return { supply: indexerIssuance, source: 'indexer' };
}

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

  // Case 4+: both positive. Route through the central preferredSupply()
  // function and synthesise a quality + message based on which source
  // it picked and how the two values compare.
  const bigger = Math.max(onchainSupply, indexerIssuance);
  const divergence = Math.abs(onchainSupply - indexerIssuance) / bigger;
  const { source } = preferredSupply(onchainSupply, indexerIssuance, chainsFailed);

  // Match Centrifuge's circulating-supply convention: when on-chain is
  // higher than indexer by less than INDEXER_PREFERENCE_THRESHOLD, the
  // gap is treasury / pre-mint. The data is fine; we just deferred to
  // the indexer because that's what their dashboard shows.
  if (
    source === 'indexer' &&
    onchainSupply > indexerIssuance &&
    divergence <= INDEXER_PREFERENCE_THRESHOLD
  ) {
    const ratio = (divergence * 100).toFixed(2);
    return {
      symbol,
      onchainSupply,
      indexerIssuance,
      divergence,
      quality: 'ok',
      chainsOk,
      chainsFailed,
      source: 'indexer',
      message:
        divergence < 0.001
          ? 'On-chain and indexer match exactly.'
          : `On-chain has ${ratio}% more supply than indexer (${(onchainSupply - indexerIssuance).toLocaleString()} shares of treasury / pre-mint). Displayed value uses the indexer's "circulating supply" — matching Centrifuge's official dashboard.`,
    };
  }

  // Same as above but on-chain < indexer (rare edge — usually means a
  // partial on-chain read). Within threshold, agreement, use indexer.
  if (source === 'indexer' && divergence <= INDEXER_PREFERENCE_THRESHOLD) {
    const ratio = (divergence * 100).toFixed(2);
    const isNoise = chainsFailed <= 1;
    return {
      symbol,
      onchainSupply,
      indexerIssuance,
      divergence,
      quality: isNoise ? 'ok' : 'degraded',
      chainsOk,
      chainsFailed,
      source: 'indexer',
      message: isNoise
        ? `On-chain and indexer data in agreement (${ratio}% gap${chainsFailed === 1 ? ', one chain read skipped' : ''}). Using indexer.`
        : `On-chain and indexer agree within threshold but ${chainsFailed} chain reads failed — some supply may be missing.`,
    };
  }

  // Significant gap with on-chain partial — fall back to indexer.
  if (source === 'indexer' && onchainSupply < indexerIssuance) {
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

  // On-chain >> indexer beyond threshold → indexer is broken (the
  // deSPXA / deCRDX scenario). Use authoritative on-chain.
  if (source === 'onchain' && onchainSupply > indexerIssuance) {
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
          ? `Centrifuge's indexer reports zero issuance for this token, but on-chain supply is ${onchainSupply.toLocaleString()}. Displayed value uses the authoritative on-chain read.`
          : `Centrifuge's indexer under-reports by ${ratio}% vs on-chain (beyond the ${(INDEXER_PREFERENCE_THRESHOLD * 100).toFixed(0)}% treasury-tolerance band — likely an indexer gap). Displayed value uses the authoritative on-chain read.`,
    };
  }

  // Catch-all: we got here with `source === 'onchain'` but on-chain isn't
  // higher than indexer. Means clean on-chain read, indexer over-reports.
  // Surface as broken — uncommon and worth a closer look.
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
 *
 * IMPORTANT: BigInt issuance values use the token's own decimals
 * (`token.decimals`), NOT a fixed 1e18. JTRSY and JAAA are 6-decimal
 * tokens; everything else is 18. A previous version of this function
 * hardcoded 1e18, which silently divided JTRSY/JAAA values by 10^12
 * too much and made the data-quality tooltip falsely report Centrifuge's
 * indexer as "100% under-reporting."
 */
export function indexerIssuanceBySymbol(pools: Pool[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pool of pools) {
    for (const token of pool.tokens.items) {
      const symbol = token.symbol;
      const decimals = token.decimals ?? 18;
      const divisor = 10 ** decimals;
      // Prefer the sum across live tokenInstances (more granular and
      // reflective of actual on-chain state the indexer observed) with a
      // fallback to the token's top-level totalIssuance for completeness.
      const anyToken = token as Pool['tokens']['items'][number] & {
        tokenInstances?: { items?: Array<{ totalIssuance?: string; isActive?: boolean }> };
      };
      const instances = anyToken.tokenInstances?.items ?? [];
      let sum = 0;
      for (const inst of instances) {
        sum += Number(inst.totalIssuance ?? 0) / divisor;
      }
      if (sum === 0) {
        sum = Number(token.totalIssuance ?? 0) / divisor;
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
