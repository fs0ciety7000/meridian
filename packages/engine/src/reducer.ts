import { haversineKm, meridianCrossing, quantize, type LonLat } from '@meridian/geo';
import { isContextual, evaluate, validSet } from './predicate';
import { capTier, computeRarity } from './rarity';
import { meridianCrossings, missionDone, type RouteView } from './missions';
import {
  TIERS,
  type Action,
  type ActiveLeg,
  type EngineDeps,
  type EngineEvent,
  type LegContext,
  type LegResult,
  type RarityStatus,
  type RunScore,
  type RunState,
} from './types';

/** Context rules need at least this many unused answers, otherwise the leg falls back (§7.1). */
export const CONTEXT_MIN_ANSWERS = 3;

export function legContext(state: RunState): LegContext {
  return {
    prevIso3: state.campIso3,
    prevLonLat: state.camp,
    portLonLat: state.expedition.start.lonLat,
    locale: state.locale,
  };
}

/** The prompt in force for the current leg: contextual legs fall back when they have no answer. */
export function activeLeg(state: RunState, deps: EngineDeps): ActiveLeg {
  const index = Math.min(state.currentLeg, 6);
  const leg = state.expedition.legs[index - 1]!;
  const contextual = isContextual(leg.predicate);
  if (contextual && leg.fallback) {
    const answers = validSet(leg.predicate, deps, legContext(state)).filter(
      (c) => !state.usedIso3.includes(c),
    );
    if (answers.length < CONTEXT_MIN_ANSWERS)
      return { def: leg.fallback, index, usedFallback: true, contextual: false };
  }
  return { def: leg, index, usedFallback: false, contextual };
}

/** Unused valid answers of the current leg, country-level (spyglass, tests). */
export function remainingAnswers(state: RunState, deps: EngineDeps): string[] {
  const { def } = activeLeg(state, deps);
  return validSet(def.predicate, deps, legContext(state)).filter(
    (c) => !state.usedIso3.includes(c),
  );
}

export function spyglassAllowance(state: RunState, deps: EngineDeps): number {
  return deps.balance.spyglassPerExpedition[state.expedition.difficulty];
}

export function routeOf(state: RunState): RouteView {
  return {
    port: { lonLat: state.expedition.start.lonLat, iso3: state.expedition.start.iso3 },
    legs: state.legs.map((l) => ({ ...l.pick, valid: l.valid, distanceKm: l.distanceKm })),
    meridianLon: state.expedition.meridianLon,
  };
}

export function scoreOf(state: RunState, deps: EngineDeps): RunScore {
  const b = deps.balance;
  const tiers = Object.fromEntries(TIERS.map((t) => [t, 0])) as RunScore['tiers'];
  let base = 0;
  let distanceKm = 0;
  for (const l of state.legs) {
    if (!l.valid) continue;
    const tier = l.rarity?.tier ?? 'known';
    tiers[tier]++;
    distanceKm += l.distanceKm;
    base += l.distanceKm * b.tierMultipliers[tier];
  }
  const meridian =
    Math.min(meridianCrossings(routeOf(state)), b.meridianMaxCount) * b.meridianBonus;
  const missions = base * b.missionBonusRate * state.missions.filter((m) => m.done).length;
  return {
    distanceKm: Math.round(distanceKm),
    base: Math.round(base),
    meridian,
    missions: Math.round(missions),
    renown: Math.round(base + meridian + missions),
    tiers,
    final: state.legs.every((l) => !l.valid || l.rarity?.status === 'frozen'),
  };
}

const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;

/**
 * The rules engine (data-model §5.2): pure, deterministic, no clock and no network — time comes
 * in through actions, content through `deps`.
 */
