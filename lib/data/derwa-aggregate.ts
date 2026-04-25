/**
 * Aggregator for the deRWA Composability page.
 *
 * Joins data from many sources into one row per wrapper:
 *  - Centrifuge pool data (TVL, supply, chains)
 *  - Wrap ratio computed against the matching institutional pool
 *  - Holder count + top holders (filtered from tokenInstancePositions)
 *  - Historical TVL sparkline (from per-token snapshots)
 *  - DEX stats from GeckoTerminal (when a known pool address exists)
 *  - Premium/discount: (dexPrice - NAV) / NAV
 */

import {
  DEPOSIT_TYPES,
  REDEEM_TYPES,
  type ChainHolderRow,
  type DerwaData,
  type DerwaDetailData,
  type DerwaTxRow,
  type DerwaWrapperRow,
  type InvestorTransaction,
  type Pool,
  type Token,
  type TokenInstancePosition,
} from '@/lib/data/types';
import { getDerwaContext } from '@/lib/data/derwa-context';
import type { TokenSnapshot } from '@/lib/data/centrifuge';
import type { DefiLlamaPool } from '@/lib/data/defillama-yields';
import type { GeckoPoolStats } from '@/lib/data/geckoterminal';
import type { EulerMarketStats } from '@/lib/data/euler';
import type { TokenSupplySnapshot } from '@/lib/data/onchain/supply';
import { preferredSupply } from '@/lib/data/reconcile';

/* ─── BigInt helpers (copied from aggregate.ts so derwa is self-contained) ── */

function bn(value: string | null | undefined, decimals: number): number {
  if (!value) return 0;
  const big = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  return Number(big / divisor) + Number(big % divisor) / Number(divisor);
}

function priceUsd(value: string | null | undefined): number {
  return bn(value, 18);
}

function primaryToken(pool: Pool): Token | undefined {
  return pool.tokens.items.find((t) => t.isActive) ?? pool.tokens.items[0];
}

