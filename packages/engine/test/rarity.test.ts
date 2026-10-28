import { describe, expect, it } from 'vitest';
import { BALANCE, computeRarity, tierOfShare, TIERS } from '../src/index';

describe('rarity', () => {
  it('maps the midpoint cumulative share to tiers', () => {
    expect(tierOfShare(0.1, BALANCE)).toBe('known');
    expect(tierOfShare(0.5, BALANCE)).toBe('trail');
    expect(tierOfShare(0.8, BALANCE)).toBe('frontier');
    expect(tierOfShare(0.97, BALANCE)).toBe('incognita');
  });

  it('gives a stable tier distribution whatever the number of answers', () => {
    for (const size of [8, 20, 60]) {
      const valid = Array.from({ length: size }, (_, i) => `C${String(i).padStart(2, '0')}`);
      const counts = Object.fromEntries(
        valid.map((c, i) => [c, Math.round(1000 / (i + 1) ** 1.2)]),
      );
      const s = computeRarity('q', valid, () => 0.5, counts, BALANCE, 'now');
      const shareOf = (t: string) =>
        Object.values(s.entries)
          .filter((e) => e.tier === t)
          .reduce((a, e) => a + e.share, 0);
      expect(Object.values(s.entries).reduce((a, e) => a + e.share, 0)).toBeCloseTo(1, 9);
      expect(shareOf('known')).toBeGreaterThan(0.3);
      expect(
        TIERS.every((t) => Object.values(s.entries).some((e) => e.tier === t) || size < 10),
      ).toBe(true);
    }
  });

  it('the prior favours salient countries; observations override it', () => {
    const sal: Record<string, number> = { FRA: 1, BEL: 0.6, LUX: 0.2 };
    const prior = computeRarity('q', ['BEL', 'FRA', 'LUX'], (c) => sal[c]!, {}, BALANCE, 'now');
    expect(prior.entries.FRA!.tier).toBe('known');
    expect(prior.entries.LUX!.tier).toBe('incognita');
    const observed = computeRarity(
      'q',
      ['BEL', 'FRA', 'LUX'],
      (c) => sal[c]!,
      { LUX: 5000, FRA: 10 },
      BALANCE,
      'now',
    );
    expect(observed.entries.LUX!.tier).toBe('known');
    expect(observed.total).toBe(5010);
  });

  it('breaks ties by ISO3 for determinism', () => {
    const s = computeRarity('q', ['BBB', 'AAA'], () => 0.5, {}, BALANCE, 'now');
    expect(s.entries.AAA!.tier).toBe('known');
    expect(s.entries.BBB!.tier).toBe('trail');
  });
});
