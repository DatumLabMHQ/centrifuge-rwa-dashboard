/**
 * Inlined from @datumlabs/data-connectors/helpers
 *
 * Subset of formatting helpers we actually use. The local `lib/format.ts`
 * wraps `formatCurrency` to handle negatives correctly.
 */

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '$0.00';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
