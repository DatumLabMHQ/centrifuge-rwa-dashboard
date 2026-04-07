/**
 * Local formatter that wraps the SDK's formatCurrency with proper handling
 * for negative numbers. The SDK helper falls through to `$${value.toFixed(2)}`
 * for any negative value because its bucket comparisons (`value >= 1e9`) are
 * false for negatives — producing junk like `$-349159686.77` for $-349M.
 */

import { formatCurrency as sdkFormatCurrency } from '@datumlabs/data-connectors';

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '$0.00';
  if (value < 0) return `-${sdkFormatCurrency(Math.abs(value))}`;
  return sdkFormatCurrency(value);
}

/** Signed version: prepends + for positive values, - for negative. */
export function formatCurrencySigned(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value === 0) return formatCurrency(value);
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}
