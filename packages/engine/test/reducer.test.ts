import { describe, expect, it } from 'vitest';
import type { Expedition } from '@meridian/content-schema';
import {
  BALANCE,
  computeRarity,
  dryInk,
  expeditionHash,
  freezeLeg,
  reduce,
  type Action,
  type EngineEvent,
  type RunState,
} from '../src/index';
import { deps, PORTS, PROMPTS } from './fixtures';

const byId = (id: string) => PROMPTS.find((p) => p.id === id)!;

function expedition(over: Partial<Expedition> = {}): Expedition {
  const legs = [
    'water.landlocked',
    'flag.green',
    'borders.many',
    'climate.southern',
    'society.left',
    'position.equator',
  ].map((id, i) => freezeLeg(i + 1, byId(id)));
  const e = {
    code: 'MER-0001',
    source: 'catalog' as const,
    catalogNumber: 1,
    difficulty: 'normal' as const,
    libraryVersion: 1,
    start: PORTS[0]!, // Lisbon
    meridianLon: 30,
    legs,
    missions: [
      { id: 'noFalseTrail' as const },
      { id: 'continentHopper' as const, params: { n: 3 } },
    ],
    dataVersion: 'test',
    ...over,
  };
  return { ...e, hash: expeditionHash(e) };
}

function run(actions: Action[], exp = expedition()) {
  let state: RunState | null = null;
  const events: EngineEvent[] = [];
  for (const a of [
    {
      type: 'START',
      runId: 'r1',
      expedition: exp,
      mode: 'expedition',
      attempt: 'first',
      locale: 'fr',
      now: '2026-10-28T10:00:00Z',
    } as Action,
    ...actions,
  ]) {
    const r = reduce(state, a, deps);
    state = r.state;
    events.push(...r.events);
  }
  return { state: state!, events };
}

const camp = (
  iso3: string | null,
  lonLat: [number, number],
  now = '2026-10-28T10:05:00Z',
): Action => ({
  type: 'CONFIRM_CAMP',
  iso3,
  lonLat,
  ms: 1000,
  provisionalMoves: 1,
  now,
});

// A perfect route: Mongolia, Brazil, China, Australia, Japan, Kenya.
const PERFECT: Action[] = [
  camp('MNG', [104.9, 47.9]),
  camp('BRA', [-47.9, -15.8]),
  camp('CHN', [116.4, 39.9]),
  camp('AUS', [149.1, -35.3]),
  camp('JPN', [139.7, 35.7]),
  camp('KEN', [36.8, -1.3]),
];

