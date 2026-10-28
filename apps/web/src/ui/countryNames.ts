import type { PlayableEntity } from '@meridian/content-schema';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Localised country names without shipping any data (architecture §1: Intl.DisplayNames). */
export function countryNames(entities: Iterable<PlayableEntity>, locale = 'fr') {
  const display = new Intl.DisplayNames([locale], { type: 'region' });
  return [...entities]
    .map((e) => {
      const name = display.of(e.iso2) ?? e.iso3;
      return { iso3: e.iso3, name, key: fold(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export type CountryName = ReturnType<typeof countryNames>[number];

/** Prefix matches first, then word-start and substring matches; accent and case insensitive. */
export function searchCountries(names: CountryName[], query: string, limit = 8): CountryName[] {
  const q = fold(query.trim());
  if (!q) return [];
  const score = (n: CountryName) =>
    n.key.startsWith(q)
      ? 0
      : n.key.split(/[\s'’-]+/).some((w) => w.startsWith(q))
        ? 1
        : n.key.includes(q)
          ? 2
          : 3;
  return names
    .map((n) => [n, score(n)] as const)
    .filter(([, s]) => s < 3)
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([n]) => n);
}
