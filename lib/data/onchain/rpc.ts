/**
 * Multi-chain batched JSON-RPC helper.
 *
 * Used by the on-chain data tier (Tier 1) to read ERC-20 state directly
 * from the source of truth. Batches requests per chain so we pay one HTTP
 * round-trip per chain regardless of how many reads we need.
 *
 * Respects `{CHAIN}_RPC_URL` env vars so deployments can swap in paid
 * providers (Alchemy, Infura) for reliability.
 */

import { CHAINS, type ChainKey } from './registry';

/** Resolve the RPC URL for a chain, allowing per-chain env overrides. */
export function rpcUrl(chain: ChainKey): string {
  const envVar = `${chain.toUpperCase()}_RPC_URL`;
  const fromEnv = process.env[envVar];
  return fromEnv || CHAINS[chain].rpc;
}

export interface EthCall {
  to: string;
  data: string;
}

interface JsonRpcResult {
  id: number;
  result?: string;
  error?: { code: number; message: string };
}

/**
 * Execute a batch of `eth_call` requests on a single chain in ONE HTTP
 * request. Returns results in the same order as inputs. Individual call
 * failures are returned as `null` so one bad call doesn't poison the batch.
 */
export async function batchEthCall(
  chain: ChainKey,
  calls: EthCall[],
  opts: { timeoutMs?: number } = {},
): Promise<Array<string | null>> {
  if (calls.length === 0) return [];

  const url = rpcUrl(chain);
  const body = calls.map((c, i) => ({
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{ to: c.to, data: c.data }, 'latest'],
    id: i,
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return calls.map(() => null);
    const json = await res.json();
    if (!Array.isArray(json)) return calls.map(() => null);

    const results: Array<string | null> = new Array(calls.length).fill(null);
    for (const row of json as JsonRpcResult[]) {
      if (row.error || !row.result) continue;
      if (row.id >= 0 && row.id < calls.length) {
        results[row.id] = row.result;
      }
    }
    return results;
  } catch {
    return calls.map(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

/** Run a single eth_call via the batch helper. */
export async function ethCall(
  chain: ChainKey,
  call: EthCall,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const [result] = await batchEthCall(chain, [call], opts);
  return result;
}

/**
 * Fetch logs on a single chain. Used for Transfer event scanning.
 * Accepts blockNumber hex strings or decimal numbers.
 */
export interface GetLogsParams {
  address: string | string[];
  topics?: Array<string | string[] | null>;
  fromBlock?: string | number;
  toBlock?: string | number;
}

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export async function getLogs(
  chain: ChainKey,
  params: GetLogsParams,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<LogEntry[] | null> {
  const url = rpcUrl(chain);
  const toHex = (v: string | number | undefined): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string' && v.startsWith('0x')) return v;
    return '0x' + Number(v).toString(16);
  };

  const rpcParams: Record<string, unknown> = { address: params.address };
  if (params.topics) rpcParams.topics = params.topics;
  if (params.fromBlock != null) rpcParams.fromBlock = toHex(params.fromBlock);
  if (params.toBlock != null) rpcParams.toBlock = toHex(params.toBlock);

  const maxRetries = opts.retries ?? 2;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getLogs',
          params: [rpcParams],
          id: 1,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 429 / 502 / 503 → back off and retry.
        if (res.status === 429 || res.status >= 500) {
          await sleep(200 * (attempt + 1));
          continue;
        }
        return null;
      }
      const json = await res.json();
      if (json.error) {
        // Many RPCs return rate-limit errors inside a 200 body.
        const msg = String(json.error.message ?? '').toLowerCase();
        if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
          await sleep(200 * (attempt + 1));
          continue;
        }
        return null;
      }
      return (json.result as LogEntry[]) ?? null;
    } catch {
      await sleep(200 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Get the latest block number on a chain. */
export async function getLatestBlock(chain: ChainKey): Promise<number | null> {
  const url = rpcUrl(chain);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ? parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}

/* ─── ABI selectors we use ─── */
export const SEL = {
  /** totalSupply() → uint256 */
  totalSupply: '0x18160ddd',
  /** balanceOf(address) → uint256 — pad address to 32 bytes */
  balanceOf: '0x70a08231',
  /** symbol() → string */
  symbol: '0x95d89b41',
  /** decimals() → uint8 */
  decimals: '0x313ce567',
} as const;

/** ABI-encode a single `address` argument for eth_call data. */
export function encodeAddress(addr: string): string {
  const clean = addr.toLowerCase().replace(/^0x/, '');
  return clean.padStart(64, '0');
}

/** Decode a uint256 return value to a BigInt. Returns 0n for null/invalid. */
export function decodeUint(hex: string | null | undefined): bigint {
  if (!hex || hex === '0x') return BigInt(0);
  try {
    return BigInt(hex);
  } catch {
    return BigInt(0);
  }
}

/** Convert BigInt token amount (raw units) to a JS number. */
export function formatTokenAmount(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

/** keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer event signature. */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