export function reduce(
  state: RunState | null,
  action: Action,
  deps: EngineDeps,
): { state: RunState; events: EngineEvent[] } {
  if (action.type === 'START') {
    const e = action.expedition;
    return {
      state: {
        schema: 1,
        runId: action.runId,
        mode: action.mode,
        expedition: e,
        attempt: action.attempt,
        ...(action.challengeFrom ? { challengeFrom: action.challengeFrom } : {}),
        balanceVersion: deps.balance.version,
        locale: action.locale,
        status: 'in_progress',
        currentLeg: 1,
        camp: e.start.lonLat,
        campIso3: e.start.iso3,
        usedIso3: [],
        spyglassLegs: [],
        legs: [],
        missions: e.missions.map((m) => ({ id: m.id, done: false })),
        startedAt: action.now,
      },
      events: [],
    };
  }
  if (!state) throw new Error(`${action.type} before START`);
  const b = deps.balance;

  switch (action.type) {
    case 'CONFIRM_CAMP': {
      if (state.status !== 'in_progress')
        return { state, events: [{ type: 'CAMP_REFUSED', reason: 'finished' }] };
      const iso3 = action.iso3;
      if (!iso3 || !deps.entities.has(iso3)) {
        const reason = iso3 && deps.unplantable?.has(iso3) ? 'disputed' : 'not_playable';
        return { state, events: [{ type: 'CAMP_REFUSED', reason }] };
      }
      if (state.usedIso3.includes(iso3))
        return { state, events: [{ type: 'CAMP_REFUSED', reason: 'already_used' }] };

      const at = quantize(action.lonLat, b.coordQuantumDeg);
      const active = activeLeg(state, deps);
      const ctx = legContext(state);
      const valid = evaluate(active.def.predicate, iso3, deps, { ...ctx, pick: at });
      const spyglass = state.spyglassLegs.includes(active.index);
      const events: EngineEvent[] = [];
      const result: LegResult = {
        leg: active.index,
        promptId: active.def.promptId,
        pick: { lonLat: at, iso3 },
        valid,
        distanceKm: 0,
        meridianCrossed: false,
        ...(active.contextual ? { contextKey: ctx.prevIso3 } : {}),
        usedFallback: active.usedFallback,
        spyglass,
        provisionalMoves: action.provisionalMoves,
        ms: action.ms,
        at: action.now,
      };
      let next: RunState = { ...state, usedIso3: [...state.usedIso3, iso3] };
      if (valid) {
        result.distanceKm = haversineKm(state.camp, at);
        const crossing = meridianCrossing(state.camp, at, state.expedition.meridianLon);
        result.meridianCrossed = !!crossing;
        // Estimated tier: the prior alone until a snapshot arrives (§6.3–6.4).
        const prior = computeRarity(
          active.def.promptId,
          validSet(active.def.predicate, deps, ctx),
          (c) => deps.facts.get(c)?.salience ?? 0,
          {},
          b,
          action.now,
        );
        const entry = prior.entries[iso3] ?? { share: 0, tier: 'incognita' as const };
        const tier = spyglass ? capTier(entry.tier, b.spyglassTierCap) : entry.tier;
        result.rarity = { tier, share: entry.share, status: 'estimated' };
        next = { ...next, camp: at, campIso3: iso3 };
        events.push({
          type: 'CAMP_PLANTED',
          leg: active.index,
          iso3,
          distanceKm: result.distanceKm,
        });
        if (crossing)
          events.push({
            type: 'MERIDIAN_CROSSED',
            leg: active.index,
            at: crossing as [number, number],
          });
        if (state.attempt === 'first')
          events.push({
            type: 'STAMP_AWARDED',
            leg: active.index,
            iso3,
            tier,
            status: 'estimated',
          });
      } else {
        events.push({
          type: 'FALSE_TRAIL',
          leg: active.index,
          iso3,
          promptId: active.def.promptId,
        });
      }
      next = { ...next, legs: [...state.legs, result], currentLeg: state.currentLeg + 1 };
      if (next.currentLeg > b.legsPerExpedition) {
        const route = routeOf(next);
        next = {
          ...next,
          status: 'completed',
          finishedAt: action.now,
          missions: state.expedition.missions.map((m) => ({
            id: m.id,
            done: missionDone(m, route, deps),
          })),
        };
        for (const m of next.missions)
          if (m.done) events.push({ type: 'MISSION_COMPLETED', id: m.id });
        next.score = scoreOf(next, deps);
        events.push({ type: 'EXPEDITION_COMPLETED', score: next.score });
      }
      return { state: next, events };
    }

    case 'USE_SPYGLASS': {
      const index = state.currentLeg;
      if (
        state.status !== 'in_progress' ||
        state.spyglassLegs.includes(index) ||
        state.spyglassLegs.length >= spyglassAllowance(state, deps)
      )
        return { state, events: [{ type: 'SPYGLASS_REFUSED' }] };
      const subregions = [
        ...new Set(remainingAnswers(state, deps).map((c) => deps.entities.get(c)!.subregionM49)),
      ].sort();
      return {
        state: { ...state, spyglassLegs: [...state.spyglassLegs, index] },
        events: [{ type: 'SPYGLASS_USED', leg: index, subregions }],
      };
    }

    case 'APPLY_RARITY': {
      const s = action.snapshot;
      const events: EngineEvent[] = [];
      const legs = state.legs.map((l) => {
        if (!l.valid || !l.rarity || l.rarity.status === 'frozen' || l.promptId !== s.promptId)
          return l;
        if ((s.contextKey ?? null) !== (l.contextKey ?? null)) return l;
        const entry = s.entries[l.pick.iso3];
        if (!entry) return l;
        const tier = l.spyglass ? capTier(entry.tier, b.spyglassTierCap) : entry.tier;
        const status: RarityStatus =
          hoursBetween(l.at, action.now) >= b.inkDryHours ? 'frozen' : 'provisional';
        if (tier === l.rarity.tier && status === l.rarity.status) return l;
        if (state.attempt === 'first')
          events.push({
            type: 'STAMP_UPDATED',
            leg: l.leg,
            iso3: l.pick.iso3,
            from: l.rarity.tier,
            to: tier,
            status,
          });
        return { ...l, rarity: { tier, share: entry.share, status } };
      });
      if (!events.length && legs.every((l, i) => l === state.legs[i])) return { state, events };
      const next = { ...state, legs };
      if (next.status !== 'in_progress') next.score = scoreOf(next, deps);
      return { state: next, events };
    }

    case 'ABANDON': {
      if (state.status !== 'in_progress') return { state, events: [] };
      const next: RunState = { ...state, status: 'abandoned', finishedAt: action.now };
      next.score = scoreOf(next, deps);
      return { state: next, events: [{ type: 'EXPEDITION_ABANDONED', score: next.score }] };
    }
  }
}

