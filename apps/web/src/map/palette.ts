import { themeColors, tokens, type ThemeName } from '@meridian/design-tokens';

/** Canvas has no CSS variables: map colours come from the same tokens (design-system §5). */
export function mapPalette(theme: ThemeName) {
  const c = themeColors(theme);
  return {
    ...c,
    hatch: c['vermilion-700'],
    font: { map: tokens.font.map, mono: tokens.font.mono },
    style: tokens.map,
  };
}

export type MapPalette = ReturnType<typeof mapPalette>;

export function currentTheme(): ThemeName {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'atlas' || explicit === 'nocturne') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'nocturne' : 'atlas';
}
