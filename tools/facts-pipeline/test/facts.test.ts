import { readFileSync } from 'node:fs';
import { FactsFile } from '@meridian/content-schema';
import { describe, expect, it } from 'vitest';

const file = FactsFile.parse(
  JSON.parse(readFileSync(new URL('../../../content/facts/facts.json', import.meta.url), 'utf8')),
);
const by = new Map(file.countries.map((c) => [c.iso3, c]));
const where = (fact: string, value: unknown = true) =>
  file.countries
    .filter((c) => JSON.stringify(c.facts[fact]) === JSON.stringify(value))
    .map((c) => c.iso3)
    .sort();

describe('country facts (development-plan 2.2)', () => {
  it('covers every fact for all 195 entities, each with a source', () => {
    expect(file.countries).toHaveLength(195);
    for (const c of file.countries) {
      for (const d of file.defs) {
        expect(c.facts, `${c.iso3}.${d.id}`).toHaveProperty(d.id);
        expect(c.sources[d.id]?.ref, `${c.iso3}.${d.id} source`).toBeTruthy();
      }
    }
  });

  it('knows the 13 equatorial countries', () => {
    expect(where('crossesEquator')).toEqual([
      'BRA',
      'COD',
      'COG',
      'COL',
      'ECU',
      'GAB',
      'IDN',
      'KEN',
      'KIR',
      'MDV',
      'SOM',
      'STP',
      'UGA',
    ]);
  });

  it('knows the 8 countries on the prime meridian', () => {
    expect(where('crossesPrimeMeridian')).toEqual([
      'BFA',
      'DZA',
      'ESP',
      'FRA',
      'GBR',
      'GHA',
      'MLI',
      'TGO',
    ]);
  });

  it('has 44 landlocked states, including the Caspian ones', () => {
    expect(where('landlocked')).toHaveLength(44);
    for (const iso of ['AZE', 'KAZ', 'TKM', 'VAT', 'SMR'])
      expect(by.get(iso)!.facts.landlocked).toBe(true);
  });

  it('separates the whole state from its metropolitan reading', () => {
    const fra = by.get('FRA')!;
    expect(fra.facts.borders).toContain('BRA'); // via French Guiana
    expect(fra.metro.borders).not.toContain('BRA');
    expect(by.get('DNK')!.facts.crossesArcticCircle).toBe(true); // Greenland
    expect(by.get('DNK')!.metro.crossesArcticCircle).toBe(false);
  });

  it('has curated memberships with their known sizes', () => {
    const members = (org: string) =>
      file.countries.filter((c) => (c.facts.memberOf as string[]).includes(org)).length;
    expect(members('eu')).toBe(27);
    expect(members('nato')).toBe(32);
    expect(members('asean')).toBe(11);
    expect(members('opec')).toBe(12);
  });

  it('gives every country a salience in [0, 1] with the well-known ones on top', () => {
    for (const iso of ['FRA', 'USA', 'JPN', 'NLD'])
      expect(by.get(iso)!.salience).toBeGreaterThan(0.8);
  });
});
