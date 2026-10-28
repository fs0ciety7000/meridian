/**
 * Offline step: Wikidata snapshot + geometry + curated lists → content/facts/facts.json
 * (data-model §3). Every value carries a source; geometric facts also exist in a
 * "metropolitan" reading so prompt-forge can reject territory-ambiguous prompts.
 *
 *   pnpm facts          writes content/facts/facts.json
 *   pnpm facts:check    fails if the committed file is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FactsFile,
  type CountryFacts,
  type EntitiesFile,
  type FactDef,
  type FactValue,
} from '@meridian/content-schema';
import { computeGeometryFacts, type GeometryFacts } from './geometry';
import { normaliseColours, normaliseLanguages, ORGANISATIONS } from './normalise';
import type { SnapshotCountry } from './snapshot-types';

const FACTS_VERSION = 1;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;

const entitiesFile = read<EntitiesFile>('content/geo/entities.json');
const snapshot = read<{ retrieved: string; countries: Record<string, SnapshotCountry> }>(
  'content/facts/wikidata-snapshot.json',
);
const curated = read<{
  retrieved: string;
  facts: Record<string, { iso3: string[]; source: string }>;
  memberOf: Record<string, { iso3: string[]; source: string }>;
  metroOverrides: Record<string, Record<string, { value: FactValue; source: string }>>;
  overrides: Record<string, Record<string, { value: FactValue; source: string }>>;
}>('content/facts/curated.json');

const t = (fr: string, en: string) => ({ fr, en });

/** The registry: what each fact means, where it comes from, whether territories can change it. */
const DEFS: Omit<FactDef, 'territorySensitive'>[] = [
  {
    id: 'areaKm2',
    type: 'number',
    unit: 'km2',
    category: 'position',
    origin: 'geometry',
    description: t('Superficie', 'Area'),
  },
  {
    id: 'northernmostLat',
    type: 'number',
    unit: 'deg',
    category: 'position',
    origin: 'geometry',
    description: t('Latitude du point le plus au nord', 'Latitude of the northernmost point'),
  },
  {
    id: 'southernmostLat',
    type: 'number',
    unit: 'deg',
    category: 'position',
    origin: 'geometry',
    description: t('Latitude du point le plus au sud', 'Latitude of the southernmost point'),
  },
  {
    id: 'crossesEquator',
    type: 'boolean',
    category: 'position',
    origin: 'geometry',
    description: t("Traversé par l'équateur", 'Crossed by the equator'),
  },
  {
    id: 'crossesTropicOfCancer',
    type: 'boolean',
    category: 'position',
    origin: 'geometry',
    description: t('Traversé par le tropique du Cancer', 'Crossed by the Tropic of Cancer'),
  },
  {
    id: 'crossesTropicOfCapricorn',
    type: 'boolean',
    category: 'position',
    origin: 'geometry',
    description: t('Traversé par le tropique du Capricorne', 'Crossed by the Tropic of Capricorn'),
  },
  {
    id: 'crossesArcticCircle',
    type: 'boolean',
    category: 'position',
    origin: 'geometry',
    description: t('Traversé par le cercle polaire arctique', 'Crossed by the Arctic Circle'),
  },
  {
    id: 'crossesPrimeMeridian',
    type: 'boolean',
    category: 'position',
    origin: 'geometry',
    description: t('Traversé par le méridien de Greenwich', 'Crossed by the prime meridian'),
  },
  {
    id: 'hemisphereNS',
    type: 'enum',
    category: 'position',
    origin: 'geometry',
    description: t('Hémisphère nord/sud (N, S, both)', 'Northern/southern hemisphere (N, S, both)'),
  },
  {
    id: 'hemisphereEW',
    type: 'enum',
    category: 'position',
    origin: 'geometry',
    description: t(
      'Hémisphère est/ouest de Greenwich (E, W, both)',
      'East/west of Greenwich (E, W, both)',
    ),
  },
  {
    id: 'landBorders',
    type: 'number',
    category: 'borders',
    origin: 'geometry',
    description: t('Nombre de pays voisins par la terre', 'Number of land neighbours'),
  },
  {
    id: 'borders',
    type: 'set',
    category: 'borders',
    origin: 'geometry',
    description: t('Pays voisins par la terre (ISO3)', 'Land neighbours (ISO3)'),
  },
  {
    id: 'hasLandBorder',
    type: 'boolean',
    category: 'borders',
    origin: 'geometry',
    description: t('A au moins une frontière terrestre', 'Has at least one land border'),
  },
  {
    id: 'continent',
    type: 'enum',
    category: 'position',
    origin: 'geometry',
    description: t('Continent principal', 'Main continent'),
  },
  {
    id: 'subregion',
    type: 'enum',
    category: 'position',
    origin: 'geometry',
    description: t('Sous-région ONU (M49)', 'UN sub-region (M49)'),
  },
  {
    id: 'landlocked',
    type: 'boolean',
    category: 'water',
    origin: 'curated',
    description: t('Sans accès à la mer', 'Landlocked'),
  },
  {
    id: 'doubleLandlocked',
    type: 'boolean',
    category: 'water',
    origin: 'curated',
    description: t('Doublement enclavé', 'Doubly landlocked'),
  },
  {
    id: 'drivesOnLeft',
    type: 'boolean',
    category: 'society',
    origin: 'curated',
    description: t('On y roule à gauche', 'Drives on the left'),
  },
  {
    id: 'monarchy',
    type: 'boolean',
    category: 'society',
    origin: 'curated',
    description: t('Monarchie', 'Monarchy'),
  },
  {
    id: 'population',
    type: 'number',
    category: 'society',
    origin: 'wikidata',
    description: t('Population', 'Population'),
  },
  {
    id: 'highestPointM',
    type: 'number',
    unit: 'm',
    category: 'relief',
    origin: 'wikidata',
    description: t('Altitude du point culminant', 'Elevation of the highest point'),
  },
  {
    id: 'usesEuro',
    type: 'boolean',
    category: 'society',
    origin: 'wikidata',
    description: t("Utilise l'euro", 'Uses the euro'),
  },
  {
    id: 'currencyDollar',
    type: 'boolean',
    category: 'society',
    origin: 'wikidata',
    description: t('Sa monnaie s’appelle « dollar »', 'Its currency is called “dollar”'),
  },
  {
    id: 'officialLanguages',
    type: 'set',
    category: 'society',
    origin: 'wikidata',
    description: t('Grandes langues officielles', 'Major official languages'),
  },
  {
    id: 'flagColors',
    type: 'set',
    category: 'flag',
    origin: 'wikidata',
    description: t('Couleurs du drapeau', 'Flag colours'),
  },
  {
    id: 'memberOf',
    type: 'set',
    category: 'society',
    origin: 'wikidata',
    description: t('Organisations internationales', 'International organisations'),
  },
];

