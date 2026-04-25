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
 * Storage backend:
 *   - Upstash Redis via `@upstash/redis` when env vars are present.
 *     Real Redis over REST — vendor-portable (works on Vercel, Cloudflare,
 *     anywhere with the credentials).
 *   - In-memory `globalCache` fallback when not configured. Means
 *     `npm run dev` and unconfigured deployments still work, just lose
 *     the cross-instance cache benefit.
 *
 * Recognised env var conventions, in priority order:
 *   1. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (current Vercel
 *      Marketplace integration; recommended)
 *   2. KV_REST_API_URL + KV_REST_API_TOKEN  (legacy "Vercel KV" naming;
 *      kept for back-compat with older project configurations)
 */

import { after } from 'next/server';
import { Redis } from '@upstash/redis';
import { globalCache } from './cache';

interface RedisCreds {
  url: string;
  token: string;
}

/** Resolve credentials from any of the env var conventions we accept. */
function resolveCreds(): RedisCreds | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken };
  }
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken };
  }
  return null;
}

const CREDS = resolveCreds();
const REDIS_ENABLED = CREDS !== null;

/**
 * Lazy-init the Redis client. We construct it once on first use and
 * memoize, so repeated calls don't keep allocating clients.
 */
let _client: Redis | null = null;
function client(): Redis | null {
  if (!REDIS_ENABLED || !CREDS) return null;
  if (!_client) {
    _client = new Redis({ url: CREDS.url, token: CREDS.token });
  }
  return _client;
}

interface CachedEntry<T> {
  data: T;
  ts: number;
}

async function read<T>(key: string): Promise<CachedEntry<T> | null> {
  const r = client();
  if (!r) {
    const entry = globalCache.get<CachedEntry<T>>(key, Number.MAX_SAFE_INTEGER);
    return entry ?? null;
  }
  try {
    // @upstash/redis auto-deserializes JSON on the way out, so this is
    // already typed CachedEntry<T> after the cast.
    const v = (await r.get(key)) as CachedEntry<T> | null;
    return v ?? null;
  } catch (err) {
    console.warn(`[kv-cache] read failed for ${key}:`, err);
    // On Redis hiccup, fall through to whatever the in-memory cache has.
    const entry = globalCache.get<CachedEntry<T>>(key, Number.MAX_SAFE_INTEGER);
    return entry ?? null;
  }
}

async function write<T>(key: string, data: T): Promise<void> {
  const entry: CachedEntry<T> = { data, ts: Date.now() };
  // Always populate in-memory too — gives this same warm instance
  // subsequent fast hits even if Redis is misbehaving.
  globalCache.set(key, entry);
  const r = client();
  if (!r) return;
  try {
    // No EX option here — we control TTLs ourselves via the ts field, so
    // entries naturally age out via the swr() comparison instead of being
    // hard-evicted by Redis. Cheaper for our access pattern (read-mostly
    // with rare writes).
    await r.set(key, entry);
  } catch (err) {
    console.warn(`[kv-cache] write failed for ${key}:`, err);
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

  const entry = await read<T>(key);
  const now = Date.now();

  if (entry) {
    const ageMs = now - entry.ts;
    const ageSeconds = Math.floor(ageMs / 1000);

    // Fully expired — refuse the cached value and fetch inline.
    if (ageSeconds > staleTtlS) {
      const data = await fetcher();
      await write(key, data);
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
        await write(key, fresh);
      } catch (err) {
        console.warn(`[kv-cache] background refresh failed for ${key}:`, err);
      }
    });
    return { data: entry.data, cached: true, stale: true, ageSeconds };
  }

  // Cold cache — fetch inline.
  const data = await fetcher();
  await write(key, data);
  return { data, cached: false, stale: false, ageSeconds: 0 };
}

/**
 * Read-only check: is Redis reachable? Useful for the methodology page
 * or a debug endpoint to confirm production has the right env vars.
 */
export function isRedisConfigured(): boolean {
  return REDIS_ENABLED;
}

/** Direct invalidation — used by manual refresh endpoints if we add one. */
export async function invalidate(key: string): Promise<void> {
  globalCache.invalidate(key);
  const r = client();
  if (!r) return;
  try {
    await r.del(key);
  } catch (err) {
    console.warn(`[kv-cache] invalidate failed for ${key}:`, err);
  }
}
