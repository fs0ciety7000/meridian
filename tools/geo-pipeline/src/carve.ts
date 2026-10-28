/**
 * Cuts areas out of the Natural Earth admin-0 polygons (geo policy v2, docs/geo-policy-changelog.md).
 *
 * Natural Earth's default admin-0 "countries" layer folds some areas into a sovereign polygon
 * although they are not plantable under data-model §2.3 (Crimea inside Russia, the Moroccan-
 * administered part of Western Sahara inside Morocco, …), and the coarse 110m/50m layers swallow
 * small units that only exist at 10m (Akrotiri inside Cyprus, Bir Tawil inside Sudan, …). A
 * cut removes the area from every unit it overlaps and gives it to a single destination unit,
 * so that every point is covered once at every level of detail.
 */
import { EARTH_RADIUS_KM } from '@meridian/geo';
import { geoArea, geoBounds } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import mapshaper from 'mapshaper';
import type { Classification, NeProps } from './classify';

export type NeFeature = Feature<Polygon | MultiPolygon, NeProps>;

export interface Unit {
  feature: NeFeature;
  c: Classification;
}

export interface Cut {
  /** Area to carve out, at the finest resolution available for the target level of detail. */
  geometry: Polygon | MultiPolygon;
  /** Unit receiving the area: an existing unit of the layer (same ADM0_A3) or a new one. */
  dest: Unit;
  /** Units the area may be taken from (the destination itself is never a victim). */
  victim: (u: Unit) => boolean;
}

/**
 * A remainder part created by the cut (not an original part of the victim) is a coastal sliver
 * — the victim's coarser coastline sticking out of a finer cut polygon — when it is this small
 * relative to the carved area and to the victim. Slivers go to the destination.
 */
const SLIVER_OF_PIECE = 0.1;
const SLIVER_OF_VICTIM = 0.01;

export const polygonsOf = (g: Polygon | MultiPolygon): Position[][][] =>
  g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

/** Spherical area in steradians, robust to ring winding. */
export function polygonArea(rings: Position[][]): number {
  const a = geoArea({ type: 'Polygon', coordinates: rings });
  return Math.min(a, 4 * Math.PI - a);
}

/** Planar signed area (lon/lat), positive when counter-clockwise. */
function signedArea(ring: Position[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    s += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  return s / 2;
}

/** d3-geo winding: clockwise exterior rings, counter-clockwise holes (mapshaper emits RFC 7946). */
function rewind(rings: Position[][]): Position[][] {
  return rings.map((ring, i) => {
    const ccw = signedArea(ring) > 0;
    return (i === 0) === ccw ? [...ring].reverse() : ring;
  });
}

const toGeometry = (polys: Position[][][]): Polygon | MultiPolygon | null =>
  polys.length === 0
    ? null
    : polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0]! }
      : { type: 'MultiPolygon', coordinates: polys };

type Box = [[number, number], [number, number]];
const boxOf = (g: Polygon | MultiPolygon): Box =>
  geoBounds({ type: 'Feature', properties: null, geometry: g }) as Box;
function boxesIntersect([[w1, s1], [e1, n1]]: Box, [[w2, s2], [e2, n2]]: Box): boolean {
  if (s1 > n2 || s2 > n1) return false;
  // Across the antimeridian geoBounds returns west > east: treat such boxes as world-wide.
  if (w1 > e1 || w2 > e2) return true;
  return w1 <= e2 && w2 <= e1;
}

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

/** Reads a mapshaper GeoJSON output as one geometry per input index (null when empty). */
function readLayer(out: Record<string, unknown>, file: string, n: number): Position[][][][] {
  const byIndex: Position[][][][] = Array.from({ length: n }, () => []);
  const layer = JSON.parse(String(out[file] ?? '{"features":[]}')) as FeatureCollection<
    Polygon | MultiPolygon | null,
    { i: number }
  >;
  // mapshaper writes an empty layer as a bare GeometryCollection.
  for (const f of layer.features ?? [])
    if (f.geometry) byIndex[f.properties.i]!.push(...polygonsOf(f.geometry).map(rewind));
  return byIndex;
}

