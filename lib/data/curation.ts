/**
 * Curation layer — which pools are surfaced by default in the dashboard.
 *
 * Centrifuge's official dashboard publishes a hand-picked set of
 * "production" pools (the institutional funds you can actually invest in
 * through their official channels) and hides the long tail of test pools
 * and experimental products. We mirror that view by default so headline
 * counts and totals match Centrifuge's published numbers.
 *
 * The full set is still queryable — pages can opt into the long tail
 * with a "Show all pools" toggle, which surfaces every active pool the
 * indexer reports including ArkOdin, ArkTEST, peqTEST, etc.
 *
 * To add a new production pool: append its ticker symbol below. The
 * dashboard picks it up automatically — no other code changes required.
 */

/**
 * Symbols that match Centrifuge's published RWA + deRWA pool grid (as
 * shown on app.centrifuge.io/pools and centrifugescan.io). Any pool whose
 * primary token symbol is in this set is considered "production".
 */
export const PRODUCTION_POOL_SYMBOLS = new Set([
  // Institutional RWA
  'JTRSY',  // Janus Henderson Anemoy Treasury Fund
  'JAAA',   // Janus Henderson Anemoy AAA CLO Fund
  'ACRDX',  // Anemoy Tokenized Apollo Diversified Credit Fund
  'SPXA',   // Janus Henderson Anemoy S&P 500® Fund
  // Freely-transferable wrappers
  'deJTRSY',
  'deJAAA',
  'deCRDX',
  'deSPXA',
]);

/** Convenience predicate. */
export function isProductionPool(symbol: string | null | undefined): boolean {
  return symbol != null && PRODUCTION_POOL_SYMBOLS.has(symbol);
}
