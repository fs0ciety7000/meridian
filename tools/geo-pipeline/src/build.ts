/**
 * Natural Earth → Meridian geo data (development-plan 0.4 / 0.5, architecture §4.1).
 *
 *   pnpm geo         downloads (cached, checksum-verified) and writes content/geo/*
 *   pnpm geo:check   rebuilds in memory and fails if the committed files differ
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  EntitiesFile,
  GeoManifest,
  type GeoLod,
  type PlayableEntity,
  type Territory,
} from '@meridian/content-schema';
import { EARTH_RADIUS_KM } from '@meridian/geo';
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import {
  classify,
  continentOf,
  SUBREGION_M49,
  type Classification,
  type GeoPolicy,
  type NeProps,
} from './classify';

const PIPELINE_VERSION = 3;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const cacheDir = resolve(here, '../.cache');
const outDir = resolve(root, 'content/geo');
const checkOnly = process.argv.includes('--check');

type Source = { url: string; sha256: string };
const sources = JSON.parse(readFileSync(resolve(here, '../sources.json'), 'utf8')) as {
  version: string;
  files: Record<'110m' | '50m' | '10m', Source>;
};
const policy = JSON.parse(readFileSync(resolve(outDir, 'policy.json'), 'utf8')) as GeoPolicy;
const dataVersion = `ne-${sources.version}+policy-${policy.version}+pipeline-${PIPELINE_VERSION}`;

type NeFeature = Feature<Polygon | MultiPolygon, NeProps>;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

async function load(scale: keyof typeof sources.files): Promise<NeFeature[]> {
  const src = sources.files[scale];
  const file = resolve(cacheDir, `ne_${scale}_admin_0_countries.geojson`);
  if (!existsSync(file)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`↓ ${src.url}`);
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${src.url}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const raw = readFileSync(file);
  const actual = sha256(raw);
  if (actual !== src.sha256)
    throw new Error(`Checksum mismatch for ${scale}: ${actual} ≠ ${src.sha256}`);
  const fc = JSON.parse(raw.toString('utf8')) as FeatureCollection<Polygon | MultiPolygon, NeProps>;
  // Sort by unit id so that output never depends on source ordering.
  return [...fc.features].sort((a, b) => a.properties.ADM0_A3.localeCompare(b.properties.ADM0_A3));
}

const polygonsOf = (f: NeFeature): Position[][][] =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

/** Spherical area in steradians, robust to ring winding (d3 expects clockwise rings). */
function polygonArea(rings: Position[][]): number {
  const a = geoArea({ type: 'Polygon', coordinates: rings });
  return Math.min(a, 4 * Math.PI - a);
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));

const largestPolygon = (f: NeFeature): Position[][] =>
  polygonsOf(f).reduce((best, p) => (polygonArea(p) > polygonArea(best) ? p : best));

/**
 * Pole of inaccessibility of the largest polygon, snapped to the gameplay coordinate grid
 * (BALANCE.coordQuantumDeg = 0.001°). If rounding pushes it outside (micro-states), the
 * nearest grid point inside the polygon is used instead.
 */
function aimPoint(f: NeFeature): [number, number] {
  const polygon = largestPolygon(f);
  const [[w, s], [e, n]] = geoBounds({ type: 'Polygon', coordinates: polygon });
  const precision = Math.min(0.01, Math.max(e - w, n - s) / 200);
  const p = polylabel(polygon as number[][][], precision);
  const target: [number, number] = [round(p[0]!, 3), round(p[1]!, 3)];
  const inside = (q: [number, number]) => geoContains({ type: 'Polygon', coordinates: polygon }, q);
  if (inside(target)) return target;
  for (let r = 1; r <= 50; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q: [number, number] = [
          round(target[0] + dx / 1000, 3),
          round(target[1] + dy / 1000, 3),
        ];
        if (inside(q)) return q;
      }
    }
  }
  throw new Error(`${f.properties.ADM0_A3}: no 0.001° grid point inside the main polygon`);
}

/** [west, south, east, north]; west > east when the extent crosses the antimeridian. */
function bbox(geometry: Polygon | MultiPolygon): [number, number, number, number] {
  const [[w, s], [e, n]] = geoBounds({ type: 'Feature', properties: null, geometry });
  return [round(w, 3), round(s, 3), round(e, 3), round(n, 3)];
}

