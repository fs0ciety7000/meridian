import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/index';

describe('BALANCE', () => {
  it('has strictly increasing rarity cutoffs inside (0, 1)', () => {
    const [a, b, c] = BALANCE.tierCutoffs;
    expect(0 < a && a < b && b < c && c < 1).toBe(true);
  });

  it('rewards rarer tiers with larger multipliers', () => {
    const m = BALANCE.tierMultipliers;
    expect(m.known < m.trail && m.trail < m.frontier && m.frontier < m.incognita).toBe(true);
  });
});
