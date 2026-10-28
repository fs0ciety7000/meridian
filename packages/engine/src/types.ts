import type {
  ContinentCode,
  CountryFacts,
  Difficulty,
  Expedition,
  FactValue,
  LegDef,
  PlayableEntity,
} from '@meridian/content-schema';
import type { LonLat } from '@meridian/geo';
import type { Balance } from './balance';

export type RarityTier = 'known' | 'trail' | 'frontier' | 'incognita';
export const TIERS: readonly RarityTier[] = ['known', 'trail', 'frontier', 'incognita'];
export type RarityStatus = 'estimated' | 'provisional' | 'frozen';
export type Mode = 'expedition' | 'challenge';
export type Locale = 'fr' | 'en';

/** Read-only content the engine evaluates against (data-model §5.2 `EngineDeps`). */
export interface EngineDeps {
  facts: ReadonlyMap<string, CountryFacts>;
  entities: ReadonlyMap<string, PlayableEntity>;
  /** Shown as land but refused without penalty (disputed areas, gameplay-systems §3.2). */
  unplantable?: ReadonlySet<string>;
  /** Localised country name, for `sameInitial` (gameplay-systems §13.10). */
  nameOf?: (iso3: string, locale: Locale) => string;
  balance: Balance;
}

/** Where the player stands when a leg is evaluated (context rules, §7). */
export interface LegContext {
  /** Entity of the last valid camp, or of the port. */
  prevIso3: string;
  prevLonLat: LonLat;
  portLonLat: LonLat;
  locale: Locale;
  /** The planted point; absent when evaluating a whole country (forge, prior, spyglass). */
  pick?: LonLat;
}

export type FactsRecord = Readonly<Record<string, FactValue>>;

export interface StampResult {
  tier: RarityTier;
  share: number;
  status: RarityStatus;
}

export interface LegResult {
  leg: number;
  promptId: string;
  pick: { lonLat: LonLat; iso3: string };
  valid: boolean;
  distanceKm: number;
  meridianCrossed: boolean;
  /** Contextual legs: iso3 of the camp the context was computed from. */
  contextKey?: string;
  usedFallback: boolean;
  rarity?: StampResult;
  spyglass: boolean;
  provisionalMoves: number;
  ms: number;
  at: string;
}

export interface MissionResult {
  id: string;
  done: boolean;
}

export interface RunScore {
  distanceKm: number;
  base: number;
  meridian: number;
  missions: number;
  renown: number;
  tiers: Record<RarityTier, number>;
  /** True once every stamp is frozen (ink dry). */
  final: boolean;
}

export interface RunState {
  schema: 1;
  runId: string;
  mode: Mode;
  expedition: Expedition;
  attempt: 'first' | 'replay';
  challengeFrom?: string;
  balanceVersion: number;
  locale: Locale;
  status: 'in_progress' | 'completed' | 'abandoned';
  /** 1..6; 7 once finished. */
  currentLeg: number;
  camp: LonLat;
  campIso3: string;
  usedIso3: string[];
  spyglassLegs: number[];
  legs: LegResult[];
  missions: MissionResult[];
  score?: RunScore;
  startedAt: string;
  finishedAt?: string;
}

export interface RaritySnapshot {
  promptId: string;
  contextKey?: string;
  total: number;
  priorWeight: number;
  entries: Record<string, { n: number; share: number; tier: RarityTier }>;
  computedAt: string;
  balanceVersion: number;
}

export type Action =
  | {
      type: 'START';
      runId: string;
      expedition: Expedition;
      mode: Mode;
      attempt: 'first' | 'replay';
      locale: Locale;
      now: string;
      challengeFrom?: string;
    }
  | {
      type: 'CONFIRM_CAMP';
      lonLat: LonLat;
      iso3: string | null;
      ms: number;
      provisionalMoves: number;
      now: string;
    }
  | { type: 'USE_SPYGLASS' }
  | { type: 'APPLY_RARITY'; snapshot: RaritySnapshot; now: string }
  | { type: 'ABANDON'; now: string };

export type EngineEvent =
  | { type: 'CAMP_REFUSED'; reason: 'not_playable' | 'already_used' | 'disputed' | 'finished' }
  | { type: 'CAMP_PLANTED'; leg: number; iso3: string; distanceKm: number }
  | { type: 'FALSE_TRAIL'; leg: number; iso3: string; promptId: string }
  | { type: 'MERIDIAN_CROSSED'; leg: number; at: LonLat }
  | { type: 'STAMP_AWARDED'; leg: number; iso3: string; tier: RarityTier; status: RarityStatus }
  | {
      type: 'STAMP_UPDATED';
      leg: number;
      iso3: string;
      from: RarityTier;
      to: RarityTier;
      status: RarityStatus;
    }
  | { type: 'SPYGLASS_USED'; leg: number; subregions: string[] }
  | { type: 'SPYGLASS_REFUSED' }
  | { type: 'MISSION_COMPLETED'; id: string }
  | { type: 'EXPEDITION_COMPLETED'; score: RunScore }
  | { type: 'EXPEDITION_ABANDONED'; score: RunScore };

/** The prompt actually in force for a leg (contextual legs may fall back). */
export interface ActiveLeg {
  def: Pick<LegDef, 'promptId' | 'predicate' | 'text' | 'explain'>;
  index: number;
  usedFallback: boolean;
  contextual: boolean;
}

export type { ContinentCode, Difficulty };
