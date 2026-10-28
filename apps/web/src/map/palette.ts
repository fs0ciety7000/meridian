import { themeColors, tokens, type ThemeName } from '@meridian/design-tokens';

type ColorName = keyof ReturnType<typeof themeColors>;

const withAlpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** Canvas has no CSS variables: map colours come from the same tokens (design-system §5). */
export function mapPalette(theme: ThemeName) {
  const c = themeColors(theme);
  const m = tokens.map;
  const sea = m.label.sea[theme];
  return {
    ...c,
    /** Unplantable land: sepia hatching, never the vermilion of a false trail (review phase 1). */
    unplantableHatch: withAlpha(
      c[m.unplantableHatch.color as ColorName],
      m.unplantableHatch.opacity,
    ),
    seaLabel: withAlpha(c[sea.color as ColorName], sea.opacity),
    hover: c[m.hover.fill as ColorName],
    waterLineOpacity: theme === 'nocturne' ? m.waterLines.opacityNocturne : m.waterLines.opacity,
    font: { map: tokens.font.map, mono: tokens.font.mono },
    style: m,
  };
}

export type MapPalette = ReturnType<typeof mapPalette>;

export function currentTheme(): ThemeName {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'atlas' || explicit === 'nocturne') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'nocturne' : 'atlas';
}