interface Unit {
  feature: NeFeature;
  c: Classification;
}

const toProps = ({ feature, c }: Unit) => ({
  id: feature.properties.ADM0_A3,
  entity: c.kind === 'unplantable' ? null : c.entity,
  kind: c.kind,
  disputed: c.kind === 'unplantable' && c.reason === 'disputed',
});

async function topo(units: Unit[], quantization: number): Promise<string> {
  const input: FeatureCollection = {
    type: 'FeatureCollection',
    features: units.map((u) => ({
      type: 'Feature',
      properties: toProps(u),
      geometry: u.feature.geometry,
    })),
  };
  const out = await mapshaper.applyCommands(
    `-i units.json -o units.topo.json format=topojson quantization=${quantization}`,
    { 'units.json': input },
  );
  return String(out['units.topo.json']);
}

async function main() {
  const [ne110, ne50, ne10] = await Promise.all([load('110m'), load('50m'), load('10m')]);
  const classifyAll = (fs: NeFeature[]): Unit[] =>
    fs.map((feature) => ({ feature, c: classify(feature.properties, policy) }));
  const [u110, u50, u10] = [classifyAll(ne110), classifyAll(ne50), classifyAll(ne10)];

  // ── Entities (computed on 10m for area, 50m/10m for shape metadata) ─────────────
  const members = [...policy.unMembers, ...policy.unObservers].sort();
  const homeOf = (units: Unit[], iso: string) =>
    units.filter((u) => u.c.kind === 'playable' && u.c.entity === iso);
  const allOf = (units: Unit[], iso: string) =>
    units.filter((u) => u.c.kind !== 'unplantable' && u.c.entity === iso);

  const errors: string[] = [];
  const areaKm2 = new Map<string, number>();
  for (const iso of members) {
    const homes = homeOf(u10, iso);
    if (homes.length !== 1)
      errors.push(`${iso}: expected exactly one home unit in 10m, found ${homes.length}`);
    const sr = allOf(u10, iso).reduce(
      (s, u) => s + polygonsOf(u.feature).reduce((t, p) => t + polygonArea(p), 0),
      0,
    );
    areaKm2.set(iso, round(sr * EARTH_RADIUS_KM ** 2, 2));
  }
  const isMicro = (iso: string) => (areaKm2.get(iso) ?? 0) < policy.microStateMaxKm2;

  // Neighbours: shared arcs in the 50m topology, territories included (France borders Brazil).
  const topo50 = JSON.parse(await topo(u50, 1e6)) as Topology<{
    units: GeometryCollection<{ entity: string | null }>;
  }>;
  const geoms = topo50.objects.units.geometries;
  const adjacency = neighbors(geoms as never);
  const neighborMap = new Map<string, Set<string>>();
  const entityOf = (g: (typeof geoms)[number] | undefined) =>
    (g?.properties as { entity: string | null } | undefined)?.entity ?? null;
  geoms.forEach((g, i) => {
    const self = entityOf(g);
    if (!self) return;
    for (const j of adjacency[i] ?? []) {
      const other = entityOf(geoms[j]);
      if (other && other !== self)
        (neighborMap.get(self) ?? neighborMap.set(self, new Set()).get(self)!).add(other);
    }
  });

  const entities: PlayableEntity[] = [];
  for (const iso of members) {
    const home10 = homeOf(u10, iso)[0];
    if (!home10) continue;
    const p = home10.feature.properties;
    const shapeSource = isMicro(iso) ? home10 : (homeOf(u50, iso)[0] ?? home10);
    const continent = continentOf(p, policy);
    const subregionM49 = SUBREGION_M49[p.SUBREGION];
    if (!continent)
      errors.push(`${iso}: no continent for "${p.CONTINENT}" (add a continentOverride)`);
    if (!subregionM49) errors.push(`${iso}: unknown sub-region "${p.SUBREGION}"`);
    const continents = new Set(
      allOf(u10, iso)
        .map((u) => continentOf(u.feature.properties, policy))
        .filter((c): c is NonNullable<typeof c> => c !== null),
    );
    entities.push({
      iso3: iso,
      iso2: p.ISO_A2_EH,
      m49: p.ISO_N3_EH.padStart(3, '0'),
      subregionM49: subregionM49 ?? '000',
      continent: continent ?? 'AN',
      continents: [...continents].sort(),
      geomIds: allOf(u10, iso)
        .map((u) => u.feature.properties.ADM0_A3)
        .sort(),
      aimPoint: aimPoint(shapeSource.feature),
      bbox: bbox(shapeSource.feature.geometry),
      mainBbox: bbox({ type: 'Polygon', coordinates: largestPolygon(shapeSource.feature) }),
      areaKm2: areaKm2.get(iso)!,
      isMicroState: isMicro(iso),
      neighbors: [...(neighborMap.get(iso) ?? [])].sort(),
      dataVersion,
    });
  }

  const territories: Territory[] = u10
    .filter((u) => u.c.kind !== 'playable')
    .map(({ feature, c }) => ({
      id: feature.properties.ADM0_A3,
      name: feature.properties.ADMIN,
      sovereign: c.kind === 'territory' ? c.entity : c.kind === 'unplantable' ? c.sovereign : null,
      geomId: feature.properties.ADM0_A3,
      plantable: c.kind === 'territory',
      reason:
        c.kind === 'territory' ? 'dependency' : c.kind === 'unplantable' ? c.reason : 'dependency',
    }));

  if (errors.length) throw new Error(`Geo policy violations:\n  ${errors.join('\n  ')}`);

  // ── TopoJSON per level of detail ──────────────────────────────────────────────
  // micro-10m: micro-states, playable units the 110m world view lacks (Cabo Verde, Mauritius,
  // Samoa…) and territories the 50m validation layer lacks.
  const in50 = new Set(ne50.map((f) => f.properties.ADM0_A3));
  const in110 = new Set(ne110.map((f) => f.properties.ADM0_A3));
  const micro = u10.filter(({ feature, c }) => {
    if (c.kind === 'unplantable') return false;
    const id = feature.properties.ADM0_A3;
    return isMicro(c.entity) || !in50.has(id) || (c.kind === 'playable' && !in110.has(id));
  });

  const outputs: Record<string, string> = {
    'world-110m.topo.json': await topo(u110, 1e5),
    'world-50m.topo.json': await topo(u50, 1e5),
    'micro-10m.topo.json': await topo(micro, 1e6),
    'entities.json': `${JSON.stringify(EntitiesFile.parse({ dataVersion, entities, territories }), null, 2)}\n`,
  };

  const lods: [GeoLod, string][] = [
    ['110m', 'world-110m.topo.json'],
    ['50m', 'world-50m.topo.json'],
    ['10m-micro', 'micro-10m.topo.json'],
  ];
  const manifest = GeoManifest.parse({
    version: dataVersion,
    source: { name: 'Natural Earth', version: sources.version },
    files: lods.map(([lod, file]) => ({
      lod,
      file,
      sha256: sha256(outputs[file]!),
      bytes: Buffer.byteLength(outputs[file]!),
      bytesGz: gzipSync(outputs[file]!, { level: 9 }).length,
    })),
  });
  outputs['geo-manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;

  // ── Budgets (architecture §4.1) ───────────────────────────────────────────────
  const gz = (f: string) => manifest.files.find((x) => x.file === f)!.bytesGz;
  if (gz('world-110m.topo.json') > 80_000)
    throw new Error('world-110m exceeds the 80 KB gz budget');

  console.log(
    `${dataVersion}: ${entities.length} playable entities, ${territories.length} other units`,
  );
  console.log(
    `  micro-states: ${entities
      .filter((e) => e.isMicroState)
      .map((e) => e.iso3)
      .join(' ')}`,
  );
  for (const f of manifest.files)
    console.log(
      `  ${f.file.padEnd(22)} ${(f.bytes / 1024).toFixed(0).padStart(6)} KB  ${(f.bytesGz / 1024).toFixed(0).padStart(5)} KB gz`,
    );

  if (checkOnly) {
    const stale = Object.entries(outputs).filter(
      ([f, c]) => !existsSync(resolve(outDir, f)) || readFileSync(resolve(outDir, f), 'utf8') !== c,
    );
    if (stale.length) {
      console.error(
        `✗ content/geo is stale: ${stale.map(([f]) => f).join(', ')} — run \`pnpm geo\``,
      );
      process.exit(1);
    }
    console.log('✓ content/geo is up to date');
    return;
  }
  for (const [f, c] of Object.entries(outputs)) writeFileSync(resolve(outDir, f), c);
  console.log(`✓ written to ${outDir}`);
}

await main();
