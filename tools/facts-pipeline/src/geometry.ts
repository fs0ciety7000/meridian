import type { EntitiesFile, GeoFeatureProps, PlayableEntity } from '@meridian/content-schema';
import { EARTH_RADIUS_KM } from '@meridian/geo';
import { geoArea, geoDistance } from 'd3-geo';
import type { Position } from 'geojson';
import { feature } from 'topojson-client';
import type {
  GeometryCollection,
  MultiPolygon as TopoMultiPolygon,
  Polygon as TopoPolygon,
  Topology,
} from 'topojson-specification';

type UnitsTopology = Topology<{ units: GeometryCollection<GeoFeatureProps> }>;

/** Overseas parts farther than this from the main polygon are not "metropolitan". */
export const METRO_MAX_KM = 1500;

const TROPIC = 23.44;
const POLAR = 66.56;

interface Part {
  unitId: string;
  entity: string;
  home: boolean;
  rings: Position[][];
  arcs: number[];
  areaKm2: number;
}

const ringArea = (rings: Position[][]) => {
  const a = geoArea({ type: 'Polygon', coordinates: rings });
  return Math.min(a, 4 * Math.PI - a) * EARTH_RADIUS_KM ** 2;
};

const sample = (ring: Position[], max = 160) => {
  const step = Math.max(1, Math.floor(ring.length / max));
  return ring.filter((_, i) => i % step === 0) as [number, number][];
};

/** Minimum great-circle distance (km) between two polygon parts, on sampled outer rings. */
function partDistanceKm(a: Part, b: Part): number {
  let min = Infinity;
  for (const p of sample(a.rings[0]!))
    for (const q of sample(b.rings[0]!)) min = Math.min(min, geoDistance(p, q));
  return min * EARTH_RADIUS_KM;
}

/** Splits every playable/territory unit of a topology into polygon parts with their arcs. */
function partsOf(
  topology: UnitsTopology,
  entities: Map<string, PlayableEntity>,
  skip = new Set<string>(),
): Part[] {
  const parts: Part[] = [];
  const fc = feature(topology, topology.objects.units);
  topology.objects.units.geometries.forEach((g, i) => {
    const props = g.properties as GeoFeatureProps;
    if (!props.entity || skip.has(props.id)) return;
    const geo = fc.features[i]!.geometry;
    const coordPolys =
      geo.type === 'Polygon'
        ? [geo.coordinates]
        : geo.type === 'MultiPolygon'
          ? geo.coordinates
          : [];
    const arcPolys =
      g.type === 'Polygon'
        ? [(g as TopoPolygon).arcs]
        : g.type === 'MultiPolygon'
          ? (g as TopoMultiPolygon).arcs
          : [];
    coordPolys.forEach((rings, j) => {
      parts.push({
        unitId: props.id,
        entity: props.entity!,
        home: props.kind === 'playable' && entities.has(props.entity!),
        rings,
        arcs: (arcPolys[j] ?? []).flat().map((a) => (a < 0 ? ~a : a)),
        areaKm2: ringArea(rings),
      });
    });
  });
  return parts;
}

export interface GeometryFacts {
  areaKm2: number;
  northernmostLat: number;
  southernmostLat: number;
  crossesEquator: boolean;
  crossesTropicOfCancer: boolean;
  crossesTropicOfCapricorn: boolean;
  crossesArcticCircle: boolean;
  crossesPrimeMeridian: boolean;
  hemisphereNS: 'N' | 'S' | 'both';
  hemisphereEW: 'E' | 'W' | 'both';
  landBorders: number;
  borders: string[];
  hasLandBorder: boolean;
}

