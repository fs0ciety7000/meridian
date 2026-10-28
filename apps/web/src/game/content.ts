import type {
  CatalogFile,
  Difficulty,
  EntitiesFile,
  Expedition,
  FactsFile,
  PromptLibrary,
} from '@meridian/content-schema';
import factsUrl from '@meridian/content/facts/facts.json?url';
import entitiesUrl from '@meridian/content/geo/entities.json?url';
import {
  BALANCE,
  decodeCode,
  generateExpedition,
  type EngineDeps,
  type Locale,
} from '@meridian/engine';

// Every published library ships so that old generated codes replay identically (data-model §9).
const LIBRARIES = import.meta.glob<string>('../../../../content/library/library-v*.json', {
  query: '?url',
  import: 'default',
});
const CATALOG = import.meta.glob<string>('../../../../content/library/catalog.json', {
  query: '?url',
  import: 'default',
});

export interface GameContent {
  deps: EngineDeps;
  dataVersion: string;
  catalog: Expedition[];
  latestLibrary: number | null;
  library: (version: number) => Promise<PromptLibrary | null>;
}

const json = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
};

const versionOf = (path: string) => Number(/library-v(\d+)\.json$/.exec(path)?.[1]);

export async function loadGameContent(): Promise<GameContent> {
  const catalogLoader = Object.values(CATALOG)[0];
  // Validated at build time by prompt-forge and the facts pipeline: no runtime schema.
  const [facts, entities, catalog] = await Promise.all([
    json<FactsFile>(factsUrl),
    json<EntitiesFile>(entitiesUrl),
    catalogLoader ? catalogLoader().then((u) => json<CatalogFile>(u)) : null,
  ]);
  const names = new Map<Locale, Intl.DisplayNames>();
  const iso2 = new Map(entities.entities.map((e) => [e.iso3, e.iso2]));
  const deps: EngineDeps = {
    facts: new Map(facts.countries.map((c) => [c.iso3, c])),
    entities: new Map(entities.entities.map((e) => [e.iso3, e])),
    unplantable: new Set(entities.territories.filter((t) => !t.plantable).map((t) => t.id)),
    nameOf: (iso3, locale) => {
      let d = names.get(locale);
      if (!d) names.set(locale, (d = new Intl.DisplayNames([locale], { type: 'region' })));
      return d.of(iso2.get(iso3) ?? iso3) ?? iso3;
    },
    balance: BALANCE,
  };
  const loaders = new Map(Object.entries(LIBRARIES).map(([path, load]) => [versionOf(path), load]));
  const cache = new Map<number, Promise<PromptLibrary | null>>();
  return {
    deps,
    dataVersion: facts.dataVersion,
    catalog: catalog?.expeditions ?? [],
    latestLibrary: loaders.size ? Math.max(...loaders.keys()) : null,
    library: (v) => {
      if (!cache.has(v)) {
        const load = loaders.get(v);
        cache.set(v, load ? load().then((u) => json<PromptLibrary>(u)) : Promise.resolve(null));
      }
      return cache.get(v)!;
    },
  };
}

/** Code → expedition: catalogue lookup, or the seeded generator (same code ⇒ same hash). */
export async function resolveExpedition(
  content: GameContent,
  code: string,
): Promise<Expedition | null> {
  const d = decodeCode(code);
  if (!d) return null;
  if (d.source === 'catalog')
    return content.catalog.find((e) => e.catalogNumber === d.catalogNumber) ?? null;
  const library = await content.library(d.libraryVersion);
  if (!library) return null;
  const fallback = content.catalog.length
    ? (seed: number) => content.catalog[seed % content.catalog.length]!
    : undefined;
  return generateExpedition(d.seed, d.difficulty, library, content.deps, {
    dataVersion: content.dataVersion,
    ...(fallback ? { fallback } : {}),
  });
}

/** A fresh random seed for "New expedition" (the only randomness outside the engine). */
export function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! & 0x3fffffff;
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'expert'];