/**
 * Offline ink drying (§6.4): without a rarity server, every stamp is re-estimated from the
 * salience prior and frozen once `inkDryHours` have passed since it was played.
 */
export function dryInk(
  state: RunState,
  deps: EngineDeps,
  now: string,
): { state: RunState; events: EngineEvent[] } {
  let current = state;
  const events: EngineEvent[] = [];
  let camp: { iso3: string; lonLat: LonLat } = {
    iso3: state.expedition.start.iso3,
    lonLat: state.expedition.start.lonLat,
  };
  for (const l of state.legs) {
    const leg = state.expedition.legs[l.leg - 1]!;
    const def = l.usedFallback && leg.fallback ? leg.fallback : leg;
    if (
      l.valid &&
      l.rarity &&
      l.rarity.status !== 'frozen' &&
      hoursBetween(l.at, now) >= deps.balance.inkDryHours
    ) {
      const ctx: LegContext = {
        prevIso3: camp.iso3,
        prevLonLat: camp.lonLat,
        portLonLat: state.expedition.start.lonLat,
        locale: state.locale,
      };
      const snapshot = computeRarity(
        def.promptId,
        validSet(def.predicate, deps, ctx),
        (c) => deps.facts.get(c)?.salience ?? 0,
        {},
        deps.balance,
        now,
        l.contextKey,
      );
      if (!snapshot.entries[l.pick.iso3])
        snapshot.entries[l.pick.iso3] = { n: 0, share: 0, tier: 'incognita' };
      const r = reduce(current, { type: 'APPLY_RARITY', snapshot, now }, deps);
      current = r.state;
      events.push(...r.events);
    }
    if (l.valid) camp = l.pick;
  }
  return { state: current, events };
}
