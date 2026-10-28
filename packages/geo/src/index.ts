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
 * Quantizes coordinates to a grid (default 0.01° ≈ 1 km) so that client and server
 * compute identical distances from identical stored values.
 */
export function quantize(p: LonLat, quantumDeg = 0.01): LonLat {
  const steps = Math.round(1 / quantumDeg);
  const q = (v: number) => Math.round(v * steps) / steps;
  return [q(wrapLon(p[0])), q(Math.max(-90, Math.min(90, p[1])))];
}