function tokenTvlUsd(token: Token): number {
  const price = priceUsd(token.tokenPrice);
  return token.tokenInstances.items.reduce((sum, inst) => {
    const supply = bn(inst.totalIssuance, token.decimals);
    return sum + supply * price;
  }, 0);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-wrapper aggregation
 * ────────────────────────────────────────────────────────────────────────── */

export interface AggregateDerwaInput {
  pools: Pool[];
  transactions: InvestorTransaction[];
  positions: TokenInstancePosition[];
  /** Map of `wrapperSymbol → snapshots (newest first)`. */
  snapshotsBySymbol: Map<string, TokenSnapshot[]>;
  /** Map of `defiLlamaPoolId → pool stats`. */
  dexPools: Map<string, DefiLlamaPool | null>;
  /** Map of `poolAddress (lowercase) → GeckoTerminal stats` for live price. */
  geckoStats: Map<string, GeckoPoolStats | null>;
  /** Map of `wrapperSymbol → Euler market stats` (null when no market). */
  eulerStats: Map<string, EulerMarketStats | null>;
  /** Map of `tokenSymbol → onchain supply snapshot` — Tier 1 source of truth.
   *  When a wrapper or institutional token has a snapshot here, the aggregator
   *  prefers it over Centrifuge's indexer values. Falls back to the indexer
   *  when onchain data is unavailable (RPC failure). */
  onchainSupplies?: Record<string, TokenSupplySnapshot>;
  windowDays: number;
}

export function aggregateDerwa(input: AggregateDerwaInput): DerwaData {
  const {
    pools,
    transactions,
    positions,
    snapshotsBySymbol,
    dexPools,
    windowDays,
  } = input;
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // Build symbol → pool index for both wrappers and institutional pools.
  const poolBySymbol = new Map<string, { pool: Pool; token: Token }>();
  for (const p of pools) {
    const t = primaryToken(p);
    if (!t) continue;
    poolBySymbol.set(t.symbol, { pool: p, token: t });
  }

  // Build tokenId → decimals map for transaction USD calc.
  const tokenInfo = new Map<string, { decimals: number; priceUsd: number }>();
  for (const p of pools) {
    for (const t of p.tokens.items) {
      tokenInfo.set(t.id, { decimals: t.decimals, priceUsd: priceUsd(t.tokenPrice) });
    }
  }

  const wrappers: DerwaWrapperRow[] = [];

  // Iterate over the curated context list — that's our authoritative source
  // of which wrappers exist + which institutional pool they wrap.
  const contextSymbols = ['deJTRSY', 'deJAAA', 'deCRDX', 'deSPXA'];
  for (const sym of contextSymbols) {
    const ctx = getDerwaContext(sym);
    if (!ctx) continue;
    const wrapper = poolBySymbol.get(sym);
    if (!wrapper) continue;

    const { pool, token } = wrapper;
    const navUsd = priceUsd(token.tokenPrice);

    // Per-chain breakdown — on-chain first, indexer as fallback.
    const onchain = input.onchainSupplies?.[sym];
    const indexerChains = token.tokenInstances.items.map((inst) => ({
      name: inst.blockchain.name,
      chainId: inst.blockchain.chainId,
      supply: bn(inst.totalIssuance, token.decimals),
      tvlUsd: bn(inst.totalIssuance, token.decimals) * priceUsd(inst.tokenPrice),
      address: inst.address,
    }));

    // Merge: prefer on-chain totalSupply per chain, keeping the indexer's
    // chain name + address for display. If on-chain failed OR returned
    // zero for a chain, fall back to the indexer value for that chain —
    // a zero on-chain read is as likely to mean "RPC dropped the request"
    // as "token has no supply there" and the indexer is the better guess.
    const chains = indexerChains
      .map((idx) => {
        const onchainChain = onchain?.perChain.find(
          (c) =>
            c.chain.toLowerCase() === idx.name.toLowerCase() ||
            (c.chain === 'bsc' && idx.name === 'binance'),
        );
        if (onchainChain && !onchainChain.failed && onchainChain.supply > 0) {
          return {
            ...idx,
            supply: onchainChain.supply,
            tvlUsd: onchainChain.supply * navUsd,
          };
        }
        return idx;
      })
      .filter((c) => c.supply > 0)
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    // Pick the supply via the central preferredSupply rule — defers to the
    // indexer's Token.totalIssuance when sources agree within 10% (matches
    // Centrifuge's "circulating supply" convention) and falls back to
    // authoritative on-chain when the indexer is broken.
    //
    // Per-chain breakdown above stays on-chain because the indexer's
    // per-chain values are unreliable for the same tokens.
    const chainSumTvl = chains.reduce((s, c) => s + c.tvlUsd, 0);
    const chainSumSupply = chains.reduce((s, c) => s + c.supply, 0);
    const indexerTokenIssuance = bn(token.totalIssuance, token.decimals);
    const onchainSupply = onchain?.totalSupply ?? 0;
    const chainsFailed = onchain?.chainsFailed ?? 0;
    const { supply: chosenSupply } = preferredSupply(
      onchainSupply,
      indexerTokenIssuance,
      chainsFailed,
    );
    const totalSupply = chosenSupply > 0 ? chosenSupply : chainSumSupply;
    const tvlUsd = chosenSupply > 0 ? chosenSupply * navUsd : chainSumTvl;

    // Wrap ratio vs the institutional pool. The inst TVL also routes
    // through preferredSupply so the JTRSY/JAAA wrap ratios match the
    // numerator Centrifuge uses on their dashboard. Sanity guard remains:
    // if the resulting instTvl is somehow smaller than the wrapper it
    // backs, that's a data problem and we render no wrap ratio.
    const instOnchain = ctx.instSymbol ? input.onchainSupplies?.[ctx.instSymbol] : undefined;
    const inst = poolBySymbol.get(ctx.instSymbol);
    const instNav = inst ? priceUsd(inst.token.tokenPrice) : 0;
    let instTvlUsd: number | null = null;
    if (inst && instNav > 0) {
      const indexerInstIssuance = bn(inst.token.totalIssuance, inst.token.decimals);
      const { supply: chosenInstSupply } = preferredSupply(
        instOnchain?.totalSupply ?? 0,
        indexerInstIssuance,
        instOnchain?.chainsFailed ?? 0,
      );
      if (chosenInstSupply > 0) {
        const candidate = chosenInstSupply * instNav;
        if (candidate >= tvlUsd * 0.95) instTvlUsd = candidate;
      }
    }
    // Last-resort fallback: per-instance summed indexer TVL. Same
    // structural guard.
    if (instTvlUsd == null && inst) {
      const candidate = tokenTvlUsd(inst.token);
      if (candidate >= tvlUsd * 0.95) instTvlUsd = candidate;
    }
    const wrapRatio =
      instTvlUsd != null && instTvlUsd > 0 ? tvlUsd / instTvlUsd : null;

    // Window flow (deposits - redemptions) for this token only
    let flowUsd = 0;
    for (const tx of transactions) {
      if (tx.tokenId !== token.id) continue;
      const t = Number(tx.createdAt);
      if (!Number.isFinite(t) || t < cutoff) continue;
      const info = tokenInfo.get(tx.tokenId);
      if (!info) continue;
      const tokenAmount = bn(tx.tokenAmount, info.decimals);
      const txPrice = priceUsd(tx.tokenPrice);
      const price = txPrice > 0 ? txPrice : info.priceUsd;
      const valueUsd = tokenAmount * price;
      if (DEPOSIT_TYPES.includes(tx.type)) flowUsd += valueUsd;
      else if (REDEEM_TYPES.includes(tx.type)) flowUsd -= valueUsd;
    }

    // Holder breakdown — filter positions to this token only
    const tokenPositions = positions.filter((p) => p.tokenId === token.id);
    const holderAccounts = new Set(tokenPositions.map((p) => p.accountAddress));
    const topHolders = tokenPositions
      .map((p) => {
        const decimals = p.tokenInstance.token.decimals;
        const shares = bn(p.balance, decimals);
        const valueUsd = shares * priceUsd(p.tokenInstance.token.tokenPrice);
        return {
          account: p.accountAddress,
          chain: p.tokenInstance.blockchain.name,
          shares,
          valueUsd,
        };
      })
      .filter((h) => h.shares > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 5);

    // Sparkline — TokenSnapshot rows multiplied to TVL, filtered to window,
    // sorted ascending by time, deduplicated to one point per day.
    const snapshots = snapshotsBySymbol.get(sym) ?? [];
    const sparkline = buildSparkline(snapshots, token.decimals, cutoff);

    // Euler lending market stats — pulled on-chain by the API route.
    const eulerIntegration = ctx.integrations.find(
      (i) => i.kind === 'lending' && i.protocol === 'Euler' && i.status === 'live',
    );
    const eulerRaw = input.eulerStats.get(sym) ?? null;
    const euler =
      eulerIntegration && eulerRaw
        ? {
            collateralVault: eulerRaw.collateralVault,
            borrowVault: eulerRaw.borrowVault,
            collateralSymbol: eulerRaw.collateralSymbol,
            loanSymbol: eulerRaw.loanSymbol,
            collateralUsd: eulerRaw.collateralUsd,
            supplyUsd: eulerRaw.supplyUsd,
            borrowUsd: eulerRaw.borrowUsd,
            utilization: eulerRaw.utilization,
            supplyApy: eulerRaw.supplyApy,
            borrowApy: eulerRaw.borrowApy,
            oracleAddress: eulerRaw.oracleAddress,
            url: eulerIntegration.url ?? 'https://app.euler.finance',
          }
        : null;

    // DEX stats — merge DefiLlama (TVL, APY) + GeckoTerminal (live price).
    const dexIntegration = ctx.integrations.find(
      (i) => i.kind === 'dex' && i.status === 'live' && i.defiLlamaPoolId,
    );
    const llamaPool = dexIntegration?.defiLlamaPoolId
      ? dexPools.get(dexIntegration.defiLlamaPoolId)
      : undefined;
    const geckoPool = dexIntegration?.address
      ? input.geckoStats.get(dexIntegration.address.toLowerCase())
      : undefined;
    const dexPrice = geckoPool?.priceUsd ?? null;
    const dex =
      dexIntegration && llamaPool
        ? {
            network: dexIntegration.chain?.toLowerCase() ?? 'base',
            address: dexIntegration.address ?? '',
            gaugeAddress: dexIntegration.gaugeAddress ?? '',
            poolId: llamaPool.poolId,
            project: llamaPool.project,
            symbol: llamaPool.symbol,
            tvlUsd: llamaPool.tvlUsd,
            apy: llamaPool.apy,
            apyBase: llamaPool.apyBase,
            apyReward: llamaPool.apyReward,
            volume1dUsd: llamaPool.volumeUsd1d,
            volume7dUsd: llamaPool.volumeUsd7d,
            priceUsd: dexPrice,
            premiumPct:
              dexPrice != null && navUsd > 0
                ? ((dexPrice - navUsd) / navUsd) * 100
                : null,
          }
        : null;

    wrappers.push({
      symbol: sym,
      name: pool.name ?? token.name ?? sym,
      tokenId: token.id,
      manager: ctx.manager,
      description: ctx.description,
      tvlUsd,
      navUsd,
      totalSupply,
      flowUsd,
      wrapRatio,
      instTvlUsd,
      instSymbol: ctx.instSymbol,
      chains,
      holderCount: holderAccounts.size,
      topHolders,
      sparkline,
      euler,
      dex,
    });
  }

  // Page-level rollups
  const totalDerwaTvl = wrappers.reduce((s, w) => s + w.tvlUsd, 0);
  const totalInstTvl = wrappers.reduce((s, w) => s + (w.instTvlUsd ?? 0), 0);
  const totalWrapRatio = totalInstTvl > 0 ? totalDerwaTvl / totalInstTvl : 0;

  // Unique holders across ALL wrapper positions — not just the top 5 per
  // wrapper (that capped this value at 20 regardless of reality). Uses
  // the full positions list the aggregator already has in scope.
  const wrapperTokenIds = new Set(wrappers.map((w) => w.tokenId));
  const totalHolders = new Set(
    positions
      .filter((p) => wrapperTokenIds.has(p.tokenId))
      .map((p) => p.accountAddress.toLowerCase()),
  ).size;

  return {
    wrappers,
    windowDays,
    totalDerwaTvl,
    totalInstTvl,
    totalWrapRatio,
    totalHolders,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Build a sparkline from raw token snapshots:
 *  - Multiply totalIssuance * tokenPrice for TVL per snapshot
 *  - Filter to within the window
 *  - Sort ascending by timestamp
 *  - Reduce to ~60 points max for clean rendering
 */
function buildSparkline(
  snapshots: TokenSnapshot[],
  decimals: number,
  cutoffMs: number,
): Array<{ t: number; tvl: number }> {
  const points = snapshots
    .map((s) => {
      const supply = bn(s.totalIssuance, decimals);
      const price = priceUsd(s.tokenPrice);
      return { t: Number(s.timestamp), tvl: supply * price };
    })
    .filter((p) => Number.isFinite(p.t) && p.t >= cutoffMs)
    .sort((a, b) => a.t - b.t);

  // If we have too many points, downsample by taking every Nth.
  if (points.length <= 80) return points;
  const stride = Math.ceil(points.length / 80);
  const sampled: typeof points = [];
  for (let i = 0; i < points.length; i += stride) sampled.push(points[i]);
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }
  return sampled;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-wrapper detail aggregation — used by /api/derwa/[symbol]
 *
 * Reuses `aggregateDerwa` to build the base wrapper row, then enriches it
 * with top-25 holders, recent transactions, and per-chain holder counts.
 * ────────────────────────────────────────────────────────────────────────── */

export interface AggregateDerwaDetailInput extends AggregateDerwaInput {
  /** Symbol of the wrapper to build the detail view for, e.g. "deSPXA". */
  symbol: string;
}

export function aggregateDerwaDetail(
  input: AggregateDerwaDetailInput,
): DerwaDetailData | null {
  const base = aggregateDerwa(input);
  const wrapper = base.wrappers.find((w) => w.symbol === input.symbol);
  if (!wrapper) return null;

  const ctx = getDerwaContext(input.symbol);
  const cutoff = Date.now() - input.windowDays * 24 * 60 * 60 * 1000;

  // tokenId we care about
  const tokenId = wrapper.tokenId;

  // Build a price+decimals lookup for tx valuation
  const tokenInfo = new Map<string, { decimals: number; priceUsd: number }>();
  for (const p of input.pools) {
    for (const t of p.tokens.items) {
      tokenInfo.set(t.id, { decimals: t.decimals, priceUsd: priceUsd(t.tokenPrice) });
    }
  }

  // Top 25 holders
  const tokenPositions = input.positions.filter((p) => p.tokenId === tokenId);
  const topHolders = tokenPositions
    .map((p) => {
      const decimals = p.tokenInstance.token.decimals;
      const shares = bn(p.balance, decimals);
      const valueUsd = shares * priceUsd(p.tokenInstance.token.tokenPrice);
      return {
        account: p.accountAddress,
        chain: p.tokenInstance.blockchain.name,
        shares,
        valueUsd,
      };
    })
    .filter((h) => h.shares > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 25);

  // Per-chain holder counts
  const chainHoldersMap = new Map<string, ChainHolderRow>();
  for (const c of wrapper.chains) {
    chainHoldersMap.set(c.name, {
      chain: c.name,
      chainId: c.chainId,
      holderCount: 0,
      supply: c.supply,
      tvlUsd: c.tvlUsd,
    });
  }
  for (const p of tokenPositions) {
    if (bn(p.balance, p.tokenInstance.token.decimals) <= 0) continue;
    const row = chainHoldersMap.get(p.tokenInstance.blockchain.name);
    if (row) row.holderCount += 1;
  }
  const chainHolders = Array.from(chainHoldersMap.values()).sort(
    (a, b) => b.tvlUsd - a.tvlUsd,
  );

  // Recent transactions (mints/burns) for this token, within the window
  const recentTransactions: DerwaTxRow[] = [];
  for (const tx of input.transactions) {
    if (tx.tokenId !== tokenId) continue;
    const t = Number(tx.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const info = tokenInfo.get(tx.tokenId);
    if (!info) continue;
    const tokenAmount = bn(tx.tokenAmount, info.decimals);
    const txPrice = priceUsd(tx.tokenPrice);
    const price = txPrice > 0 ? txPrice : info.priceUsd;
    const valueUsd = tokenAmount * price;
    recentTransactions.push({
      txHash: tx.txHash,
      type: tx.type,
      account: tx.account,
      chain: tx.blockchain?.name ?? 'unknown',
      valueUsd,
      tokenAmount,
      createdAt: t,
    });
  }
  recentTransactions.sort((a, b) => b.createdAt - a.createdAt);

  // Full integration list — flatten the static context
  const integrations =
    ctx?.integrations.map((i) => ({
      protocol: i.protocol,
      kind: i.kind,
      chain: i.chain,
      address: i.address,
      url: i.url,
      status: i.status,
    })) ?? [];

  return {
    wrapper,
    topHolders,
    recentTransactions: recentTransactions.slice(0, 50),
    chainHolders,
    integrations,
    morpho: null, // populated by the API route from the Morpho GraphQL API
    windowDays: input.windowDays,
    lastUpdated: new Date().toISOString(),
  };
}
