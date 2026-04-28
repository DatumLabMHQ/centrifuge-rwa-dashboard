/**
 * Theme-aware Recharts styling constants.
 *
 * Every chart on the dashboard previously had hardcoded hex colors
 * (#64748B for axis ticks, #CBD5E1 for axis lines, #FFFFFF for tooltip
 * backgrounds, etc.). Those values are fine on the light theme and
 * unreadable on the dark theme: tooltips become white-on-dark, axis
 * labels disappear into the background.
 *
 * This module centralises the theme-aware values. Each constant
 * references a CSS variable defined in `app/globals.css`, so the
 * `body[data-theme="dark"]` override flips them automatically.
 *
 * SVG attributes accept `var(--name)` in modern browsers (Chrome 84+,
 * Firefox 86+, Safari 15+), which covers >97% of users. For legacy
 * browsers the variables fall through to their light-theme defaults,
 * which is graceful degradation.
 *
 * Usage:
 *   import { AXIS_TICK, AXIS_STROKE, GRID_STROKE, TOOLTIP_STYLE } from '@/lib/chart-theme';
 *
 *   <XAxis tick={AXIS_TICK} stroke={AXIS_STROKE} ... />
 *   <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
 *   <Tooltip contentStyle={TOOLTIP_STYLE} />
 */

import type { CSSProperties } from 'react';

/* ─── SVG attribute values (Recharts axis / line / area props) ─── */

/** Axis line stroke colour — adapts to light / dark surface. */
export const AXIS_STROKE = 'var(--border-strong)';

/** Grid line stroke colour. */
export const GRID_STROKE = 'var(--border)';

/** Default font fill for tick labels and chart text. */
export const CHART_TEXT_FILL = 'var(--text-muted)';

/** Strong text fill for inline labels (data labels, ReferenceLine labels). */
export const CHART_TEXT_STRONG = 'var(--foreground)';

/* ─── Tick objects (passed to Recharts XAxis/YAxis `tick` prop) ─── */

/** Standard axis-tick style — small muted text. */
export const AXIS_TICK = { fontSize: 10, fill: CHART_TEXT_FILL } as const;

/** Compact axis-tick (charts with limited vertical room). */
export const AXIS_TICK_COMPACT = { fontSize: 9, fill: CHART_TEXT_FILL } as const;

/* ─── Tooltip styling (passed to Recharts Tooltip `contentStyle` prop) ─── */

export const TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 11,
  color: 'var(--foreground)',
  boxShadow: 'var(--shadow-md)',
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: 'var(--foreground)',
  fontWeight: 700,
};

/* ─── Theme-aware brand accents ─── */

/**
 * Brand palette. The hex values here are the LIGHT-theme defaults.
 * Most usages should reference the CSS variable equivalents (e.g.
 * `var(--accent-green)`) so the dark-theme overrides take effect.
 *
 * Recharts' `stroke` and `fill` props accept `var(--name)` directly.
 */
export const ACCENT_GREEN = 'var(--accent-green)';
export const ACCENT_RED = 'var(--accent-red)';
export const ACCENT_ORANGE = 'var(--accent-orange)';
export const ACCENT_BLUE = 'var(--accent-blue)';
export const ACCENT_YELLOW = 'var(--accent-yellow)';
export const ACCENT_PURPLE = 'var(--accent-purple)';
