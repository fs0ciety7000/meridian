import type { MissionDef } from '@meridian/content-schema';
import { meridianCrossing, type LonLat } from '@meridian/geo';
import type { EngineDeps } from './types';

/** A route as the missions see it: the port then every leg (valid or not). */
export interface RouteView {
  port: { lonLat: LonLat; iso3: string };
  legs: { lonLat: LonLat; iso3: string; valid: boolean; distanceKm: number }[];
  meridianLon: number;
}

/** Default parameters, by difficulty, for missions that take one (gameplay-systems §8.1). */
// QA phase 2: with [2, 3, 4] and [5 000, 7 000, 9 000] km, 92 % and 97 % of simulated players
// fulfilled the order without aiming for it (median longest leg 14 347 km).
export const MISSION_PARAMS = {
  continentHopper: { n: [4, 5, 5] },
  longHaul: { km: [12000, 14000, 16000] },
} as const;

export function meridianCrossings(route: RouteView): number {
  let n = 0;
  let camp = route.port.lonLat;
  for (const l of route.legs) {
    if (!l.valid) continue;
    if (meridianCrossing(camp, l.lonLat, route.meridianLon)) n++;
    camp = l.lonLat;
  }
  return n;
}

/** Whether a mission order is fulfilled by a finished route (§8.1). */
export function missionDone(m: MissionDef, route: RouteView, deps: EngineDeps): boolean {
  const valid = route.legs.filter((l) => l.valid);
  const camps = [route.port, ...valid];
  switch (m.id) {
    case 'continentHopper': {
      const n = m.params?.n ?? 3;
      let hops = 0;
      for (let i = 1; i < camps.length; i++) {
        const a = deps.entities.get(camps[i - 1]!.iso3)?.continent;
        const b = deps.entities.get(camps[i]!.iso3)?.continent;
        if (a && b && a !== b) hops++;
      }
      return hops >= n;
    }
    case 'equatorShuttle': {
      // A minor arc between two points crosses the equator iff their latitudes differ in sign.
      let n = 0;
      for (let i = 1; i < camps.length; i++)
        if (Math.sign(camps[i - 1]!.lonLat[1]) * Math.sign(camps[i]!.lonLat[1]) < 0) n++;
      return n >= 2;
    }
    case 'southernSoul':
      return valid.length > 0 && valid.every((l) => l.lonLat[1] < 0);
    case 'northernSoul':
      return valid.length > 0 && valid.every((l) => l.lonLat[1] > 0);
    case 'longHaul':
      return valid.some((l) => l.distanceKm >= (m.params?.km ?? 7000));
    case 'noFalseTrail':
      return route.legs.length === 6 && route.legs.every((l) => l.valid);
    case 'meridianWeaver':
      return meridianCrossings(route) >= 2;
  }
}
