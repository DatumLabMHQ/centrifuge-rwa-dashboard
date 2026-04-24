/**
 * Pure aggregation helpers — fold the raw GraphQL pool/transaction data into
 * the shape the Overview page renders. Kept separate so route handlers stay
 * thin and the math is unit-testable.
 */

import {
  DEPOSIT_TYPES,
  REDEEM_TYPES,
  type CrossChainFlowData,
  type CrossChainTransaction,
  type FlowData,
  type FlowLink,
  type FlowNode,
  type HolderRow,
  type InvestorsData,
  type InvestorTransaction,
  type OverviewData,
  type Pool,
  type PoolRow,
  type PoolsData,
  type Token,
  type TokenInstance,
  type TokenInstancePosition,
} from '@/lib/data/types';

/** Convert a BigInt-as-string to Number safely (loses precision over ~9e15). */
function bn(value: string | null | undefined, decimals: number): number {
  if (!value) return 0;
  // Use BigInt for the integer part, divide by 10**decimals as Number.
  // Two-step to avoid Number overflow on very large supplies.
  const big = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = Number(big / divisor);
  const frac = Number(big % divisor) / Number(divisor);
  return whole + frac;
}

/**
 * Token price is stored as BigInt with 18 decimals regardless of the token's
 * own decimals.
 */
function priceUsd(tokenPrice: string | null | undefined): number {
  return bn(tokenPrice, 18);
}

/** USD value held by a single TokenInstance on one chain. */
function instanceTvlUsd(instance: TokenInstance, tokenDecimals: number): number {
  const supply = bn(instance.totalIssuance, tokenDecimals);
  const price = priceUsd(instance.tokenPrice);
  return supply * price;
}

function tokenTvlUsd(token: Token): number {
  return token.tokenInstances.items.reduce(
    (sum, inst) => sum + instanceTvlUsd(inst, token.decimals),
    0,
  );
}

/**
 * Bucket pools into broad asset classes. Prefers the canonical class from
 * the off-chain IPFS metadata when available, falls back to a name-based
 * heuristic so the dashboard never breaks if IPFS is down.
 */
export type ClassifierMap = Map<string, { class?: string; subClass?: string } | undefined>;

function classifyPool(pool: Pool, metadataMap?: ClassifierMap): string {
  // 1. Authoritative: pool.asset.subClass from IPFS metadata.
  const meta = metadataMap?.get(pool.id);
  if (meta?.subClass) return meta.subClass;
  if (meta?.class) return meta.class;

  // 2. Heuristic fallback on the pool name.
  const name = (pool.name ?? '').toLowerCase();
  if (name.includes('treasury') || name.includes('jtrsy') || name.includes('t-bill')) {
    return 'US Treasuries';
  }
  if (name.includes('s&p') || name.includes('spx') || name.includes('equity') || name.includes('index')) {
    return 'Equity Index';
  }
  if (name.includes('clo') || name.includes('jaaa') || name.includes('aaa')) {
    return 'AAA CLO';
  }
  if (name.includes('credit') || name.includes('crdx') || name.includes('loan')) {
    return 'Private Credit';
  }
  return 'Other';
}

/** First non-empty token in a pool — used for symbol/name display. */
function primaryToken(pool: Pool): Token | undefined {
  return pool.tokens.items.find((t) => t.isActive) ?? pool.tokens.items[0];
}

/** A pool counts as "deRWA" if its primary token symbol starts with "de". */
function isDeRwaPool(token: Token | undefined): boolean {
  const symbol = token?.symbol ?? '';
  return /^de[A-Z]/.test(symbol);
}

/**
 * Compute per-tokenId 30d flow totals so the Pools page can show how much each
 * pool is moving (the Overview only has the global net number).
 */
