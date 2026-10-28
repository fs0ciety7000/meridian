import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateExpedition, reduce, type Action, type RunState } from '../src/index';
import { deps, factsFile, LIBRARY } from './fixtures';

const isos = [...deps.entities.keys()];
// CI runs 2 000; the phase gate runs PROPERTY_RUNS=10000 (development-plan, phase 2).
const RUNS = Number(process.env.PROPERTY_RUNS ?? 2_000);

const action = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      type: fc.constant('camp' as const),
      iso: fc.integer({ min: 0, max: isos.length + 3 }),
      dLon: fc.double({ min: -2, max: 2, noNaN: true }),
      dLat: fc.double({ min: -2, max: 2, noNaN: true }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ type: 'spyglass' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('rarity' as const),
      hours: fc.integer({ min: 0, max: 72 }),
    }),
  },
);

function play(
  seed: number,
  steps: { type: string; iso?: number; dLon?: number; dLat?: number; hours?: number }[],
) {
  const exp = generateExpedition(
    seed,
    (['easy', 'normal', 'expert'] as const)[seed % 3]!,
    LIBRARY,
    deps,
    {
      dataVersion: factsFile.dataVersion,
    },
  );
  let state: RunState = reduce(
    null,
    {
      type: 'START',
      runId: 'p',
      expedition: exp,
      mode: 'expedition',
      attempt: 'first',
      locale: 'en',
      now: '2026-01-01T00:00:00Z',
    },
    deps,
  ).state;
  for (const s of steps) {
    let a: Action;
    if (s.type === 'camp') {
      const iso = isos[s.iso!] ?? null; // out-of-range index = sea / unknown
      const at = iso ? deps.entities.get(iso)!.aimPoint : [0, 0];
      a = {
        type: 'CONFIRM_CAMP',
        iso3: iso,
        lonLat: [at[0] + s.dLon!, at[1] + s.dLat!],
        ms: 1,
        provisionalMoves: 0,
        now: '2026-01-01T00:10:00Z',
      };
    } else if (s.type === 'spyglass') a = { type: 'USE_SPYGLASS' };
    else
      a = {
        type: 'APPLY_RARITY',
        snapshot: {
          promptId: exp.legs[0]!.promptId,
          total: 10,
          priorWeight: 200,
          entries: Object.fromEntries(
            isos.slice(0, 50).map((c) => [c, { n: 1, share: 0.02, tier: 'trail' as const }]),
          ),
          computedAt: 'x',
          balanceVersion: 1,
        },
        now: new Date(Date.parse('2026-01-01T00:10:00Z') + s.hours! * 3_600_000).toISOString(),
      };
    state = reduce(state, a, deps).state;
  }
  return state;
}

describe('engine properties', () => {
  it(`never throws, keeps its invariants and is deterministic (${RUNS} random runs)`, () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 30 - 1 }),
        fc.array(action, { maxLength: 14 }),
        (seed, steps) => {
          const a = play(seed, steps);
          expect(play(seed, steps)).toEqual(a);
          expect(a.legs.length).toBeLessThanOrEqual(6);
          expect(new Set(a.usedIso3).size).toBe(a.usedIso3.length);
          expect(a.currentLeg).toBe(a.legs.length + 1);
          for (const l of a.legs) {
            expect(l.distanceKm).toBeGreaterThanOrEqual(0);
            expect(l.distanceKm).toBeLessThanOrEqual(20_016);
            if (!l.valid) expect(l.distanceKm).toBe(0);
          }
          if (a.status === 'completed') {
            expect(a.legs).toHaveLength(6);
            expect(a.score!.renown).toBeGreaterThanOrEqual(a.score!.base);
          }
        },
      ),
      { numRuns: RUNS, seed: 42 },
    );
  }, 600_000);
});
