export type Theme = 'light' | 'dark';
export type Aesthetic = 'refined' | 'evolved' | 'modern';
export type Density = 'cozy' | 'compact';

export const TWEAK_KEYS = {
  theme: 'datumlabs.theme',
  aesthetic: 'datumlabs.aesthetic',
  density: 'datumlabs.density',
} as const;

export const DEFAULTS = {
  theme: 'light' as Theme,
  aesthetic: 'evolved' as Aesthetic,
  density: 'cozy' as Density,
};
