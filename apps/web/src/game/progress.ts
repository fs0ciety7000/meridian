import type { PlayableEntity } from '@meridian/content-schema';
import { TIERS, type RarityTier, type RunState, type StampResult } from '@meridian/engine';
import type { CountryMark } from '../map/render';
import { countingRuns } from './store';

export interface PassportPage {
  iso3: string;
  /** Slots filled by a frozen stamp of that tier (gameplay-systems §15). */
  slots: Set<RarityTier>;
  /** Stamps still drying (estimated / provisional). */
  fresh: StampResult[];
  firstAt: string;
}

/** Passport pages, derived from first-attempt runs (never stored separately). */
export function passport(runs: RunState[]): Map<string, PassportPage> {
  const pages = new Map<string, PassportPage>();
  for (const run of countingRuns(runs))
    for (const l of run.legs) {
      if (!l.valid || !l.rarity) continue;
      const page =
        pages.get(l.pick.iso3) ??
        pages
          .set(l.pick.iso3, { iso3: l.pick.iso3, slots: new Set(), fresh: [], firstAt: l.at })
          .get(l.pick.iso3)!;
      if (l.rarity.status === 'frozen') page.slots.add(l.rarity.tier);
      else page.fresh.push(l.rarity);
      if (l.at < page.firstAt) page.firstAt = l.at;
    }
  return pages;
}

/** Personal atlas: inked at the first valid camp; wash intensity = filled slots (0–4). */
export function atlasMarks(
  runs: RunState[],
  entities: ReadonlyMap<string, PlayableEntity>,
): CountryMark[] {
  return [...passport(runs).values()].map((p) => ({
    entity: p.iso3,
    state: 'visited',
    continent: entities.get(p.iso3)?.continent ?? 'AN',
    intensity: p.slots.size / TIERS.length,
  }));
}

export function lifetimeKm(runs: RunState[]): number {
  return countingRuns(runs).reduce(
    (t, r) => t + r.legs.reduce((s, l) => s + (l.valid ? l.distanceKm : 0), 0),
    0,
  );
}
