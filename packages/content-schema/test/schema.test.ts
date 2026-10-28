import { describe, expect, it } from 'vitest';
import { Iso3, LonLat, PlayableEntity } from '../src/index';

describe('content-schema', () => {
  it('validates ISO3 codes', () => {
    expect(Iso3.safeParse('FRA').success).toBe(true);
    expect(Iso3.safeParse('fra').success).toBe(false);
    expect(Iso3.safeParse('-99').success).toBe(false);
  });

  it('enforces GeoJSON coordinate order bounds', () => {
    expect(LonLat.safeParse([170, -45]).success).toBe(true);
    expect(LonLat.safeParse([-45, 170]).success).toBe(false);
  });

  it('accepts a well-formed playable entity', () => {
    const malta = {
      iso3: 'MLT',
      iso2: 'MT',
      m49: '470',
      subregionM49: '039',
      continent: 'EU',
      continents: ['EU'],
      geomIds: ['MLT'],
      aimPoint: [14.42, 35.89],
      bbox: [14.18, 35.8, 14.57, 36.08],
      areaKm2: 316,
      isMicroState: true,
      neighbors: [],
      dataVersion: 'test',
    };
    expect(PlayableEntity.parse(malta).iso3).toBe('MLT');
  });
});
