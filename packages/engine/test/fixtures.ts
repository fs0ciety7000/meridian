import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  EntitiesFile,
  FactsFile,
  Port,
  Predicate,
  PromptCategory,
  PromptDef,
} from '@meridian/content-schema';
import { BALANCE, validSet, type EngineDeps, type GeneratorLibrary } from '../src/index';

const root = resolve(import.meta.dirname, '../../..');
const json = <T>(p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as T;

export const factsFile = json<FactsFile>('content/facts/facts.json');
const entitiesFile = json<EntitiesFile>('content/geo/entities.json');

const NAMES: Record<string, string> = { FRA: 'France', FIN: 'Finland', FJI: 'Fiji', ESP: 'Spain' };

export const deps: EngineDeps = {
  facts: new Map(factsFile.countries.map((c) => [c.iso3, c])),
  entities: new Map(entitiesFile.entities.map((e) => [e.iso3, e])),
  unplantable: new Set(['TWN', 'KOS', 'SAH']),
  nameOf: (iso3) => NAMES[iso3] ?? iso3,
  balance: BALANCE,
};

const text = (s: string) => ({ fr: s, en: s });

export function prompt(
  id: string,
  category: PromptCategory,
  predicate: Predicate,
  difficulty = 0.4,
  extra: Partial<PromptDef> = {},
): PromptDef {
  const p: PromptDef = {
    id,
    category,
    text: text(id),
    explain: text(`why ${id}`),
    predicate,
    ...extra,
  };
  if (!extra.contextual) {
    const validIso3 = validSet(predicate, deps);
    p.computed = {
      validIso3,
      validCount: validIso3.length,
      continents: new Set(validIso3.map((c) => deps.entities.get(c)!.continent)).size,
      difficulty,
      dataVersion: factsFile.dataVersion,
    };
  }
  return p;
}

/** A small library spanning every category and difficulty band. */
export const PROMPTS: PromptDef[] = [
  prompt('relief.peak-4000', 'relief', { fact: 'highestPointM', gte: 4000 }, 0.3),
  prompt('relief.flat', 'relief', { fact: 'highestPointM', lt: 500 }, 0.85),
  prompt('water.landlocked', 'water', { fact: 'landlocked', eq: true }, 0.35),
  prompt(
    'water.coast-small',
    'water',
    {
      all: [
        { fact: 'landlocked', eq: false },
        { fact: 'areaKm2', lt: 50000 },
      ],
    },
    0.8,
  ),
  prompt('borders.many', 'borders', { fact: 'landBorders', gte: 6 }, 0.3),
  prompt('borders.island', 'borders', { fact: 'hasLandBorder', eq: false }, 0.5),
  prompt('climate.tropic-cancer', 'climate', { fact: 'crossesTropicOfCancer', eq: true }, 0.55),
  prompt('climate.southern', 'climate', { fact: 'hemisphereNS', eq: 'S' }, 0.25),
  prompt('society.left', 'society', { fact: 'drivesOnLeft', eq: true }, 0.4),
  prompt('society.monarchy', 'society', { fact: 'monarchy', eq: true }, 0.6),
  prompt('flag.green', 'flag', { fact: 'flagColors', includes: 'green' }, 0.15),
  prompt('flag.no-red', 'flag', { not: { fact: 'flagColors', includes: 'red' } }, 0.7),
  prompt('position.equator', 'position', { fact: 'crossesEquator', eq: true }, 0.45),
  prompt('position.east', 'position', { fact: 'hemisphereEW', eq: 'E' }, 0.1),
  prompt('relief.peak-6000', 'relief', { fact: 'highestPointM', gte: 6000 }, 0.5),
  prompt('relief.peak-2000', 'relief', { fact: 'highestPointM', gte: 2000 }, 0.2),
  prompt(
    'water.coast-large',
    'water',
    {
      all: [
        { fact: 'landlocked', eq: false },
        { fact: 'areaKm2', gt: 1000000 },
      ],
    },
    0.2,
  ),
  prompt('borders.one', 'borders', { fact: 'landBorders', eq: 1 }, 0.75),
  prompt(
    'climate.tropic-capricorn',
    'climate',
    { fact: 'crossesTropicOfCapricorn', eq: true },
    0.6,
  ),
  prompt('climate.arctic', 'climate', { fact: 'crossesArcticCircle', eq: true }, 0.3),
  prompt('society.euro', 'society', { fact: 'usesEuro', eq: true }, 0.25),
  prompt('society.pop-small', 'society', { fact: 'population', lt: 1000000 }, 0.9),
  prompt('flag.yellow', 'flag', { fact: 'flagColors', includes: 'yellow' }, 0.3),
  prompt('flag.black', 'flag', { fact: 'flagColors', includes: 'black' }, 0.65),
  prompt('position.prime', 'position', { fact: 'crossesPrimeMeridian', eq: true }, 0.9),
  prompt('position.deep-south', 'position', { fact: 'southernmostLat', lt: -40 }, 0.55),
  prompt('ctx.neighbour', 'borders', { ctx: { rule: 'neighborOf' } }, 0.5, { contextual: true }),
];

const port = (id: string, iso3: string, lonLat: [number, number]): Port => ({
  id,
  name: text(id),
  iso3,
  lonLat,
});

export const PORTS: Port[] = [
  port('lisbon', 'PRT', [-9.139, 38.722]),
  port('dakar', 'SEN', [-17.467, 14.717]),
  port('valparaiso', 'CHL', [-71.627, -33.047]),
  port('halifax', 'CAN', [-63.575, 44.649]),
  port('mumbai', 'IND', [72.877, 19.076]),
  port('yokohama', 'JPN', [139.638, 35.444]),
  port('fremantle', 'AUS', [115.748, -32.056]),
];

export const LIBRARY: GeneratorLibrary = { libraryVersion: 1, prompts: PROMPTS, ports: PORTS };
