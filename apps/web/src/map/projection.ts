import { geoEqualEarth, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';

export type ProjectionKind = 'equalEarth' | 'naturalEarth';

/**
 * World projection at camera scale 1 (architecture §4.2): Equal Earth by default, Natural
 * Earth I as the "old atlas" option. `centerLon` rotates the world so an expedition crossing
 * the Pacific is not cut at the map edge.
 */
export function makeProjection(
  kind: ProjectionKind,
  width: number,
  height: number,
  centerLon = 0,
): GeoProjection {
  const projection = (kind === 'naturalEarth' ? geoNaturalEarth1() : geoEqualEarth()).rotate([
    -centerLon,
    0,
  ]);
  const margin = Math.max(16, Math.round(Math.min(width, height) * 0.04));
  return projection.fitExtent(
    [
      [margin, margin],
      [width - margin, height - margin],
    ],
    { type: 'Sphere' },
  );
}

/** Number of route legs the map edge (antimeridian of `centerLon`) cuts in two. */
export function cutLegs(
  kind: ProjectionKind,
  centerLon: number,
  legs: [number, number][][],
): number {
  const path = geoPath(makeProjection(kind, 1000, 500, centerLon));
  return legs.filter(
    (coords) => (path({ type: 'LineString', coordinates: coords }) ?? '').split('M').length > 2,
  ).length;
}

/**
 * Centre longitude (multiple of 10°) that keeps the whole route on one piece of map
 * (architecture §4.2): fewest cut legs, then the smallest rotation from `current`.
 */
export function bestCenterLon(
  kind: ProjectionKind,
  legs: [number, number][][],
  current = 0,
): number {
  if (cutLegs(kind, current, legs) === 0) return current;
  let best = current;
  let bestScore = Infinity;
  for (let lon = -170; lon <= 180; lon += 10) {
    const rotation = Math.abs(((lon - current + 540) % 360) - 180);
    const score = cutLegs(kind, lon, legs) * 1000 + rotation;
    if (score < bestScore) {
      bestScore = score;
      best = lon;
    }
  }
  return best;
}
