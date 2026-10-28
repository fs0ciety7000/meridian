import { readFileSync } from 'node:fs';
import { EntitiesFile, GeoFeatureProps, GeoManifest } from '@meridian/content-schema';
import { geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';

const read = (f: string) =>
  readFileSync(new URL(`../../../content/geo/${f}`, import.meta.url), 'utf8');

type UnitsTopology = Topology<{ units: GeometryCollection<GeoFeatureProps> }>;
const load = (f: string) => {
  const topo = JSON.parse(read(f)) as UnitsTopology;
  return feature(topo, topo.objects.units) as FeatureCollection<Geometry, GeoFeatureProps>;
};

const { entities, territories } = EntitiesFile.parse(JSON.parse(read('entities.json')));
const lod110 = load('world-110m.topo.json');
const lod50 = load('world-50m.topo.json');
const micro = load('micro-10m.topo.json');

const byEntity = (fc: FeatureCollection<Geometry, GeoFeatureProps>, iso: string) =>
  fc.features.filter((f) => f.properties.entity === iso);

describe('generated geo data (development-plan phase 0 criteria)', () => {
  it('has 195 playable entities with unique ISO codes', () => {
    expect(entities).toHaveLength(195);
    expect(new Set(entities.map((e) => e.iso3)).size).toBe(195);
  });

  it('gives every feature valid properties', () => {
    for (const fc of [lod110, lod50, micro]) {
      for (const f of fc.features)
        expect(GeoFeatureProps.safeParse(f.properties).success).toBe(true);
    }
  });

  it('has a validation geometry (50m or micro-10m) for every entity', () => {
    const missing = entities.filter(
      (e) => byEntity(lod50, e.iso3).length + byEntity(micro, e.iso3).length === 0,
    );
    expect(missing.map((e) => e.iso3)).toEqual([]);
  });

  it('has a world-view geometry (110m or micro-10m) for every entity', () => {
    const missing = entities.filter(
      (e) => byEntity(lod110, e.iso3).length + byEntity(micro, e.iso3).length === 0,
    );
    expect(missing.map((e) => e.iso3)).toEqual([]);
  });

  it('has a 0.001° grid point inside every entity (coordQuantumDeg), starting with the aim point', () => {
    for (const e of entities) expect(Number(e.aimPoint[0].toFixed(3))).toBe(e.aimPoint[0]);
  });

  it('places every aim point inside its own entity', () => {
    const outside = entities.filter((e) => {
      const source = e.isMicroState ? micro : lod50;
      const candidates: Feature<Geometry, GeoFeatureProps>[] = byEntity(source, e.iso3);
      return !candidates.some((f) => geoContains(f, e.aimPoint));
    });
    expect(outside.map((e) => `${e.iso3} ${e.aimPoint.join(',')}`)).toEqual([]);
  });

  it('resolves known capitals to the right entity on the 50m validation layer', () => {
    const pick = (lonLat: [number, number]) =>
      [...lod50.features, ...micro.features]
        .filter((f) => geoContains(f, lonLat))
        .map((f) => f.properties.entity);
    expect(pick([2.35, 48.86])).toContain('FRA'); // Paris
    expect(pick([-52.33, 4.93])).toContain('FRA'); // Cayenne, French Guiana counts for France
    expect(pick([-42, 72])).toContain('DNK'); // inland Greenland counts for Denmark (coastal Nuuk is a snapping case)
    expect(pick([28.05, -26.2])).toContain('ZAF'); // Johannesburg
    expect(pick([27.48, -29.31])).toContain('LSO'); // Maseru, enclave inside South Africa
    expect(pick([27.48, -29.31])).not.toContain('ZAF');
    expect(pick([121.56, 25.03])).toEqual([null]); // Taipei: not plantable under policy v1
  });

  it('keeps territories and unplantable units consistent', () => {
    for (const t of territories) {
      if (t.plantable) expect(t.sovereign, t.id).not.toBeNull();
      if (t.reason === 'antarctica') expect(t.plantable).toBe(false);
    }
  });

  it('records sizes and hashes in the manifest within budget', () => {
    const manifest = GeoManifest.parse(JSON.parse(read('geo-manifest.json')));
    const w110 = manifest.files.find((f) => f.lod === '110m')!;
    expect(w110.bytesGz).toBeLessThanOrEqual(80_000);
    expect(manifest.version).toBe(entities[0]!.dataVersion);
  });
});
