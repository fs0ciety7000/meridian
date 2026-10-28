import { describe, expect, it } from 'vitest';
import { Expedition } from '@meridian/content-schema';
import { wrapLon } from '@meridian/geo';
import {
  answerOverlap,
  decodeCode,
  expeditionHash,
  generateExpedition,
  greedyRoute,
  missionDone,
  sha256,
} from '../src/index';
import { deps, factsFile, LIBRARY, PROMPTS } from './fixtures';

const opts = { dataVersion: factsFile.dataVersion };
const SEEDS = Number(process.env.GENERATOR_SEEDS ?? 300);

describe('sha256', () => {
  it('matches the FIPS test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });
});

describe('generateExpedition', () => {
  it('is deterministic and its code decodes to its seed', () => {
    const a = generateExpedition(123456, 'normal', LIBRARY, deps, opts);
    const b = generateExpedition(123456, 'normal', LIBRARY, deps, opts);
    expect(a).toEqual(b);
    expect(decodeCode(a.code)).toEqual({
      source: 'generated',
      seed: 123456,
      difficulty: 'normal',
      libraryVersion: 1,
    });
    expect(a.hash).toBe(expeditionHash(a));
  });

  for (const difficulty of ['easy', 'normal', 'expert'] as const) {
    it(`produces only valid expeditions (${difficulty}, ${SEEDS} seeds)`, () => {
      const categories = new Map<string, number>();
      for (let seed = 0; seed < SEEDS; seed++) {
        const e = generateExpedition(seed * 7919, difficulty, LIBRARY, deps, opts);
        expect(Expedition.safeParse(e).success).toBe(true);
        expect(Math.abs(wrapLon(e.meridianLon - e.start.lonLat[0]))).toBeGreaterThanOrEqual(20);
        const prompts = e.legs.map((l) => PROMPTS.find((p) => p.id === l.promptId)!);
        for (let i = 1; i < 6; i++) {
          if (!prompts[i]!.contextual)
            expect(prompts[i]!.category).not.toBe(prompts[i - 1]!.category);
        }
        const fixed = e.legs.map((l) =>
          PROMPTS.find((p) => p.id === (l.fallback?.promptId ?? l.promptId))!,
        );
        expect(new Set(fixed.map((p) => p.category)).size).toBeGreaterThanOrEqual(4);
        for (let i = 0; i < 6; i++)
          for (let j = i + 1; j < 6; j++)
            expect(
              answerOverlap(fixed[i]!.computed!.validIso3, fixed[j]!.computed!.validIso3),
            ).toBeLessThanOrEqual(0.6);
        for (const p of fixed) {
          const d = p.computed!.difficulty;
          if (difficulty === 'easy') expect(d).toBeLessThanOrEqual(0.45);
          if (difficulty === 'normal') expect(d >= 0.2 && d <= 0.75).toBe(true);
          if (difficulty === 'expert') expect(d).toBeGreaterThanOrEqual(0.5);
        }
        expect(e.missions).toHaveLength({ easy: 1, normal: 2, expert: 3 }[difficulty]);
        for (const m of e.missions) {
          const route = greedyRoute(e, deps, m);
          expect(route && missionDone(m, route, deps)).toBe(true);
        }
        for (const p of fixed) categories.set(p.category, (categories.get(p.category) ?? 0) + 1);
      }
      // Every category appears.
      expect(categories.size).toBe(7);
    });
  }
});
