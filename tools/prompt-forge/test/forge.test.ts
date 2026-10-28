import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntitiesFile, FactsFile, PromptDef } from '@meridian/content-schema';
import { BALANCE, type EngineDeps } from '@meridian/engine';
import { forge, promptDifficulty, type ForgeInput } from '../src/forge';

const root = resolve(import.meta.dirname, '../../..');
const facts = JSON.parse(
  readFileSync(resolve(root, 'content/facts/facts.json'), 'utf8'),
) as FactsFile;
const { entities } = JSON.parse(
  readFileSync(resolve(root, 'content/geo/entities.json'), 'utf8'),
) as EntitiesFile;
const deps: EngineDeps = {
  facts: new Map(facts.countries.map((c) => [c.iso3, c])),
  entities: new Map(entities.map((e) => [e.iso3, e])),
  balance: BALANCE,
};
const t = (s: string) => ({ fr: s, en: s });
const p = (
  id: string,
  category: PromptDef['category'],
  predicate: PromptDef['predicate'],
  extra: Partial<PromptDef> = {},
): PromptDef => ({
  id,
  category,
  text: t(id),
  explain: t(id),
  predicate,
  ...extra,
});

const base: ForgeInput = {
  libraryVersion: 1,
  dataVersion: facts.dataVersion,
  defs: facts.defs,
  prompts: [],
  ports: [{ id: 'lisbon', name: t('Lisbon'), iso3: 'PRT', lonLat: [-9.139, 38.722] }],
  catalog: [],
  deps,
};
const issuesOf = (prompts: PromptDef[]) => forge({ ...base, prompts }).issues.map((i) => i.message);

describe('prompt-forge', () => {
  it('computes answer sets, continents and difficulty', () => {
    const out = forge({
      ...base,
      prompts: [p('water.landlocked', 'water', { fact: 'landlocked', eq: true })],
    });
    expect(out.issues).toEqual([]);
    const c = out.library.prompts[0]!.computed!;
    expect(c.validCount).toBe(44);
    expect(c.continents).toBeGreaterThanOrEqual(4);
    expect(c.difficulty).toBeGreaterThan(0);
    expect(c.difficulty).toBeLessThan(1);
  });

  it('rejects too few or too many answers, and too few continents', () => {
    expect(
      issuesOf([p('relief.everest', 'relief', { fact: 'highestPointM', gte: 8000 })]).join(),
    ).toMatch(/outside \[8, 60\]/);
    expect(
      issuesOf([p('position.east', 'position', { fact: 'hemisphereEW', eq: 'E' })]).join(),
    ).toMatch(/outside \[8, 60\]/);
    const europe = { fact: 'memberOf', includes: 'eu' } as const;
    expect(issuesOf([p('society.eu', 'society', europe)]).join()).toMatch(/continents/);
    expect(issuesOf([p('society.eu', 'society', europe, { regional: ['EU', 'AS'] })])).toEqual([]);
  });

  it('rejects unknown facts', () => {
    expect(issuesOf([p('relief.x', 'relief', { fact: 'nope', eq: true })]).join()).toMatch(
      /unknown fact/,
    );
  });

  it('rejects prompts whose answers change with overseas territories', () => {
    // France reaches both hemispheres only through its overseas parts.
    const msgs = issuesOf([p('position.both', 'position', { fact: 'hemisphereNS', eq: 'both' })]);
    expect(msgs.join()).toMatch(/ambiguous.*FRA/);
    // …whereas a territory-sensitive fact is fine when no answer depends on overseas parts.
    expect(
      issuesOf([p('position.tropic', 'position', { fact: 'crossesTropicOfCapricorn', eq: true })]),
    ).toEqual([]);
  });

  it('checks contextual prompts are declared as such', () => {
    expect(
      issuesOf([p('borders.next', 'borders', { ctx: { rule: 'neighborOf' } })]).join(),
    ).toMatch(/ctx rule in a non-contextual/);
    expect(
      issuesOf([
        p('borders.next', 'borders', { ctx: { rule: 'neighborOf' } }, { contextual: true }),
      ]),
    ).toEqual([]);
  });

  it('freezes catalogue entries and checks missions', () => {
    const prompts = [
      p('water.landlocked', 'water', { fact: 'landlocked', eq: true }),
      p('flag.black', 'flag', { fact: 'flagColors', includes: 'black' }),
      p('borders.many', 'borders', { fact: 'landBorders', gte: 6 }),
      p('climate.tropic', 'climate', { fact: 'crossesTropicOfCapricorn', eq: true }),
      p('society.left', 'society', { fact: 'drivesOnLeft', eq: true }),
      p('position.south', 'position', { fact: 'hemisphereNS', eq: 'S' }),
    ];
    const entry = {
      catalogNumber: 1,
      title: t('Test'),
      difficulty: 'normal' as const,
      start: 'lisbon',
      meridianLon: 30,
      legs: prompts.map((x) => x.id),
      missions: [{ id: 'meridianWeaver' as const }],
    };
    const ok = forge({ ...base, prompts, catalog: [entry] });
    expect(
      ok.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`),
    ).toEqual([]);
    expect(ok.expeditions[0]!.code).toBe('MER-0001');
    expect(ok.expeditions[0]!.legs[3]!.predicate).toEqual({
      fact: 'crossesTropicOfCapricorn',
      eq: true,
    });

    const bad = forge({
      ...base,
      prompts,
      catalog: [
        {
          ...entry,
          legs: ['water.landlocked', 'water.landlocked', ...entry.legs.slice(2)],
          missions: [{ id: 'northernSoul' as const }],
        },
      ],
    });
    const msgs = bad.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/share the category/);
    expect(msgs).toMatch(/northernSoul/);
  });

  it('rates fewer and less famous answers as harder', () => {
    const famous = ['USA', 'CHN', 'FRA', 'BRA', 'IND', 'RUS', 'JPN', 'DEU'];
    const obscure = ['TUV', 'NRU', 'PLW', 'KIR', 'MHL', 'FSM', 'VUT', 'SLB'];
    expect(promptDifficulty(obscure, deps)).toBeGreaterThan(promptDifficulty(famous, deps));
  });
});
