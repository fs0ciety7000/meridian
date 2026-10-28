import type { Expedition } from '@meridian/content-schema';
import { reduce, type EngineDeps, type RunState, type SharedRoute } from '@meridian/engine';
import type { GeoData } from '../map/geodata';
import { loadDetailLayer } from '../map/loadGeoData';
import { resolvePick } from '../map/pick';

/**
 * Replays a friend's shared route through the engine (data-model §8): countries are re-derived
 * from the points on the detailed geometry, and the score is recomputed, never trusted.
 */
export async function replayShared(
  shared: SharedRoute,
  expedition: Expedition,
  geo: GeoData,
  deps: EngineDeps,
): Promise<RunState> {
  geo.layers['50m'] ??= await loadDetailLayer();
  const at = new Date(0).toISOString();
  let state = reduce(
    null,
    {
      type: 'START',
      runId: 'friend',
      expedition,
      mode: 'challenge',
      attempt: 'replay',
      locale: 'en',
      now: at,
    },
    deps,
  ).state;
  for (const p of shared.picks.slice(0, 6)) {
    const pick = resolvePick(geo, p);
    const r = reduce(
      state,
      {
        type: 'CONFIRM_CAMP',
        lonLat: pick.lonLat,
        iso3: pick.kind === 'unplantable' ? pick.unitId : pick.entity,
        ms: 0,
        provisionalMoves: 0,
        now: at,
      },
      deps,
    );
    // A refused camp (sea, duplicate) means a forged code: keep what is valid so far.
    if (r.events.some((e) => e.type === 'CAMP_REFUSED')) break;
    state = r.state;
  }
  return state;
}
