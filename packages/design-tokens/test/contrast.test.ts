import { describe, expect, it } from 'vitest';
import { tokens, type ThemeName } from '../src/index';

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.keys(tokens.themes) as ThemeName[])('theme %s', (theme) => {
  const colors: Record<string, string> = tokens.themes[theme];
  const bg = colors['paper-100']!;

  it('defines the same color tokens as the atlas theme', () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(tokens.themes.atlas).sort());
  });

  it.each(tokens.contrast.text)('%s reaches 4.5:1 on paper-100 (text)', (name) => {
    expect(contrast(colors[name]!, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(tokens.contrast.graphic)('%s reaches 3:1 on paper-100 (graphics)', (name) => {
    expect(contrast(colors[name]!, bg)).toBeGreaterThanOrEqual(3);
  });

  it('never uses pure black or pure white', () => {
    for (const hex of Object.values(colors)) {
      expect(['#000000', '#FFFFFF']).not.toContain(hex.toUpperCase());
    }
  });
});
