import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM, haversineKm, quantize, wrapLon } from '../src/index';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm([2.35, 48.85], [2.35, 48.85])).toBe(0);
  });

  it('matches the Paris → New York reference distance (≈ 5 837 km)', () => {
    expect(haversineKm([2.3522, 48.8566], [-74.006, 40.7128])).toBeCloseTo(5837, -1);
  });

  it('returns half the circumference for antipodes', () => {
    expect(haversineKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 6);
  });

  it('is symmetric and unaffected by the antimeridian', () => {
    const fiji: [number, number] = [178.44, -18.14];
    const samoa: [number, number] = [-171.76, -13.83];
    expect(haversineKm(fiji, samoa)).toBeCloseTo(haversineKm(samoa, fiji), 9);
    expect(haversineKm(fiji, samoa)).toBeLessThan(1500);
  });
});

describe('wrapLon', () => {
  it.each([
    [190, -170],
    [-190, 170],
    [180, -180],
    [540, -180],
    [0, 0],
    [-0, 0],
  ])('wraps %d to %d', (input, expected) => {
    expect(wrapLon(input)).toBe(expected);
  });
});

describe('quantize', () => {
  it('rounds to 0.001° by default', () => {
    expect(quantize([2.34567, 48.85432])).toEqual([2.346, 48.854]);
  });

  it('keeps a grid point inside the Vatican (≈ 0.012° × 0.007°)', () => {
    expect(quantize([12.4523, 41.9038])).toEqual([12.452, 41.904]);
  });

  it('clamps latitude and wraps longitude', () => {
    expect(quantize([181, 95])).toEqual([-179, 90]);
  });
});
