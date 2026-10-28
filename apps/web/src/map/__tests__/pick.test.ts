import { readFileSync } from 'node:fs';
import { EntitiesFile } from '@meridian/content-schema';
import { describe, expect, it } from 'vitest';
import { buildEntities, buildLayer, type GeoData, type UnitsTopology } from '../geodata';
import { resolvePick } from '../pick';

const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`../../../../../content/geo/${f}`, import.meta.url), 'utf8'));

const data: GeoData = {
  layers: {
    '110m': buildLayer(read('world-110m.topo.json') as UnitsTopology),
    '50m': buildLayer(read('world-50m.topo.json') as UnitsTopology),
  },
  micro: buildLayer(read('micro-10m.topo.json') as UnitsTopology),
  entities: buildEntities(EntitiesFile.parse(read('entities.json'))),
};

describe('resolvePick (architecture §4.4)', () => {
  it.each([
    ['Paris', [2.35, 48.86], 'FRA', 'playable'],
    ['Cayenne (French Guiana counts for France)', [-52.33, 4.93], 'FRA', 'playable'],
    ['inland Greenland (territory of Denmark)', [-42, 72], 'DNK', 'territory'],
    ['Maseru (Lesotho, enclave in South Africa)', [27.48, -29.31], 'LSO', 'playable'],
    ['Valletta (Malta, micro-state on 10m)', [14.51, 35.9], 'MLT', 'playable'],
    // Natural Earth 10m draws the Vatican as a ~110 m polygon around the basilica.
    ['St Peter’s Basilica (Vatican)', [12.4533, 41.9033], 'VAT', 'playable'],
    ['Rome, just outside the Vatican', [12.47, 41.9], 'ITA', 'playable'],
    ['Fongafale islet (Tuvalu)', [179.211, -8.519], 'TUV', 'playable'],
    ['Singapore', [103.82, 1.35], 'SGP', 'playable'],
    ['Banjul region (Gambia)', [-15.6, 13.45], 'GMB', 'playable'],
  ] as const)('%s → %s', (_name, lonLat, entity, kind) => {
    const pick = resolvePick(data, lonLat);
    expect(pick.entity).toBe(entity);
    expect(pick.kind).toBe(kind);
  });

  it('resolves every entity aim point to that entity (halo taps snap there)', () => {
    const wrong = [...data.entities.values()]
      .map((e) => [e.iso3, resolvePick(data, e.aimPoint).entity] as const)
      .filter(([iso, got]) => iso !== got);
    expect(wrong).toEqual([]);
  });

  it('reports the open sea', () => {
    expect(resolvePick(data, [-30, 0])).toMatchObject({ kind: 'sea', entity: null, unitId: null });
  });

  it('reports unplantable units without an entity', () => {
    expect(resolvePick(data, [121.0, 23.7])).toMatchObject({
      kind: 'unplantable',
      unitId: 'TWN',
      entity: null,
    });
    expect(resolvePick(data, [0, -80])).toMatchObject({ kind: 'unplantable', unitId: 'ATA' });
  });

  it('quantizes the point before validating it', () => {
    expect(resolvePick(data, [2.3456789, 48.8566123]).lonLat).toEqual([2.346, 48.857]);
  });

  it('falls back to 110m before 50m is loaded', () => {
    const light: GeoData = { ...data, layers: { '110m': data.layers['110m'] } };
    expect(resolvePick(light, [2.35, 48.86]).entity).toBe('FRA');
  });
});
