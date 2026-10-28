import tokens from '../tokens.json' with { type: 'json' };

export type ThemeName = keyof typeof tokens.themes;
export type ColorToken = keyof typeof tokens.themes.atlas;

export { tokens };

/** Colors for Canvas rendering, where CSS variables are not available. */
export function themeColors(theme: ThemeName): Record<ColorToken, string> {
  return tokens.themes[theme];
}
