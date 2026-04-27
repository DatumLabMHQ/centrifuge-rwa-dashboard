/**
 * Debug-only: introspect the Aerodrome Base Full subgraph and return
 * its top-level query types so we can see what entity names + fields
 * the schema actually uses.
 *
 * Use case: when the live `getAerodromeDailyVolume` returns null
 * because neither V3-style nor Messari-style entity names matched,
 * hit this endpoint to discover the actual schema and patch the
 * reader.
 *
 * Safe to expose temporarily — returns only schema shape, no data
 * and no key. Delete once we've patched the reader.
 */

import { NextResponse } from 'next/server';

export const maxDuration = 30;

const SUBGRAPH_ID = 'GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM';

const INTROSPECTION_QUERY = `
  query Introspect {
    __schema {
      queryType {
        fields {
          name
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
    }
  }
`;

const POOL_FIELDS_QUERY = `
  query PoolFields {
    __type(name: "Pool") { name fields { name type { name kind ofType { name } } } }
    LiquidityPool: __type(name: "LiquidityPool") { name fields { name type { name kind ofType { name } } } }
    CLPool: __type(name: "CLPool") { name fields { name type { name kind ofType { name } } } }
  }
`;

export async function GET() {
  const key = process.env.THEGRAPH_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'THEGRAPH_API_KEY not set' },
      { status: 500 },
    );
  }

  const url = `https://gateway.thegraph.com/api/${key}/subgraphs/id/${SUBGRAPH_ID}`;

  try {
    const [introspection, poolFields] = await Promise.all([
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      }).then((r) => r.json()),
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: POOL_FIELDS_QUERY }),
      }).then((r) => r.json()),
    ]);

    interface FieldSummary {
      name: string;
      type: string;
    }
    interface RawType {
      name?: string;
      kind?: string;
      ofType?: { name?: string };
    }
    interface RawField {
      name: string;
      type: RawType;
    }

    // Slim down the introspection to just the field names so the
    // response is human-readable.
    const fields = (introspection?.data?.__schema?.queryType?.fields ?? [])
      .map((f: RawField) => ({
        name: f.name,
        type: f.type?.name ?? f.type?.ofType?.name ?? f.type?.kind,
      }))
      .filter((f: FieldSummary) =>
        // Only show entity-related root fields, drop the meta/_admin entries.
        !f.name.startsWith('_') && f.name !== 'meta',
      );

    return NextResponse.json({
      ok: true,
      rootQueries: fields,
      // Show fields of plausible Pool entities (whichever ones exist).
      poolEntities: poolFields?.data ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Probe failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