describe('reduce', () => {
  it('plays a perfect expedition: distance, meridian, missions and renown', () => {
    const { state, events } = run(PERFECT);
    expect(state.status).toBe('completed');
    expect(state.legs.every((l) => l.valid)).toBe(true);
    const total = state.legs.reduce((t, l) => t + l.distanceKm, 0);
    expect(state.score!.distanceKm).toBe(Math.round(total));
    // Lisbon → Mongolia crosses 30° E; Mongolia → Brazil crosses back.
    expect(state.legs[0]!.meridianCrossed).toBe(true);
    expect(events.filter((e) => e.type === 'MERIDIAN_CROSSED').length).toBeGreaterThanOrEqual(2);
    expect(state.score!.meridian).toBe(2 * BALANCE.meridianBonus);
    expect(state.missions).toEqual([
      { id: 'noFalseTrail', done: true },
      { id: 'continentHopper', done: true },
    ]);
    const { base, meridian, missions, renown } = state.score!;
    expect(Math.abs(renown - (base + meridian + missions))).toBeLessThanOrEqual(1);
    expect(missions).toBeCloseTo(base * 0.1, -1);
    expect(events.at(-1)!.type).toBe('EXPEDITION_COMPLETED');
  });

  it('quantizes the planted point to 0.001°', () => {
    const { state } = run([camp('MNG', [104.91234, 47.90049])]);
    expect(state.legs[0]!.pick.lonLat).toEqual([104.912, 47.9]);
    expect(state.camp).toEqual([104.912, 47.9]);
  });

  it('a false trail scores 0, keeps the camp and consumes the country', () => {
    const { state, events } = run([camp('PER', [-77, -12])]);
    expect(state.legs[0]).toMatchObject({ valid: false, distanceKm: 0 });
    expect(state.camp).toEqual(PORTS[0]!.lonLat);
    expect(state.usedIso3).toEqual(['PER']);
    expect(state.currentLeg).toBe(2);
    expect(events).toContainEqual({
      type: 'FALSE_TRAIL',
      leg: 1,
      iso3: 'PER',
      promptId: 'water.landlocked',
    });
  });

  it('refuses without penalty: sea, disputed, already used', () => {
    const { state, events } = run([
      camp(null, [-30, 30]),
      camp('TWN', [121, 24]),
      camp('MNG', [104.9, 47.9]),
      camp('MNG', [100, 46]),
    ]);
    expect(events.filter((e) => e.type === 'CAMP_REFUSED')).toEqual([
      { type: 'CAMP_REFUSED', reason: 'not_playable' },
      { type: 'CAMP_REFUSED', reason: 'disputed' },
      { type: 'CAMP_REFUSED', reason: 'already_used' },
    ]);
    expect(state.currentLeg).toBe(2);
    expect(state.legs).toHaveLength(1);
  });

  it('estimates the tier from the salience prior; the spyglass caps it at frontier', () => {
    const { state } = run([camp('MNG', [104.9, 47.9])]);
    expect(state.legs[0]!.rarity!.status).toBe('estimated');

    // The least salient landlocked country is incognita without the spyglass…
    const prior = computeRarity(
      'water.landlocked',
      byId('water.landlocked').computed!.validIso3,
      (c) => deps.facts.get(c)!.salience,
      {},
      BALANCE,
      'now',
    );
    const rarest = Object.entries(prior.entries).find(([, e]) => e.tier === 'incognita')![0];
    const at = deps.entities.get(rarest)!.aimPoint as [number, number];
    expect(run([camp(rarest, at)]).state.legs[0]!.rarity!.tier).toBe('incognita');
    // …and frontier with it.
    const spy = run([{ type: 'USE_SPYGLASS' }, camp(rarest, at)]);
    expect(spy.state.legs[0]!.rarity!.tier).toBe('frontier');
    expect(spy.events.find((e) => e.type === 'SPYGLASS_USED')).toMatchObject({ leg: 1 });
  });

  it('limits the spyglass to its allowance (normal: 1)', () => {
    const { events } = run([
      { type: 'USE_SPYGLASS' },
      camp('MNG', [104.9, 47.9]),
      { type: 'USE_SPYGLASS' },
    ]);
    expect(events.filter((e) => e.type === 'SPYGLASS_REFUSED')).toHaveLength(1);
  });

  it('dries the ink: provisional within 24 h, frozen after', () => {
    const played = run(PERFECT);
    const snapshot = computeRarity(
      'water.landlocked',
      byId('water.landlocked').computed!.validIso3,
      () => 0.5,
      { MNG: 0, BOL: 500 },
      BALANCE,
      'later',
    );
    const early = reduce(
      played.state,
      { type: 'APPLY_RARITY', snapshot, now: '2026-10-28T20:00:00Z' },
      deps,
    );
    expect(early.state.legs[0]!.rarity!.status).toBe('provisional');
    expect(early.state.score!.final).toBe(false);
    const late = reduce(
      early.state,
      { type: 'APPLY_RARITY', snapshot, now: '2026-10-29T10:06:00Z' },
      deps,
    );
    expect(late.state.legs[0]!.rarity!.status).toBe('frozen');
    // Mongolia is rare once Bolivia dominates the counts.
    expect(late.state.legs[0]!.rarity!.tier).not.toBe('known');
    // Frozen stamps never move again.
    const again = reduce(
      late.state,
      {
        type: 'APPLY_RARITY',
        snapshot: { ...snapshot, entries: { MNG: { n: 9, share: 0.9, tier: 'known' } } },
        now: '2026-10-30T00:00:00Z',
      },
      deps,
    );
    expect(again.state).toBe(late.state);
  });

  it('dries the ink offline from the prior after 24 h', () => {
    const { state } = run(PERFECT);
    expect(dryInk(state, deps, '2026-10-28T20:00:00Z').state).toBe(state);
    const dry = dryInk(state, deps, '2026-10-29T11:00:00Z').state;
    expect(dry.legs.every((l) => l.rarity!.status === 'frozen')).toBe(true);
    expect(dry.score!.final).toBe(true);
  });

  it('abandoning ends the run with the legs played so far', () => {
    const { state, events } = run([
      camp('MNG', [104.9, 47.9]),
      { type: 'ABANDON', now: '2026-10-28T11:00:00Z' },
    ]);
    expect(state.status).toBe('abandoned');
    expect(events.at(-1)!.type).toBe('EXPEDITION_ABANDONED');
    expect(reduce(state, camp('BRA', [-47.9, -15.8]), deps).events).toEqual([
      { type: 'CAMP_REFUSED', reason: 'finished' },
    ]);
  });

  it('a contextual leg falls back when the previous camp leaves too few answers', () => {
    const exp = expedition();
    exp.legs[1] = freezeLeg(2, byId('ctx.neighbour'), byId('flag.green'));
    // From an island (Japan has no land neighbour) the neighbour rule has no answer.
    const fromIsland = run([camp('JPN', [139.7, 35.7]), camp('KEN', [36.8, -1.3])], {
      ...exp,
      legs: [freezeLeg(1, byId('borders.island')), ...exp.legs.slice(1)],
    });
    expect(fromIsland.state.legs[1]).toMatchObject({
      usedFallback: true,
      promptId: 'flag.green',
      valid: true,
    });
    // Mongolia has only two neighbours: fallback too.
    expect(
      run([camp('MNG', [104.9, 47.9]), camp('KEN', [36.8, -1.3])], exp).state.legs[1]!.usedFallback,
    ).toBe(true);
    // From Austria (8 neighbours) it applies: Germany is a neighbour, Brazil is not.
    const fromAustria = run([camp('AUT', [16.37, 48.21]), camp('DEU', [13.4, 52.52])], exp);
    expect(fromAustria.state.legs[1]).toMatchObject({
      usedFallback: false,
      valid: true,
      contextKey: 'AUT',
      promptId: 'ctx.neighbour',
    });
    expect(
      run([camp('AUT', [16.37, 48.21]), camp('BRA', [-47.9, -15.8])], exp).state.legs[1]!.valid,
    ).toBe(false);
  });

  it('replays award no stamp events', () => {
    let state = reduce(
      null,
      {
        type: 'START',
        runId: 'r2',
        expedition: expedition(),
        mode: 'expedition',
        attempt: 'replay',
        locale: 'en',
        now: '2026-10-28T10:00:00Z',
      },
      deps,
    ).state;
    const r = reduce(state, camp('MNG', [104.9, 47.9]), deps);
    state = r.state;
    expect(r.events.some((e) => e.type === 'STAMP_AWARDED')).toBe(false);
    expect(state.legs[0]!.valid).toBe(true);
  });

  it('is pure: the previous state is never mutated', () => {
    const { state } = run([]);
    const before = JSON.stringify(state);
    reduce(state, camp('MNG', [104.9, 47.9]), deps);
    expect(JSON.stringify(state)).toBe(before);
  });
});
