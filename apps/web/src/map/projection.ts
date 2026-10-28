import { geoEqualEarth, geoNaturalEarth1, type GeoProjection } from 'd3-geo';

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
