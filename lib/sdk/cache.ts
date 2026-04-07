/**
 * Inlined from @datumlabs/data-connectors/cache
 *
 * Simple in-memory TTL cache. Used by API routes to memoize external
 * API responses across requests.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface CacheConfig {
  defaultTtlMs?: number;
}

export class DataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;

  constructor(config: CacheConfig = {}) {
    this.defaultTtlMs = config.defaultTtlMs ?? 6 * 60 * 60 * 1000;
  }

  get<T>(key: string, ttlMs?: number): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const ttl = ttlMs ?? this.defaultTtlMs;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  lastUpdated(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return new Date(entry.timestamp).toISOString();
  }
}

export const globalCache = new DataCache();
