import type {
  Difficulty,
  Expedition,
  LegDef,
  MissionDef,
  MissionId,
  Port,
  PromptDef,
} from '@meridian/content-schema';
import { haversineKm, meridianCrossing, wrapLon, type LonLat } from '@meridian/geo';
import { encodeGeneratedCode } from './code';
import { MISSION_PARAMS, missionDone, type RouteView } from './missions';
import { evaluate, isContextual, validSet } from './predicate';
import { hash32, mulberry32, pick } from './rng';
import { canonicalJson, sha256 } from './sha256';
import type { EngineDeps } from './types';

export interface GeneratorLibrary {
  libraryVersion: number;
  prompts: readonly PromptDef[];
  ports: readonly Port[];
}

export interface GeneratorOptions {
  dataVersion: string;
  /** Deterministic fallback expedition after `generatorMaxRetries` failed attempts (§14.6). */
  fallback?: (seed: number, difficulty: Difficulty) => Expedition;
}

const DIFF_INDEX: Record<Difficulty, 0 | 1 | 2> = { easy: 0, normal: 1, expert: 2 };
const PROMPT_RANGE: Record<Difficulty, [number, number]> = {
  easy: [0, 0.45],
  normal: [0.2, 0.75],
  expert: [0.5, 1],
};
const MISSIONS_PER_DIFFICULTY: Record<Difficulty, number> = { easy: 1, normal: 2, expert: 3 };
const MISSION_IDS: readonly MissionId[] = [
  'continentHopper',
  'equatorShuttle',
  'southernSoul',
  'northernSoul',
  'longHaul',
  'noFalseTrail',
  'meridianWeaver',
];
export const CONTEXTUAL_LEG_PROBABILITY = 0.3;
export const MAX_ANSWER_OVERLAP = 0.6;
export const MIN_MERIDIAN_DISTANCE_DEG = 20;

const difficultyOf = (p: PromptDef) => p.computed?.difficulty ?? 0.5;

export function freezeLeg(index: number, prompt: PromptDef, fallback?: PromptDef): LegDef {
  const frozen = (p: PromptDef) => ({
    promptId: p.id,
    predicate: p.predicate,
    text: p.text,
    explain: p.explain,
  });
  return { index, ...frozen(prompt), ...(fallback ? { fallback: frozen(fallback) } : {}) };
}

/** sha256 of the canonical JSON of an expedition without its hash (client/server integrity). */
export function expeditionHash(e: Omit<Expedition, 'hash'> | Expedition): string {
  return sha256(canonicalJson({ ...e, hash: undefined }));
}

/** Overlap of two answer sets relative to the smaller one. */
export function answerOverlap(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  return b.filter((c) => set.has(c)).length / Math.min(a.length, b.length);
}

/**
 * Greedy route search (§14.5, data-model §10): picks, leg by leg, an unused valid country (camp at
 * its aim point) that best serves `goal`. Returns the route, or null if some leg has no answer.
 */
export function greedyRoute(
  exp: Pick<Expedition, 'start' | 'legs' | 'meridianLon'>,
  deps: EngineDeps,
  goal?: MissionDef,
  locale: 'fr' | 'en' = 'en',
): RouteView | null {
  const route: RouteView = {
    port: { lonLat: exp.start.lonLat, iso3: exp.start.iso3 },
    legs: [],
    meridianLon: exp.meridianLon,
  };
  const used = new Set<string>();
  let camp: { lonLat: LonLat; iso3: string } = route.port;
  for (const leg of exp.legs) {
    const ctx = {
      prevIso3: camp.iso3,
      prevLonLat: camp.lonLat,
      portLonLat: exp.start.lonLat,
      locale,
    };
    let predicate = leg.predicate;
    let answers = validSet(predicate, deps, ctx).filter((c) => !used.has(c));
    if (isContextual(leg.predicate) && leg.fallback && answers.length < 3) {
      predicate = leg.fallback.predicate;
      answers = validSet(predicate, deps, ctx).filter((c) => !used.has(c));
    }
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const c of answers) {
      const at = deps.entities.get(c)!.aimPoint;
      if (!evaluate(predicate, c, deps, { ...ctx, pick: at })) continue;
      const s = goalScore(goal, camp, { lonLat: at, iso3: c }, exp.meridianLon, deps);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (!best) return null;
    const next = { lonLat: deps.entities.get(best)!.aimPoint, iso3: best };
    route.legs.push({ ...next, valid: true, distanceKm: haversineKm(camp.lonLat, next.lonLat) });
    used.add(best);
    camp = next;
  }
  return route;
}

function goalScore(
  goal: MissionDef | undefined,
  from: { lonLat: LonLat; iso3: string },
  to: { lonLat: LonLat; iso3: string },
  meridianLon: number,
  deps: EngineDeps,
): number {
  const lat = to.lonLat[1];
  switch (goal?.id) {
    case 'southernSoul':
      return -lat;
    case 'northernSoul':
      return lat;
    case 'equatorShuttle':
      return (Math.sign(lat) !== Math.sign(from.lonLat[1]) ? 1000 : 0) + Math.abs(lat);
    case 'continentHopper':
      return deps.entities.get(to.iso3)!.continent !== deps.entities.get(from.iso3)?.continent
        ? 1
        : 0;
    case 'longHaul':
      return haversineKm(from.lonLat, to.lonLat);
    case 'meridianWeaver':
      return meridianCrossing(from.lonLat, to.lonLat, meridianLon) ? 1 : 0;
    default:
      return 0;
  }
}

