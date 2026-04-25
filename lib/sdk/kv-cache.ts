/**
 * Stale-while-revalidate cache wrapper.
 *
 * Goal: users never wait for cold-start fetches. Some of our routes do
 * heavy work on a cache miss (the on-chain Swap event scanner makes
 * ~130 RPC calls; the protocol-yield aggregator does ~10 GraphQL calls).
 * In-memory caching alone doesn't help on Vercel because every cold
 * serverless instance starts with an empty Map.
 *
 * Pattern:
 *   1. Read from cache. If fresh (age ≤ freshTtl) → return immediately.
 *   2. If stale (freshTtl < age ≤ staleTtl) → return immediately AND
 *      kick off a background refresh via Next.js `after()`.
 *   3. If missing or fully expired → fetch inline, write, return.
 *
 * Storage:
 *   - Vercel KV (Redis-compatible) when KV_REST_API_URL is set —
 *     persistent across serverless invocations.
 *   - In-memory `globalCache` fallback when KV isn't configured. Means
 *     `npm run dev` and unconfigured deployments still work, just less
 *     efficiently.
 */

import { after } from 'next/server';
import { globalCache } from './cache';

/**
 * Wrap actual KV import in a lazy import so the package isn't required
 * to be installed for builds where KV isn't used. Falls through to the
 * in-memory cache if the import fails or env vars are missing.
 */
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

interface CachedEntry<T> {
  data: T;
  ts: number;
}

async function kvRead<T>(key: string): Promise<CachedEntry<T> | null> {
  if (!KV_ENABLED) {
    const entry = globalCache.get<CachedEntry<T>>(key, Number.MAX_SAFE_INTEGER);
    return entry ?? null;
  }
  try {
    const { kv } = await import('@vercel/kv');
    const v = (await kv.get(key)) as CachedEntry<T> | null;
    return v ?? null;
  } catch (err) {
    console.warn(`[kv-cache] read failed for ${key}:`, err);
    return null;
  }
}

async function kvWrite<T>(key: string, data: T): Promise<void> {
  const entry: CachedEntry<T> = { data, ts: Date.now() };
  if (!KV_ENABLED) {
    globalCache.set(key, entry);
    return;
  }
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, entry);
  } catch (err) {
    console.warn(`[kv-cache] write failed for ${key}:`, err);
    // Always populate the in-memory cache too — gives this same warm
    // instance subsequent fast hits even if KV is misbehaving.
    globalCache.set(key, entry);
  }
}

/** Output shape — useful for routes that want to surface cache status. */
export interface SwrResult<T> {
  data: T;
  /** True when served from cache (vs. computed fresh inline). */
  cached: boolean;
  /** True when served from cache but is past the fresh window. */
  stale: boolean;
  /** Age of the cached entry in seconds, or 0 if just computed. */
  ageSeconds: number;
}

export interface SwrOptions {
  /** Below this age (seconds) the cache is fresh — return immediately. */
  freshTtlS: number;
  /**
   * Between freshTtlS and staleTtlS the cache is stale-but-usable —
   * return immediately AND kick off a background refresh. Defaults to
   * 4× freshTtlS, capped at 1 hour. Setting this lower means more
   * frequent inline fetches; higher means longer-lived stale serves.
   */
  staleTtlS?: number;
}

/**
 * Stale-while-revalidate fetch wrapper. Wraps any expensive computation:
 *
 *   const result = await swr('overview', { freshTtlS: 300 }, async () => {
 *     return await actuallyComputeOverview();
 *   });
 *
 * Returns the cached value plus metadata so route handlers can include
 * `cached`/`stale` flags in the response if they want.
 */
export async function swr<T>(
  key: string,
  options: SwrOptions,
  fetcher: () => Promise<T>,
): Promise<SwrResult<T>> {
  const { freshTtlS } = options;
  const staleTtlS = options.staleTtlS ?? Math.min(3600, freshTtlS * 4);

  const entry = await kvRead<T>(key);
  const now = Date.now();

  if (entry) {
    const ageMs = now - entry.ts;
    const ageSeconds = Math.floor(ageMs / 1000);

    // Fully expired — refuse the cached value and fetch inline.
    if (ageSeconds > staleTtlS) {
      const data = await fetcher();
      await kvWrite(key, data);
      return { data, cached: false, stale: false, ageSeconds: 0 };
    }

    // Fresh — return immediately, no background work.
    if (ageSeconds <= freshTtlS) {
      return { data: entry.data, cached: true, stale: false, ageSeconds };
    }

    // Stale — return immediately, refresh in background.
    after(async () => {
      try {
        const fresh = await fetcher();
        await kvWrite(key, fresh);
      } catch (err) {
        console.warn(`[kv-cache] background refresh failed for ${key}:`, err);
      }
    });
    return { data: entry.data, cached: true, stale: true, ageSeconds };
  }

  // Cold cache — fetch inline.
  const data = await fetcher();
  await kvWrite(key, data);
  return { data, cached: false, stale: false, ageSeconds: 0 };
}

/**
 * Read-only check: is KV configured? Useful for the methodology page or
 * a debug endpoint to confirm production has the right env vars.
 */
export function isKvConfigured(): boolean {
  return KV_ENABLED;
}

/** Direct invalidation — used by manual refresh endpoints if we add one. */
export async function invalidate(key: string): Promise<void> {
  if (!KV_ENABLED) {
    globalCache.invalidate(key);
    return;
  }
  try {
    const { kv } = await import('@vercel/kv');
    await kv.del(key);
  } catch (err) {
    console.warn(`[kv-cache] invalidate failed for ${key}:`, err);
  }
}
