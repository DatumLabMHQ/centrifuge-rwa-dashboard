/**
 * IPFS metadata fetcher for Centrifuge pool descriptions.
 *
 * Each pool's `metadata` field is an `ipfs://` URI pointing at a JSON
 * document with the canonical asset class, issuer, and links. We resolve
 * these via the Centrifuge gateway and cache the result so we don't pay the
 * fetch cost on every API request.
 *
 * Returns `null` for any pool that doesn't have a resolvable metadata URI
 * — callers fall back to the heuristic classifier in aggregate.ts.
 */

const GATEWAY = process.env.IPFS_GATEWAY ?? 'https://ipfs.centrifuge.io/ipfs';

export interface PoolMetadata {
  pool?: {
    name?: string;
    asset?: {
      class?: string;
      subClass?: string;
    };
    issuer?: { name?: string };
    status?: string;
  };
}

const cache = new Map<string, PoolMetadata | null>();

/**
 * Resolve an `ipfs://CID` URI to a JSON document. Returns null on any
 * failure (empty URI, network error, malformed JSON, etc.) — never throws.
 */
export async function fetchPoolMetadata(uri: string | null | undefined): Promise<PoolMetadata | null> {
  if (!uri || typeof uri !== 'string') return null;
  const cleaned = uri.trim();
  if (!cleaned.startsWith('ipfs://')) return null;
  if (cache.has(cleaned)) return cache.get(cleaned) ?? null;

  const cid = cleaned.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '');
  const url = `${GATEWAY}/${cid}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      cache.set(cleaned, null);
      return null;
    }
    const json = (await res.json()) as PoolMetadata;
    cache.set(cleaned, json);
    return json;
  } catch {
    cache.set(cleaned, null);
    return null;
  }
}

/** Resolve metadata for many pools in parallel, returning a tokenURI → metadata map. */
export async function fetchManyPoolMetadata(
  uris: Array<string | null | undefined>,
): Promise<Map<string, PoolMetadata | null>> {
  const unique = Array.from(
    new Set(uris.filter((u): u is string => !!u && u.startsWith('ipfs://'))),
  );
  const results = await Promise.all(unique.map((u) => fetchPoolMetadata(u)));
  const map = new Map<string, PoolMetadata | null>();
  unique.forEach((u, i) => map.set(u, results[i]));
  return map;
}

/**
 * Build a poolId → {class, subClass} map from an array of Pool entities by
 * resolving each pool's IPFS metadata. Used by aggregateOverview /
 * aggregatePools to classify by canonical asset class instead of name regex.
 */
export async function buildClassifierMap(
  pools: Array<{ id: string; metadata?: string }>,
): Promise<Map<string, { class?: string; subClass?: string } | undefined>> {
  const uris = pools.map((p) => p.metadata).filter(Boolean) as string[];
  const metaMap = await fetchManyPoolMetadata(uris);
  const out = new Map<string, { class?: string; subClass?: string } | undefined>();
  for (const p of pools) {
    if (!p.metadata) {
      out.set(p.id, undefined);
      continue;
    }
    const meta = metaMap.get(p.metadata);
    out.set(p.id, meta?.pool?.asset);
  }
  return out;
}