function attempt(
  rand: () => number,
  seed: number,
  difficulty: Difficulty,
  library: GeneratorLibrary,
  deps: EngineDeps,
  opts: GeneratorOptions,
): Expedition | null {
  const b = deps.balance;
  // 1. Port: a continent first (so that Europe's many ports do not dominate), then a port.
  const byContinent = new Map<string, Port[]>();
  for (const p of library.ports) {
    const c = deps.entities.get(p.iso3)?.continent;
    if (c) (byContinent.get(c) ?? byContinent.set(c, []).get(c)!).push(p);
  }
  const continents = [...byContinent.keys()].sort();
  if (!continents.length) return null;
  const start = pick(rand, byContinent.get(pick(rand, continents))!);

  // 2. Meridian: a multiple of 5, at least 20° from the port.
  let meridianLon: number;
  let tries = 0;
  do {
    if (++tries > 100) return null;
    meridianLon = -180 + 5 * Math.floor(rand() * 72);
  } while (Math.abs(wrapLon(meridianLon - start.lonLat[0])) < MIN_MERIDIAN_DISTANCE_DEG);

  // 3. Prompts.
  const [lo, hi] = PROMPT_RANGE[difficulty];
  const live = library.prompts.filter((p) => !p.retiredBy && p.computed);
  const pool = live.filter((p) => !p.contextual && difficultyOf(p) >= lo && difficultyOf(p) <= hi);
  const answersOf = (p: PromptDef) => p.computed!.validIso3;
  const chosen: PromptDef[] = [];
  for (let i = 0; i < b.legsPerExpedition; i++) {
    const prev = chosen[i - 1];
    const regional = chosen.some((p) => p.regional);
    const candidates = pool.filter(
      (p) =>
        !chosen.includes(p) &&
        p.category !== prev?.category &&
        !(regional && p.regional) &&
        chosen.every((q) => answerOverlap(answersOf(p), answersOf(q)) <= MAX_ANSWER_OVERLAP),
    );
    if (!candidates.length) return null;
    chosen.push(pick(rand, candidates));
  }
  if (new Set(chosen.map((p) => p.category)).size < 4) return null;
  if (difficulty === 'expert' && !chosen.some((p) => difficultyOf(p) >= 0.8)) return null;

  const legs = chosen.map((p, i) => freezeLeg(i + 1, p));
  const contextualPool = live.filter((p) => p.contextual);
  if (contextualPool.length && rand() < CONTEXTUAL_LEG_PROBABILITY)
    legs[5] = freezeLeg(6, pick(rand, contextualPool), chosen[5]);

  // 4. A route must exist; each mission order must be achievable on its own (§8.3).
  const draft = { start, legs, meridianLon };
  if (!greedyRoute(draft, deps)) return null;
  const d = DIFF_INDEX[difficulty];
  const remaining = [...MISSION_IDS];
  const missions: MissionDef[] = [];
  while (missions.length < MISSIONS_PER_DIFFICULTY[difficulty]) {
    if (!remaining.length) return null;
    const id = remaining.splice(Math.floor(rand() * remaining.length), 1)[0]!;
    const m: MissionDef =
      id === 'continentHopper'
        ? { id, params: { n: MISSION_PARAMS.continentHopper.n[d] } }
        : id === 'longHaul'
          ? { id, params: { km: MISSION_PARAMS.longHaul.km[d] } }
          : { id };
    const route = greedyRoute(draft, deps, m);
    if (route && missionDone(m, route, deps)) missions.push(m);
  }

  const exp: Omit<Expedition, 'hash'> = {
    code: encodeGeneratedCode(seed, difficulty, library.libraryVersion),
    source: 'generated',
    seed,
    difficulty,
    libraryVersion: library.libraryVersion,
    start,
    meridianLon,
    legs,
    missions,
    dataVersion: opts.dataVersion,
  };
  return { ...exp, hash: expeditionHash(exp) };
}

/**
 * `generateExpedition(seed, difficulty, library)` (gameplay-systems §14): deterministic — the
 * same arguments give the same expedition on every device. Failed attempts retry with
 * `hash32(seed, attempt)`; the code always encodes the original seed.
 */
export function generateExpedition(
  seed: number,
  difficulty: Difficulty,
  library: GeneratorLibrary,
  deps: EngineDeps,
  opts: GeneratorOptions,
): Expedition {
  for (let a = 0; a < deps.balance.generatorMaxRetries; a++) {
    const rand = mulberry32(a === 0 ? seed : hash32(seed, a));
    const exp = attempt(rand, seed, difficulty, library, deps, opts);
    if (exp) return exp;
  }
  if (opts.fallback) return opts.fallback(seed, difficulty);
  throw new Error(`No expedition for seed ${seed} (${difficulty}) after retries`);
}