const GEOMETRY_FACTS = DEFS.filter((d) => d.origin === 'geometry').map((d) => d.id);

function build() {
  const geo = computeGeometryFacts(
    entitiesFile,
    read('content/geo/world-50m.topo.json'),
    read('content/geo/micro-10m.topo.json'),
  );
  const curatedSets = Object.fromEntries(
    Object.entries(curated.facts).map(([k, v]) => [k, new Set(v.iso3)]),
  );

  // Salience: percentile rank of Wikidata sitelinks (a proxy for notoriety).
  const bySitelinks = [...entitiesFile.entities].sort(
    (a, b) =>
      snapshot.countries[a.iso3]!.sitelinks - snapshot.countries[b.iso3]!.sitelinks ||
      a.iso3.localeCompare(b.iso3),
  );
  const salience = new Map(
    bySitelinks.map((e, i) => [e.iso3, Math.round((i / (bySitelinks.length - 1)) * 1000) / 1000]),
  );

  const errors: string[] = [];
  const countries: CountryFacts[] = entitiesFile.entities.map((e) => {
    const wd = snapshot.countries[e.iso3]!;
    const g = geo.get(e.iso3)!;
    const wdRef = (prop: string) => ({
      ref: `wikidata:${wd.qid}#${prop}`,
      retrieved: snapshot.retrieved,
    });
    const geoRef = { ref: 'geometry:natural-earth-5.1.2', retrieved: entitiesFile.dataVersion };
    const facts: Record<string, FactValue> = {};
    const sources: CountryFacts['sources'] = {};
    const set = (
      id: string,
      value: FactValue | null | undefined,
      source: { ref: string; retrieved: string },
    ) => {
      if (value === null || value === undefined) return;
      facts[id] = value;
      sources[id] = source;
    };

    for (const id of GEOMETRY_FACTS) {
      if (id === 'continent') set(id, e.continent, geoRef);
      else if (id === 'subregion') set(id, e.subregionM49, geoRef);
      else set(id, g.whole[id as keyof GeometryFacts] as FactValue, geoRef);
    }
    for (const [id, list] of Object.entries(curatedSets)) {
      set(id, list.has(e.iso3), { ref: curated.facts[id]!.source, retrieved: curated.retrieved });
    }
    set('population', wd.population?.value, {
      ...wdRef('P1082'),
      retrieved: `${snapshot.retrieved} (value of ${wd.population?.year})`,
    });
    set('highestPointM', wd.highestPoint?.elevationM, wdRef('P610'));
    set(
      'usesEuro',
      wd.currencies.some((c) => c.startsWith('Q4916:')),
      wdRef('P38'),
    );
    set(
      'currencyDollar',
      wd.currencies.some((c) => /dollar/i.test(c)),
      wdRef('P38'),
    );
    set('officialLanguages', normaliseLanguages(wd.languages), wdRef('P37'));
    try {
      set('flagColors', normaliseColours(wd.flagColors), wdRef('P163/P462'));
    } catch (err) {
      errors.push(`${e.iso3}: ${(err as Error).message}`);
    }
    const curatedOrgs = Object.entries(curated.memberOf)
      .filter(([k, v]) => !k.startsWith('$') && v.iso3.includes(e.iso3))
      .map(([k]) => k);
    set(
      'memberOf',
      [
        ...wd.memberOf.flatMap((q) => (ORGANISATIONS[q] ? [ORGANISATIONS[q]] : [])),
        ...curatedOrgs,
      ].sort(),
      {
        ref: `wikidata:${wd.qid}#P463 + curated (eu, nato, asean, opec)`,
        retrieved: snapshot.retrieved,
      },
    );

    for (const [id, o] of Object.entries(curated.overrides[e.iso3] ?? {}))
      set(id, o.value, { ref: o.source, retrieved: curated.retrieved });

    // Metropolitan reading: only the geometric facts that differ.
    const metro: Record<string, FactValue> = {};
    for (const id of GEOMETRY_FACTS) {
      const w = facts[id];
      const m =
        id === 'continent' || id === 'subregion'
          ? w
          : (g.metro[id as keyof GeometryFacts] as FactValue);
      if (m !== undefined && JSON.stringify(m) !== JSON.stringify(w)) metro[id] = m;
    }
    for (const [id, o] of Object.entries(curated.metroOverrides[e.iso3] ?? {})) {
      if (JSON.stringify(o.value) !== JSON.stringify(facts[id])) metro[id] = o.value;
    }
    return { iso3: e.iso3, facts, metro, sources, salience: salience.get(e.iso3)! };
  });

  if (errors.length) throw new Error(`Normalisation errors:\n  ${errors.join('\n  ')}`);

  const defs: FactDef[] = DEFS.map((d) => ({
    ...d,
    territorySensitive: countries.some((c) => d.id in c.metro),
  }));
  const file = FactsFile.parse({
    dataVersion: `facts-${FACTS_VERSION}+wd-${snapshot.retrieved}+${entitiesFile.dataVersion}`,
    defs,
    countries,
  });

  // Coverage: a fact used in a prompt must be known for every country.
  const coverage = defs.map(
    (d) => [d.id, countries.filter((c) => d.id in c.facts).length] as const,
  );
  return { file, coverage };
}

const { file, coverage } = build();
const out = resolve(root, 'content/facts/facts.json');
const json = `${JSON.stringify(file, null, 1)}\n`;
console.log(`${file.dataVersion}: ${file.countries.length} countries, ${file.defs.length} facts`);
console.log(
  `  incomplete: ${
    coverage
      .filter(([, n]) => n < file.countries.length)
      .map(([id, n]) => `${id} ${n}`)
      .join(', ') || 'none'
  }`,
);
console.log(
  `  territory-sensitive: ${file.defs
    .filter((d) => d.territorySensitive)
    .map((d) => d.id)
    .join(', ')}`,
);
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
    console.error('✗ content/facts/facts.json is stale — run `pnpm facts`');
    process.exit(1);
  }
  console.log('✓ content/facts/facts.json is up to date');
} else {
  writeFileSync(out, json);
  console.log(`✓ written ${out}`);
}