function factsOf(parts: Part[], neighbours: Set<string>): GeometryFacts {
  let n = -90;
  let s = 90;
  let east = false;
  let west = false;
  // A line is "crossed" only when a single part straddles it: a state with islands in both
  // hemispheres is not crossed by the equator (France, United Kingdom).
  const crossed = { equator: false, cancer: false, capricorn: false, arctic: false, prime: false };
  for (const p of parts) {
    let pMinLon = 180;
    let pMaxLon = -180;
    let pS = 90;
    let pN = -90;
    for (const [lon, lat] of p.rings[0]! as [number, number][]) {
      pN = Math.max(pN, lat);
      pS = Math.min(pS, lat);
      pMinLon = Math.min(pMinLon, lon);
      pMaxLon = Math.max(pMaxLon, lon);
    }
    n = Math.max(n, pN);
    s = Math.min(s, pS);
    if (pMaxLon > 0) east = true;
    if (pMinLon < 0) west = true;
    const straddles = (lat: number) => pS < lat && pN > lat;
    crossed.equator ||= straddles(0);
    crossed.cancer ||= straddles(TROPIC);
    crossed.capricorn ||= straddles(-TROPIC);
    crossed.arctic ||= straddles(POLAR);
    crossed.prime ||= pMinLon < 0 && pMaxLon > 0 && pMaxLon - pMinLon < 180;
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  const borders = [...neighbours].sort();
  return {
    areaKm2: Math.round(parts.reduce((t, p) => t + p.areaKm2, 0)),
    northernmostLat: round(n),
    southernmostLat: round(s),
    crossesEquator: crossed.equator,
    crossesTropicOfCancer: crossed.cancer,
    crossesTropicOfCapricorn: crossed.capricorn,
    crossesArcticCircle: crossed.arctic,
    crossesPrimeMeridian: crossed.prime,
    hemisphereNS: s >= 0 ? 'N' : n <= 0 ? 'S' : 'both',
    hemisphereEW: east && west ? 'both' : east ? 'E' : 'W',
    landBorders: borders.length,
    borders,
    hasLandBorder: borders.length > 0,
  };
}

/**
 * Geometric facts for every entity, for the whole state and for its metropolitan parts
 * (the home unit's parts within METRO_MAX_KM of its largest polygon).
 */
export function computeGeometryFacts(
  entitiesFile: EntitiesFile,
  world50: UnitsTopology,
  micro10: UnitsTopology,
): Map<string, { whole: GeometryFacts; metro: GeometryFacts }> {
  const entities = new Map(entitiesFile.entities.map((e) => [e.iso3, e]));
  const in50 = new Set(
    world50.objects.units.geometries.map((g) => (g.properties as GeoFeatureProps).id),
  );
  const microEntities = new Set(
    entitiesFile.entities.filter((e) => e.isMicroState).map((e) => e.iso3),
  );

  // 50m parts carry the topology (shared arcs = land borders); 10m parts fill in micro-states
  // and territories the 50m layer lacks.
  const parts50 = partsOf(world50, entities);
  const microParts = partsOf(micro10, entities).filter(
    (p) => !in50.has(p.unitId) || microEntities.has(p.entity),
  );

  // Arc → entities using it (land borders between units of different entities).
  const arcUsers = new Map<number, Set<string>>();
  for (const p of parts50)
    for (const a of p.arcs) (arcUsers.get(a) ?? arcUsers.set(a, new Set()).get(a)!).add(p.entity);
  const partNeighbours = (p: Part) => {
    const out = new Set<string>();
    for (const a of p.arcs) for (const e of arcUsers.get(a) ?? []) if (e !== p.entity) out.add(e);
    return out;
  };
  const result = new Map<string, { whole: GeometryFacts; metro: GeometryFacts }>();
  for (const e of entitiesFile.entities) {
    const useMicro = microEntities.has(e.iso3);
    const all = [
      ...(useMicro ? [] : parts50.filter((p) => p.entity === e.iso3)),
      ...microParts.filter((p) => p.entity === e.iso3),
    ];
    if (!all.length) throw new Error(`${e.iso3}: no geometry`);
    const home = all.filter((p) => p.home);
    const main = home.reduce((a, b) => (b.areaKm2 > a.areaKm2 ? b : a), home[0] ?? all[0]!);
    const metro = home.filter((p) => p === main || partDistanceKm(p, main) <= METRO_MAX_KM);

    const wholeNeighbours = new Set(e.neighbors);
    const metroNeighbours = new Set<string>();
    for (const p of metro) for (const n of partNeighbours(p)) metroNeighbours.add(n);
    // Micro-states have no 50m topology: they keep the entity-level neighbours.
    const metroN = useMicro ? wholeNeighbours : metroNeighbours;

    result.set(e.iso3, { whole: factsOf(all, wholeNeighbours), metro: factsOf(metro, metroN) });
  }
  return result;
}