/** Merges adjacent polygons into one geometry (removes the borders between them). */
async function dissolve(polys: Position[][][]): Promise<Position[][][]> {
  const input = fc(
    polys.map((coordinates) => ({
      type: 'Feature',
      properties: { i: 0 },
      geometry: { type: 'Polygon', coordinates },
    })),
  );
  const out = await mapshaper.applyCommands('-i in.json -dissolve2 i -o out.json format=geojson', {
    'in.json': input,
  });
  return readLayer(out, 'out.json', 1)[0]!;
}

/** Applies the cuts in order and returns the new unit list (sorted by unit id). */
export async function carve(units: Unit[], cuts: Cut[]): Promise<{ units: Unit[]; log: string[] }> {
  let current = [...units];
  const log: string[] = [];
  for (const cut of cuts) {
    const destId = cut.dest.feature.properties.ADM0_A3;
    const cutBox = boxOf(cut.geometry);
    const victims = current.filter(
      (u) =>
        u.feature.properties.ADM0_A3 !== destId &&
        cut.victim(u) &&
        boxesIntersect(boxOf(u.feature.geometry), cutBox),
    );
    if (!victims.length) continue;

    // One mapshaper dataset for victims and cut: the clipped pieces and the remainders share
    // the very same intersection vertices, so the new border is a shared TopoJSON arc.
    const out = await mapshaper.applyCommands(
      '-i victims.json cut.json combine-files ' +
        '-clip target=victims source=cut name=pieces + ' +
        '-erase target=victims source=cut ' +
        '-o target=pieces,victims format=geojson',
      {
        'victims.json': fc(
          victims.map((u, i) => ({
            type: 'Feature',
            properties: { i },
            geometry: u.feature.geometry,
          })),
        ),
        'cut.json': fc([{ type: 'Feature', properties: {}, geometry: cut.geometry }]),
      },
    );
    const pieces = readLayer(out, 'pieces.json', victims.length);
    const rests = readLayer(out, 'victims.json', victims.length);
    const carved = pieces.flat();
    const carvedArea = carved.reduce((s, p) => s + polygonArea(p), 0);
    if (carvedArea === 0) continue;

    const taken: Position[][][] = [...carved];
    const replaced = new Map<Unit, Polygon | MultiPolygon | null>();
    victims.forEach((u, i) => {
      if (pieces[i]!.length === 0) return;
      const originalAreas = polygonsOf(u.feature.geometry).map(polygonArea);
      const victimArea = originalAreas.reduce((s, a) => s + a, 0);
      const isOriginal = (a: number) => originalAreas.some((o) => Math.abs(o - a) <= o * 1e-9);
      const kept: Position[][][] = [];
      for (const p of rests[i]!) {
        const a = polygonArea(p);
        const sliver =
          !isOriginal(a) && a < SLIVER_OF_PIECE * carvedArea && a < SLIVER_OF_VICTIM * victimArea;
        (sliver ? taken : kept).push(p);
      }
      replaced.set(u, toGeometry(kept));
      const km2 = pieces[i]!.reduce((s, p) => s + polygonArea(p), 0) * EARTH_RADIUS_KM ** 2;
      log.push(`${u.feature.properties.ADM0_A3} → ${destId} ${Math.round(km2)} km²`);
    });

    const existing = current.find((u) => u.feature.properties.ADM0_A3 === destId);
    const merged = await dissolve([
      ...(existing ? polygonsOf(existing.feature.geometry).map(rewind) : []),
      ...taken,
    ]);
    const destGeometry = toGeometry(merged);
    if (!destGeometry) continue;
    const dest: Unit = {
      c: (existing ?? cut.dest).c,
      feature: { ...(existing ?? cut.dest).feature, geometry: destGeometry },
    };
    current = current.flatMap((u) => {
      if (u === existing) return [dest];
      if (!replaced.has(u)) return [u];
      const g = replaced.get(u);
      return g ? [{ ...u, feature: { ...u.feature, geometry: g } }] : [];
    });
    if (!existing) current.push(dest);
  }
  current.sort((a, b) => a.feature.properties.ADM0_A3.localeCompare(b.feature.properties.ADM0_A3));
  return { units: current, log };
}
