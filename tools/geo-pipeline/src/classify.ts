import type { ContinentCode } from '@meridian/content-schema';

/** The subset of Natural Earth admin-0 properties the pipeline relies on. */
export interface NeProps {
  ADM0_A3: string;
  ISO_A3_EH: string;
  ISO_A2_EH: string;
  ISO_N3_EH: string;
  TYPE: string;
  SOV_A3: string;
  ADMIN: string;
  CONTINENT: string;
  SUBREGION: string;
}

export interface GeoPolicy {
  version: number;
  unMembers: string[];
  unObservers: string[];
  sovereignCodes: Record<string, string>;
  unplantableTypes: string[];
  continentOverrides: Record<string, string>;
  /** Keyed by Natural Earth BRK_A3; keys starting with "$" are comments. */
  carveOuts: Record<string, CarveOut | string>;
  microStateMaxKm2: number;
}

export interface CarveOut {
  name: string;
  /** ADM0_A3 of the existing unit the area joins; absent → a new unit with id = BRK_A3. */
  into?: string;
}

/** Policy carve-outs without the "$description" comment keys. */
export const carveOutsOf = (policy: GeoPolicy): [string, CarveOut][] =>
  Object.entries(policy.carveOuts).filter(
    (e): e is [string, CarveOut] => !e[0].startsWith('$') && typeof e[1] === 'object',
  );

export type Classification =
  | { kind: 'playable'; entity: string }
  | { kind: 'territory'; entity: string; reason: 'dependency' }
  | {
      kind: 'unplantable';
      sovereign: string | null;
      reason: 'disputed' | 'non-member' | 'antarctica';
    };

const SUBORDINATE_TYPES = new Set(['Dependency', 'Lease']);

/**
 * Applies the geo policy (data-model §2.3) to one Natural Earth map unit:
 * 1. Antarctica is never plantable.
 * 2. A UN member or observer's own unit is playable (Natural Earth's ISO_A3 is -99 for
 *    France and Norway, so the "_EH" codes are used).
 * 3. Units Natural Earth types as disputed/indeterminate are not plantable.
 * 4. Any other unit counts for its sovereign state when that state is playable.
 * 5. Everything else (non-member states) is not plantable.
 */
export function classify(p: NeProps, policy: GeoPolicy): Classification {
  const members = new Set([...policy.unMembers, ...policy.unObservers]);
  const sovereign = policy.sovereignCodes[p.SOV_A3] ?? p.SOV_A3;
  const type = p.TYPE.trim();

  if (p.ADM0_A3 === 'ATA') return { kind: 'unplantable', sovereign: null, reason: 'antarctica' };

  const iso = p.ISO_A3_EH;
  const isOwnUnit = sovereign === iso || policy.unObservers.includes(iso);
  if (members.has(iso) && isOwnUnit && !SUBORDINATE_TYPES.has(type)) {
    return { kind: 'playable', entity: iso };
  }

  if (policy.unplantableTypes.includes(type)) {
    return {
      kind: 'unplantable',
      sovereign: members.has(sovereign) ? sovereign : null,
      reason: 'disputed',
    };
  }

  if (members.has(sovereign)) return { kind: 'territory', entity: sovereign, reason: 'dependency' };

  return { kind: 'unplantable', sovereign: null, reason: 'non-member' };
}

const CONTINENTS: Record<string, ContinentCode> = {
  Africa: 'AF',
  Antarctica: 'AN',
  Asia: 'AS',
  Europe: 'EU',
  'North America': 'NA',
  Oceania: 'OC',
  'South America': 'SA',
};

export function continentOf(p: NeProps, policy: GeoPolicy): ContinentCode | null {
  const override = policy.continentOverrides[p.ISO_A3_EH];
  if (override) return override as ContinentCode;
  return CONTINENTS[p.CONTINENT] ?? null;
}

/** UN M49 sub-region codes, keyed by the names Natural Earth uses. */
export const SUBREGION_M49: Record<string, string> = {
  'Northern Africa': '015',
  'Eastern Africa': '014',
  'Middle Africa': '017',
  'Southern Africa': '018',
  'Western Africa': '011',
  Caribbean: '029',
  'Central America': '013',
  'South America': '005',
  'Northern America': '021',
  'Central Asia': '143',
  'Eastern Asia': '030',
  'South-Eastern Asia': '035',
  'Southern Asia': '034',
  'Western Asia': '145',
  'Eastern Europe': '151',
  'Northern Europe': '154',
  'Southern Europe': '039',
  'Western Europe': '155',
  'Australia and New Zealand': '053',
  Melanesia: '054',
  Micronesia: '057',
  Polynesia: '061',
};