function flowsByTokenId(
  transactions: InvestorTransaction[],
  tokenInfo: Map<string, { decimals: number; priceUsd: number }>,
): Map<string, { netUsd: number; count: number }> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byToken = new Map<string, { netUsd: number; count: number }>();
  for (const tx of transactions) {
    const t = Number(tx.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const info = tokenInfo.get(tx.tokenId);
    if (!info) continue;
    const tokenAmount = bn(tx.tokenAmount, info.decimals);
    const txPrice = priceUsd(tx.tokenPrice);
    const price = txPrice > 0 ? txPrice : info.priceUsd;
    const valueUsd = tokenAmount * price;
    const cur = byToken.get(tx.tokenId) ?? { netUsd: 0, count: 0 };
    if (DEPOSIT_TYPES.includes(tx.type)) cur.netUsd += valueUsd;
    else if (REDEEM_TYPES.includes(tx.type)) cur.netUsd -= valueUsd;
    cur.count += 1;
    byToken.set(tx.tokenId, cur);
  }
  return byToken;
}

/** Build the tokenId → {decimals, latestPrice} map used by the flow code. */
function buildTokenInfoMap(
  pools: Pool[],
): Map<string, { decimals: number; priceUsd: number }> {
  const m = new Map<string, { decimals: number; priceUsd: number }>();
  for (const p of pools) {
    for (const t of p.tokens.items) {
      m.set(t.id, { decimals: t.decimals, priceUsd: priceUsd(t.tokenPrice) });
    }
  }
  return m;
}

