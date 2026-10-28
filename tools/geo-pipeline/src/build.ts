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
import { geoBounds, geoContains } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { carve, polygonArea, polygonsOf, type Cut, type NeFeature, type Unit } from './carve';
import {
  carveOutsOf,
  classify,
  continentOf,
  SUBREGION_M49,
  type GeoPolicy,
  type NeProps,
} from './classify';

const PIPELINE_VERSION = 4;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const cacheDir = resolve(here, '../.cache');
const outDir = resolve(root, 'content/geo');
const checkOnly = process.argv.includes('--check');

type Source = { url: string; sha256: string };
const sources = JSON.parse(readFileSync(resolve(here, '../sources.json'), 'utf8')) as {
  version: string;
  files: Record<'110m' | '50m' | '10m', Source>;
  disputedAreas: Record<'50m' | '10m', Source>;
};
const policy = JSON.parse(readFileSync(resolve(outDir, 'policy.json'), 'utf8')) as GeoPolicy;
const dataVersion = `ne-${sources.version}+policy-${policy.version}+pipeline-${PIPELINE_VERSION}`;

type AreaProps = NeProps & { BRK_A3: string; BRK_NAME: string };

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Downloads (once, into .cache) and checksum-verifies a pinned source. */
async function fetchSource<P>(src: Source): Promise<FeatureCollection<Polygon | MultiPolygon, P>> {
  const file = resolve(cacheDir, src.url.split('/').pop()!);
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
    throw new Error(`Checksum mismatch for ${src.url}: ${actual} ≠ ${src.sha256}`);
  return JSON.parse(raw.toString('utf8')) as FeatureCollection<Polygon | MultiPolygon, P>;
}

async function load(scale: keyof typeof sources.files): Promise<NeFeature[]> {
  const fc = await fetchSource<NeProps>(sources.files[scale]);
  // Sort by unit id so that output never depends on source ordering.
  return [...fc.features].sort((a, b) => a.properties.ADM0_A3.localeCompare(b.properties.ADM0_A3));
}

async function loadAreas(scale: keyof typeof sources.disputedAreas) {
  const fc = await fetchSource<AreaProps>(sources.disputedAreas[scale]);
  return new Map(fc.features.map((f) => [f.properties.BRK_A3, f]));
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));

const largestPolygon = (f: NeFeature): Position[][] =>
  polygonsOf(f.geometry).reduce((best, p) => (polygonArea(p) > polygonArea(best) ? p : best));

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
  const [ne110, ne50, ne10, areas50, areas10] = await Promise.all([
    load('110m'),
    load('50m'),
    load('10m'),
    loadAreas('50m'),
    loadAreas('10m'),
  ]);
  const classifyAll = (fs: NeFeature[]): Unit[] =>
    fs.map((feature) => ({ feature, c: classify(feature.properties, policy) }));
  const raw = { '110m': classifyAll(ne110), '50m': classifyAll(ne50), '10m': classifyAll(ne10) };

  // ── Cuts: every point is covered once, with the same plantability, at every LOD ──
  const idOf = (u: Unit) => u.feature.properties.ADM0_A3;
  const entityOfUnit = (u: Unit) => (u.c.kind === 'unplantable' ? null : u.c.entity);
  const cutsFor = (lod: keyof typeof raw): Cut[] => {
    const units = raw[lod];
    const areas = lod === '10m' ? areas10 : areas50;
    // 1. Policy carve-outs (Natural Earth disputed areas folded into a member's polygon).
    const cuts: Cut[] = carveOutsOf(policy).map(([brk, co]) => {
      const area = areas.get(brk);
      if (!area) throw new Error(`carveOuts.${brk}: not in the ${lod} disputed-areas layer`);
      const into = co.into && units.find((u) => idOf(u) === co.into);
      if (co.into && !into) throw new Error(`carveOuts.${brk}: no unit ${co.into} in ${lod}`);
      const dest: Unit = into || {
        feature: {
          type: 'Feature',
          properties: { ...area.properties, ADM0_A3: brk, ADMIN: co.name, TYPE: 'Disputed' },
          geometry: area.geometry,
        },
        c: { kind: 'unplantable', sovereign: null, reason: 'disputed' },
      };
      return { geometry: area.geometry, dest, victim: (u) => u.c.kind !== 'unplantable' };
    });
    // 2. Non-playable units that only exist at finer scales (Akrotiri, Bir Tawil…) are cut out
    //    of the coarser polygons of other entities, so that the coarse layers agree with 10m.
    if (lod !== '10m') {
      const here = new Set(units.map(idOf));
      const finer = lod === '110m' ? [...raw['50m'], ...raw['10m']] : raw['10m'];
      const seen = new Set<string>();
      for (const unit of finer) {
        const id = idOf(unit);
        if (unit.c.kind === 'playable' || here.has(id) || seen.has(id)) continue;
        seen.add(id);
        cuts.push({
          geometry: unit.feature.geometry,
          dest: unit,
          victim: (u) => u.c.kind !== 'unplantable' && entityOfUnit(u) !== entityOfUnit(unit),
        });
      }
    }
    return cuts;
  };
  const carved = {
    '110m': await carve(raw['110m'], cutsFor('110m')),
    '50m': await carve(raw['50m'], cutsFor('50m')),
    '10m': await carve(raw['10m'], cutsFor('10m')),
  };
  const [u110, u50, u10] = [carved['110m'].units, carved['50m'].units, carved['10m'].units];

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
      (s, u) => s + polygonsOf(u.feature.geometry).reduce((t, p) => t + polygonArea(p), 0),
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
  const in50 = new Set(u50.map(idOf));
  const in110 = new Set(u110.map(idOf));
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
  for (const lod of ['110m', '50m', '10m'] as const)
    console.log(`  cuts ${lod.padEnd(4)} ${carved[lod].log.join(', ')}`);
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
