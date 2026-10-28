import { describe, expect, it } from 'vitest';
import { ExpeditionCode, Predicate, PromptDef } from '../src/index';

describe('Predicate', () => {
  it('accepts nested declarative predicates', () => {
    const p = {
      all: [
        { fact: 'landlocked', eq: true },
        { not: { fact: 'continent', in: ['EU'] } },
        { fact: 'areaKm2', gte: 100000 },
      ],
    };
    expect(Predicate.safeParse(p).success).toBe(true);
  });

  it('accepts contextual rules', () => {
    expect(Predicate.safeParse({ ctx: { rule: 'otherHemisphere', axis: 'NS' } }).success).toBe(
      true,
    );
  });

  it('rejects code-like or empty predicates', () => {
    expect(Predicate.safeParse({ fact: 'areaKm2' }).success).toBe(false);
    expect(Predicate.safeParse({ all: [] }).success).toBe(false);
    expect(Predicate.safeParse({ fact: 'x', eq: true, extra: 1 }).success).toBe(false);
  });
});

describe('PromptDef', () => {
  it('requires both languages and a namespaced id', () => {
    const base = {
      id: 'water.landlocked',
      category: 'water',
      text: { fr: 'Un pays enclavé', en: 'A landlocked country' },
      explain: { fr: 'Il a un littoral.', en: 'It has a coastline.' },
      predicate: { fact: 'landlocked', eq: true },
    };
    expect(PromptDef.safeParse(base).success).toBe(true);
    expect(PromptDef.safeParse({ ...base, id: 'landlocked' }).success).toBe(false);
    expect(PromptDef.safeParse({ ...base, text: { fr: 'x' } }).success).toBe(false);
  });
});

describe('ExpeditionCode', () => {
  it.each(['MER-0001', 'MER-7KQ2N', 'MER-ABCDEFGH9'])('accepts %s', (c) =>
    expect(ExpeditionCode.safeParse(c).success).toBe(true),
  );
  it.each(['MER-01', 'mer-0001', 'MER-IL00', 'XYZ-0001'])('rejects %s', (c) =>
    expect(ExpeditionCode.safeParse(c).success).toBe(false),
  );
});
