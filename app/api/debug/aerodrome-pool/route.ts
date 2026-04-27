/**
 * Debug-only: probe the Aerodrome Base Full subgraph for the deSPXA
 * pool specifically. Returns:
 *   - whether the pool exists in the subgraph
 *   - sample poolDayDatas (any pool, latest)
 *   - PoolDayData entity field shape
 *
 * Used to diagnose why getAerodromeDailyVolume() returns null even
 * though the schema is standard Uniswap V3. Delete once we've fixed.
 */

import { NextResponse } from 'next/server';

export const maxDuration = 30;

const SUBGRAPH_ID = 'GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM';
const DESPXA_POOL = '0xf840346fafedc1c0466216f3a899a599e6d03e75';

const QUERY = `
  query Probe($poolId: String!, $poolIdChecksum: String!) {
    # Does the subgraph know about this exact pool?
    poolLowercase: pool(id: $poolId) {
      id
      token0 { symbol }
      token1 { symbol }
      txCount
      volumeUSD
      totalValueLockedUSD
    }
    # Maybe the ID is stored checksum-cased?
    poolChecksum: pool(id: $poolIdChecksum) {
      id
      token0 { symbol }
      token1 { symbol }
    }
    # First 5 pools the subgraph knows by volume — sanity check the index is alive
    pools(first: 5, orderBy: volumeUSD, orderDirection: desc) {
      id
      token0 { symbol }
      token1 { symbol }
      volumeUSD
    }
    # Latest poolDayData entries — see what real records look like and what
    # the `pool` field on them actually contains
    poolDayDatas(first: 5, orderBy: date, orderDirection: desc) {
      id
      date
      volumeUSD
      txCount
      pool { id }
    }
    # PoolDayData entity field shape
    PoolDayData: __type(name: "PoolDayData") {
      fields { name type { name kind ofType { name } } }
    }
  }
`;

export async function GET() {
  const key = process.env.THEGRAPH_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'THEGRAPH_API_KEY not set' }, { status: 500 });
  }

  const url = `https://gateway.thegraph.com/api/${key}/subgraphs/id/${SUBGRAPH_ID}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          poolId: DESPXA_POOL.toLowerCase(),
          poolIdChecksum: DESPXA_POOL,
        },
      }),
    });
    const json = await res.json();
    return NextResponse.json({
      ok: true,
      lookedFor: {
        lowercase: DESPXA_POOL.toLowerCase(),
        original: DESPXA_POOL,
      },
      data: json.data,
      errors: json.errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Probe failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
