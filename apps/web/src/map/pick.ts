import { quantize, type LonLat } from '@meridian/geo';
import { geoContains } from 'd3-geo';
import { inBounds, type GeoData, type GeoUnit } from './geodata';

export type PickKind = 'playable' | 'territory' | 'unplantable' | 'sea';

export interface PickResult {
  /** Quantized to BALANCE.coordQuantumDeg (0.001°): what the engine will validate and store. */
  lonLat: [number, number];
  unitId: string | null;
  /** Playable entity the point counts for (territories resolve to their sovereign). */
  entity: string | null;
  kind: PickKind;
}

const contains = (unit: GeoUnit, p: LonLat) =>
  inBounds(p, unit.bounds) && geoContains(unit.geometry, [p[0], p[1]]);

/**
 * Resolves a point to the unit it lies in (architecture §4.4, level 3: the only result sent
 * to the game engine). Micro-states are validated on 10m geometry only, everything else on
 * 50m (110m until 50m is loaded). The point is quantized first, so the client validates the
 * exact coordinates the server will replay.
 */
export function resolvePick(data: GeoData, raw: LonLat): PickResult {
  const lonLat = quantize(raw) as [number, number];
  const micro = data.micro.units.find((u) => contains(u, lonLat));
  const hit =
    micro ??
    (data.layers['50m'] ?? data.layers['110m']).units.find(
      (u) => !(u.entity && data.entities.get(u.entity)?.isMicroState) && contains(u, lonLat),
    );
  if (!hit) return { lonLat, unitId: null, entity: null, kind: 'sea' };
  return { lonLat, unitId: hit.id, entity: hit.entity, kind: hit.kind };
}