/** Compute the full Overview payload from raw API data. */
export function aggregateOverview(
  pools: Pool[],
  transactions: InvestorTransaction[],
  metadataMap?: ClassifierMap,
  onchainSupplies?: Record<string, { totalSupply: number; totalTvlUsd: number; perChain: Array<{ chain: string; chainId: number; supply: number }> }>,
): OverviewData {
  // Helper: resolve tvl for a token, preferring on-chain over indexer.
  const tokenTvl = (t: Token): number => {
    const onchain = onchainSupplies?.[t.symbol];
    if (onchain && onchain.totalTvlUsd > 0) return onchain.totalTvlUsd;
    return tokenTvlUsd(t);
  };
  const instanceTvl = (inst: TokenInstance, t: Token): number => {
    const onchain = onchainSupplies?.[t.symbol];
    const match = onchain?.perChain.find(
      (c) =>
        c.chain.toLowerCase() === inst.blockchain.name.toLowerCase() ||
        (c.chain === 'bsc' && inst.blockchain.name === 'binance'),
    );
    const nav = priceUsd(t.tokenPrice);
    // Only trust the on-chain value when it's actually positive. A zero
    // could mean "chain RPC failed" just as easily as "token really has
    // zero supply on this chain" — fall back to the indexer to be safe.
    if (match && nav > 0 && match.supply > 0) return match.supply * nav;
    return instanceTvlUsd(inst, t.decimals);
  };

  // ─── per-pool aggregation ───
  type Acc = {
    pool: Pool;
    token: Token | undefined;
    tvlUsd: number;
    chains: Set<string>;
  };
  const accs: Acc[] = pools.map((p) => {
    const token = primaryToken(p);
    const chains = new Set<string>();
    let tvlUsd = 0;
    for (const t of p.tokens.items) {
      tvlUsd += tokenTvl(t);
      const onchain = onchainSupplies?.[t.symbol];
      if (onchain) {
        // Trust on-chain: every chain with supply > 0 is active.
        for (const c of onchain.perChain) if (c.supply > 0) chains.add(c.chain);
      } else {
        for (const inst of t.tokenInstances.items) {
          if (Number(inst.totalIssuance) > 0) chains.add(inst.blockchain.name);
        }
      }
    }
    return { pool: p, token, tvlUsd, chains };
  });

  const activePools = accs.filter((a) => a.tvlUsd > 0).length;

  // ─── per-chain TVL ───
  const chainMap = new Map<string, { name: string; chainId: number; tvlUsd: number }>();
  for (const p of pools) {
    for (const t of p.tokens.items) {
      for (const inst of t.tokenInstances.items) {
        const tvl = instanceTvl(inst, t);
        if (tvl <= 0) continue;
        const key = inst.blockchain.name;
        const cur = chainMap.get(key);
        if (cur) {
          cur.tvlUsd += tvl;
        } else {
          chainMap.set(key, {
            name: inst.blockchain.name,
            chainId: inst.blockchain.chainId,
            tvlUsd: tvl,
          });
        }
      }
    }
  }
  const byChain = Array.from(chainMap.values()).sort((a, b) => b.tvlUsd - a.tvlUsd);
  const tvlUsd = byChain.reduce((s, c) => s + c.tvlUsd, 0);

  // ─── per-asset-class TVL ───
  const classMap = new Map<string, { class: string; tvlUsd: number; pools: number }>();
  for (const a of accs) {
    if (a.tvlUsd <= 0) continue;
    const cls = classifyPool(a.pool, metadataMap);
    const cur = classMap.get(cls);
    if (cur) {
      cur.tvlUsd += a.tvlUsd;
      cur.pools += 1;
    } else {
      classMap.set(cls, { class: cls, tvlUsd: a.tvlUsd, pools: 1 });
    }
  }
  const byAssetClass = Array.from(classMap.values()).sort((a, b) => b.tvlUsd - a.tvlUsd);

  // ─── 30-day net flows ───
  // createdAt comes back as ms-since-epoch encoded as a STRING — parse with
  // Number(), not Date.parse().
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Build a tokenId → { decimals, latestPriceUsd } map from the pools we've
  // already fetched, so we can compute USD value for each tx with the correct
  // per-token decimals (the tx response doesn't include token.decimals).
  const tokenInfo = new Map<string, { decimals: number; priceUsd: number }>();
  for (const p of pools) {
    for (const t of p.tokens.items) {
      tokenInfo.set(t.id, {
        decimals: t.decimals,
        priceUsd: priceUsd(t.tokenPrice),
      });
    }
  }

  let netFlows30dUsd = 0;
  for (const tx of transactions) {
    const t = Number(tx.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const info = tokenInfo.get(tx.tokenId);
    if (!info) continue; // unknown token (e.g. inactive pool not in our snapshot)
    const tokenAmount = bn(tx.tokenAmount, info.decimals);
    // Prefer the historical tx price if it's non-zero, fall back to current.
    const txPrice = priceUsd(tx.tokenPrice);
    const price = txPrice > 0 ? txPrice : info.priceUsd;
    const valueUsd = tokenAmount * price;
    if (DEPOSIT_TYPES.includes(tx.type)) netFlows30dUsd += valueUsd;
    else if (REDEEM_TYPES.includes(tx.type)) netFlows30dUsd -= valueUsd;
  }

  // ─── top pools by TVL ───
  const topPools = accs
    .filter((a) => a.tvlUsd > 0)
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, 5)
    .map((a) => ({
      id: a.pool.id,
      name: a.pool.name ?? a.token?.name ?? a.pool.id,
      symbol: a.token?.symbol ?? '—',
      tvlUsd: a.tvlUsd,
      chains: Array.from(a.chains).sort(),
    }));

  // "Active" = chain has meaningful TVL ($100+). Dust chains — where the
  // indexer records a $1 test transfer or a leftover dev deployment — don't
  // count as active, otherwise we'd report 9 when users only see 6 in the
  // visible breakdown. $100 is high enough to exclude dev noise, low enough
  // that a legit small spoke deployment still shows up.
  const MEANINGFUL_CHAIN_TVL = 100;
  const activeChains = byChain.filter((c) => c.tvlUsd >= MEANINGFUL_CHAIN_TVL).length;

  return {
    totals: {
      tvlUsd,
      activePools,
      activeChains,
      netFlows30dUsd,
    },
    byChain,
    byAssetClass,
    topPools,
    lastUpdated: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Pools page aggregator
 * ────────────────────────────────────────────────────────────────────────── */

export function aggregatePools(
  pools: Pool[],
  transactions: InvestorTransaction[],
  metadataMap?: ClassifierMap,
  onchainSupplies?: Record<string, { totalSupply: number; totalTvlUsd: number; perChain: Array<{ chain: string; supply: number }> }>,
): PoolsData {
  const tokenInfo = buildTokenInfoMap(pools);
  const flows = flowsByTokenId(transactions, tokenInfo);

  const rows: PoolRow[] = pools.flatMap((pool) => {
    const token = primaryToken(pool);
    if (!token) return [];

    const nav = priceUsd(token.tokenPrice);
    const onchain = onchainSupplies?.[token.symbol];

    // Per-chain breakdown: on-chain supply per chain when available,
    // indexer fallback otherwise.
    const chainBreakdown = token.tokenInstances.items
      .map((inst) => {
        const idxSupply = bn(inst.totalIssuance, token.decimals);
        const onchainChain = onchain?.perChain.find(
          (c) =>
            c.chain.toLowerCase() === inst.blockchain.name.toLowerCase() ||
            (c.chain === 'bsc' && inst.blockchain.name === 'binance'),
        );
        // Prefer on-chain only when it's positive — zero usually means the
        // RPC failed rather than "no supply here," so fall back to indexer.
        const supply =
          onchainChain && onchainChain.supply > 0 ? onchainChain.supply : idxSupply;
        return {
          name: inst.blockchain.name,
          chainId: inst.blockchain.chainId,
          supply,
          tvlUsd: supply * nav,
          address: inst.address,
        };
      })
      .filter((c) => c.supply > 0)
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    // Use on-chain totals when available — this covers tokens whose
    // tokenInstances array is empty or stale in the indexer.
    // If the on-chain rollup is zero (e.g. all chains timed out) and the
    // chain breakdown has data (indexer fallback per chain), use the chain
    // sum instead. `??` only catches null, not zero.
    const chainSumTvl = chainBreakdown.reduce((s, c) => s + c.tvlUsd, 0);
    const chainSumSupply = chainBreakdown.reduce((s, c) => s + c.supply, 0);
    const tvlUsd =
      onchain && onchain.totalTvlUsd > 0 ? onchain.totalTvlUsd : chainSumTvl;
    const totalSupply =
      onchain && onchain.totalSupply > 0 ? onchain.totalSupply : chainSumSupply;
    const flowAcc = flows.get(token.id) ?? { netUsd: 0, count: 0 };

    return [
      {
        id: pool.id,
        name: pool.name ?? token.name ?? `Pool ${pool.id}`,
        symbol: token.symbol,
        isActive: pool.isActive,
        assetClass: classifyPool(pool, metadataMap),
        isDeRwa: isDeRwaPool(token),
        decimals: token.decimals,
        tokenPriceUsd: priceUsd(token.tokenPrice),
        totalSupply,
        tvlUsd,
        chains: chainBreakdown,
        flows30dUsd: flowAcc.netUsd,
        txCount30d: flowAcc.count,
      },
    ];
  });

  rows.sort((a, b) => b.tvlUsd - a.tvlUsd);

  return {
    pools: rows,
    lastUpdated: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Flow of Funds aggregator
 *
 * Builds Sankey nodes/links from the same transactions feed: USDC → vault →
 * pool → wrapper. We use the deRWA flag to fork the wrapper layer and only
 * count it for pools whose primary token starts with "de".
 * ────────────────────────────────────────────────────────────────────────── */

export function aggregateFlow(
  pools: Pool[],
  transactions: InvestorTransaction[],
  windowDays = 30,
): FlowData {
  const tokenInfo = buildTokenInfoMap(pools);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // Per-pool deposit/redemption USD totals over the window.
  type Acc = { deposits: number; redemptions: number; pool: Pool; token: Token };
  const byPool = new Map<string, Acc>();
  for (const p of pools) {
    const token = primaryToken(p);
    if (!token) continue;
    byPool.set(p.id, { deposits: 0, redemptions: 0, pool: p, token });
  }

  let txCount = 0;
  for (const tx of transactions) {
    const t = Number(tx.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const info = tokenInfo.get(tx.tokenId);
    if (!info) continue;
    const acc = byPool.get(tx.poolId);
    if (!acc) continue;
    const tokenAmount = bn(tx.tokenAmount, info.decimals);
    const txPrice = priceUsd(tx.tokenPrice);
    const price = txPrice > 0 ? txPrice : info.priceUsd;
    const valueUsd = tokenAmount * price;
    if (DEPOSIT_TYPES.includes(tx.type)) acc.deposits += valueUsd;
    else if (REDEEM_TYPES.includes(tx.type)) acc.redemptions += valueUsd;
    txCount += 1;
  }

  // Build the Sankey: 1 source (USDC), 1 vault layer, 1 node per active pool,
  // 1 wrapper layer for deRWA-flagged pools, 1 sink (Investor Wallet).
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const idx = (n: FlowNode) => {
    nodes.push(n);
    return nodes.length - 1;
  };

  let totalDeposits = 0;
  let totalRedemptions = 0;
  for (const acc of byPool.values()) {
    totalDeposits += acc.deposits;
    totalRedemptions += acc.redemptions;
  }

  if (totalDeposits === 0 && totalRedemptions === 0) {
    return {
      nodes: [],
      links: [],
      totalDepositsUsd: 0,
      totalRedemptionsUsd: 0,
      txCount,
      windowDays,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Layer 0 — USDC deposits (source)
  const usdcNode = idx({ name: 'USDC Deposits', category: 'currency', valueUsd: totalDeposits });
  // Layer 0b — investor exits (source/sink — we render redemptions as wrapper → wallet)
  const walletNode = idx({
    name: 'Investor Wallet',
    category: 'currency',
    valueUsd: totalRedemptions,
  });

  // Layer 1 — vault layer (single node, sum of deposits)
  const vaultNode = idx({
    name: 'Centrifuge Vaults',
    category: 'vault',
    valueUsd: totalDeposits,
  });
  links.push({ source: usdcNode, target: vaultNode, value: totalDeposits });

  // Layer 2 — one node per pool with non-zero deposits, with optional wrapper
  // node for deRWA pools.
  const sortedPools = Array.from(byPool.values())
    .filter((a) => a.deposits + a.redemptions > 0)
    .sort((a, b) => b.deposits + b.redemptions - (a.deposits + a.redemptions));

  for (const acc of sortedPools) {
    const symbol = acc.token.symbol;
    const poolNode = idx({
      name: symbol,
      category: 'pool',
      valueUsd: acc.deposits,
    });
    if (acc.deposits > 0) {
      links.push({ source: vaultNode, target: poolNode, value: acc.deposits });
    }

    if (isDeRwaPool(acc.token) && acc.deposits > 0) {
      // Pool → deRWA wrapper layer
      const wrapNode = idx({
        name: `${symbol} (DeFi)`,
        category: 'wrapper',
        valueUsd: acc.deposits,
      });
      links.push({ source: poolNode, target: wrapNode, value: acc.deposits });
    }

    // Redemptions: pool → wallet
    if (acc.redemptions > 0) {
      links.push({ source: poolNode, target: walletNode, value: acc.redemptions });
    }
  }

  return {
    nodes,
    links,
    totalDepositsUsd: totalDeposits,
    totalRedemptionsUsd: totalRedemptions,
    txCount,
    windowDays,
    lastUpdated: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Investors page aggregator
 *
 * Each TokenInstancePosition is one (account, chain, token) row. We sort by
 * USD value descending to get the top holders globally.
 * ────────────────────────────────────────────────────────────────────────── */

export function aggregateInvestors(positions: TokenInstancePosition[]): InvestorsData {
  const rows: HolderRow[] = positions
    .map((p) => {
      const token = p.tokenInstance.token;
      const shares = bn(p.balance, token.decimals);
      const tokenPriceUsd = priceUsd(token.tokenPrice);
      return {
        account: p.accountAddress,
        poolId: token.pool.id,
        poolName: token.pool.name ?? token.symbol,
        symbol: token.symbol,
        chain: p.tokenInstance.blockchain.name,
        shares,
        tokenPriceUsd,
        valueUsd: shares * tokenPriceUsd,
      };
    })
    .filter((r) => r.shares > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const accounts = new Set(rows.map((r) => r.account));

  return {
    topHolders: rows.slice(0, 100),
    totalUniqueAccounts: accounts.size,
    totalPositions: rows.length,
    lastUpdated: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Cross-chain flow aggregator
 *
 * Builds Sankey nodes/links from TRANSFER_IN / TRANSFER_OUT events. Each
 * transfer has fromCentrifugeId and toCentrifugeId — we group by (from, to)
 * to get net wrapper movement between chains over the window.
 *
 * Pairs each transfer with the matching opposite-direction event when
 * possible to deduplicate (every transfer logs both an OUT on the source
 * chain and an IN on the destination). Falls back to TRANSFER_IN events
 * alone if pairing fails so we don't double-count.
 * ────────────────────────────────────────────────────────────────────────── */

export function aggregateCrossChainFlow(
  pools: Pool[],
  payloads: CrossChainTransaction[],
  windowDays = 30,
): CrossChainFlowData {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // Build centrifugeId → chain name from pools and payloads. Only accept
  // chains where we have a real, non-empty name — ignore the unknown ones
  // (e.g. internal hub IDs that show up in payloads but have no Blockchain
  // entity registered).
  const idToName = new Map<string, string>();
  const addChain = (id: string | undefined | null, name: string | undefined | null) => {
    if (!id || !name) return;
    if (name.startsWith('chain-')) return;
    idToName.set(id, name);
  };
  for (const p of pools) {
    for (const t of p.tokens.items) {
      for (const inst of t.tokenInstances.items) {
        addChain(inst.centrifugeId, inst.blockchain.name);
      }
    }
  }
  for (const p of payloads) {
    addChain(p.fromBlockchain?.centrifugeId, p.fromBlockchain?.name);
    addChain(p.toBlockchain?.centrifugeId, p.toBlockchain?.name);
  }

  // Aggregate (fromId, toId) → payload count. We can't get USD value from a
  // payload alone (it carries opcode + tokenId, no amount), so we use the
  // number of bridge messages as the link "value" for the Sankey.
  // We also skip any payload involving an unknown chain (centrifugeId not in
  // the registered blockchain set) so the Sankey doesn't render "chain-12"
  // garbage labels.
  const pairCounts = new Map<string, number>();
  let txCount = 0;

  for (const p of payloads) {
    const t = Number(p.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    if (!p.fromCentrifugeId || !p.toCentrifugeId) continue;
    if (p.fromCentrifugeId === p.toCentrifugeId) continue;
    if (!idToName.has(p.fromCentrifugeId) || !idToName.has(p.toCentrifugeId)) continue;

    const key = `${p.fromCentrifugeId}>${p.toCentrifugeId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    txCount += 1;
  }
  const pairTotals = pairCounts;
  const totalVolume = txCount;

  // Build node list with the "duplicated columns" trick: each chain becomes
  // a left-side "from" node and/or a right-side "to" node ONLY if it actually
  // participates as that role. Avoids empty stub nodes which Sankey lays out
  // as zero-height bars with floating labels at the top.
  const sourceIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const key of pairTotals.keys()) {
    const [from, to] = key.split('>');
    sourceIds.add(from);
    targetIds.add(to);
  }
  // Sort numerically by centrifugeId so the visual order is stable.
  const sortedSources = Array.from(sourceIds).sort((a, b) => Number(a) - Number(b));
  const sortedTargets = Array.from(targetIds).sort((a, b) => Number(a) - Number(b));

  const nodes: CrossChainFlowData['nodes'] = [];
  const fromIndex = new Map<string, number>();
  const toIndex = new Map<string, number>();
  for (const id of sortedSources) {
    const name = idToName.get(id) ?? `chain-${id}`;
    fromIndex.set(id, nodes.length);
    nodes.push({ name, centrifugeId: id });
  }
  for (const id of sortedTargets) {
    const name = idToName.get(id) ?? `chain-${id}`;
    toIndex.set(id, nodes.length);
    nodes.push({ name, centrifugeId: id });
  }

  const links = Array.from(pairTotals.entries())
    .map(([key, value]) => {
      const [from, to] = key.split('>');
      return {
        source: fromIndex.get(from)!,
        target: toIndex.get(to)!,
        value,
      };
    })
    .filter((l) => l.source !== undefined && l.target !== undefined)
    .sort((a, b) => b.value - a.value);

  return {
    nodes,
    links,
    totalVolumeUsd: totalVolume,
    txCount,
    windowDays,
  };
}
