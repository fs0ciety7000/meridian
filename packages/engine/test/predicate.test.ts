import { describe, expect, it } from 'vitest';
import { evaluate, factsUsed, isContextual, validSet } from '../src/index';
import { deps } from './fixtures';

describe('predicates', () => {
  it('evaluates eq / comparisons / includes / in / boolean combinators', () => {
    expect(evaluate({ fact: 'landlocked', eq: true }, 'BOL', deps)).toBe(true);
    expect(evaluate({ fact: 'landlocked', eq: true }, 'PER', deps)).toBe(false);
    expect(evaluate({ fact: 'highestPointM', gte: 8000 }, 'NPL', deps)).toBe(true);
    expect(evaluate({ fact: 'flagColors', includes: 'red' }, 'JPN', deps)).toBe(true);
    expect(evaluate({ fact: 'continent', in: ['SA', 'AF'] }, 'KEN', deps)).toBe(true);
    expect(evaluate({ fact: 'officialLanguages', in: ['portuguese'] }, 'BRA', deps)).toBe(true);
    expect(
      evaluate(
        { all: [{ fact: 'landlocked', eq: true }, { not: { fact: 'continent', eq: 'AF' } }] },
        'MNG',
        deps,
      ),
    ).toBe(true);
    expect(
      evaluate(
        {
          any: [
            { fact: 'continent', eq: 'OC' },
            { fact: 'continent', eq: 'SA' },
          ],
        },
        'FRA',
        deps,
      ),
    ).toBe(false);
  });

  it('never matches a missing fact or an unknown country', () => {
    expect(evaluate({ fact: 'noSuchFact', eq: true }, 'FRA', deps)).toBe(false);
    expect(evaluate({ fact: 'landlocked', eq: false }, 'XXX', deps)).toBe(false);
  });

  it('computes the answer set of a prompt', () => {
    const eq = validSet({ fact: 'crossesEquator', eq: true }, deps);
    expect(eq).toContain('BRA');
    expect(eq).toContain('KEN');
    expect(eq).not.toContain('FRA');
    expect(validSet({ fact: 'landlocked', eq: true }, deps)).toHaveLength(44);
  });

  it('evaluates context rules against the previous camp and the planted point', () => {
    const ctx = {
      prevIso3: 'FRA',
      prevLonLat: [2.35, 48.86] as const,
      portLonLat: [-9.14, 38.72] as const,
      locale: 'en' as const,
    };
    expect(evaluate({ ctx: { rule: 'neighborOf' } }, 'ESP', deps, ctx)).toBe(true);
    expect(evaluate({ ctx: { rule: 'neighborOf' } }, 'PRT', deps, ctx)).toBe(false);
    expect(evaluate({ ctx: { rule: 'sameContinent' } }, 'DEU', deps, ctx)).toBe(true);
    expect(evaluate({ ctx: { rule: 'otherContinent' } }, 'DEU', deps, ctx)).toBe(false);
    expect(evaluate({ ctx: { rule: 'otherHemisphere', axis: 'NS' } }, 'ARG', deps, ctx)).toBe(true);
    // Point rule: France's Réunion is south of the equator, metropolitan France is not.
    expect(
      evaluate({ ctx: { rule: 'otherHemisphere', axis: 'NS' } }, 'BRA', deps, {
        ...ctx,
        pick: [-60, 2],
      }),
    ).toBe(false);
    expect(
      evaluate({ ctx: { rule: 'closerToPort' } }, 'ESP', deps, { ...ctx, pick: [-3.7, 40.4] }),
    ).toBe(true);
    expect(evaluate({ ctx: { rule: 'sameInitial' } }, 'FIN', deps, ctx)).toBe(true);
    expect(evaluate({ ctx: { rule: 'sameInitial' } }, 'ESP', deps, ctx)).toBe(false);
  });

  it('lists the facts a predicate reads and detects context rules', () => {
    const p = {
      all: [
        { fact: 'a', eq: 1 },
        { not: { any: [{ fact: 'b', gt: 2 }, { ctx: { rule: 'neighborOf' as const } }] } },
      ],
    };
    expect([...factsUsed(p)]).toEqual(['a', 'b']);
    expect(isContextual(p)).toBe(true);
    expect(isContextual({ fact: 'a', eq: 1 })).toBe(false);
  });
});
