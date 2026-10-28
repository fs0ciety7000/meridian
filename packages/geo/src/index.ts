import { geoInterpolate } from 'd3-geo';

/** [longitude, latitude] in decimal degrees, WGS84 — always GeoJSON order. */
export type LonLat = readonly [lon: number, lat: number];

/** Mean Earth radius (IUGG), see gameplay-systems §4. */
export const EARTH_RADIUS_KM = 6371.0088;

const DEG = Math.PI / 180;

/** Great-circle distance in km (haversine). */
export function haversineKm(a: LonLat, b: LonLat, radiusKm = EARTH_RADIUS_KM): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Wraps a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(w, -0) ? 0 : w;
}

/**
 * Quantizes coordinates to a grid (default 0.001° ≈ 110 m) so that client and server
 * compute identical distances from identical stored values.
 */
export function quantize(p: LonLat, quantumDeg = 0.001): LonLat {
  const steps = Math.round(1 / quantumDeg);
  const q = (v: number) => Math.round(v * steps) / steps;
  return [q(wrapLon(p[0])), q(Math.max(-90, Math.min(90, p[1])))];
}

/** Points along the great circle from `from` to `to` (d3-geo interpolation). */
export { geoInterpolate as greatCircle } from 'd3-geo';

/**
 * Where the minor great-circle arc between two points crosses the meridian half-plane at
 * `meridian` (not its antimeridian), or null (gameplay-systems §5). Sampled at 128 steps.
 */
export function meridianCrossing(from: LonLat, to: LonLat, meridian: number): LonLat | null {
  const at = geoInterpolate([from[0], from[1]], [to[0], to[1]]);
  let prev = at(0);
  for (let i = 1; i <= 128; i++) {
    const cur = at(i / 128);
    const a = wrapLon(prev[0] - meridian);
    const b = wrapLon(cur[0] - meridian);
    if (a !== 0 && Math.sign(a) !== Math.sign(b) && Math.abs(a - b) < 90) {
      return at((i - 1 + Math.abs(a) / (Math.abs(a) + Math.abs(b))) / 128);
    }
    prev = cur;
  }
  return null;
}
