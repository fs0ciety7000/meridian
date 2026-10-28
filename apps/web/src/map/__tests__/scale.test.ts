import { describe, expect, it } from 'vitest';
import { formatKm, niceScale } from '../scale';

describe('niceScale', () => {
  it.each([
    [40, 2000],
    [33, 2000],
    [4.2, 500],
    [0.3, 20],
    [0.009, 1],
  ])('at %f km/px picks %d km', (kmPerPx, km) => {
    const s = niceScale(kmPerPx);
    expect(s.km).toBe(km);
    expect(s.px).toBeLessThanOrEqual(120);
    expect(s.px).toBeGreaterThan(40);
  });

  it('formats with French grouping', () => {
    expect(formatKm(2000)).toMatch(/^2\s000 km$/);
  });
});
