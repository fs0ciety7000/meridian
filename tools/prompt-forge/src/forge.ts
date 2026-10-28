/**
 * prompt-forge (development-plan 2.4): validates hand-written prompts, ports and catalogue
 * entries against the facts, computes each prompt's answer set and difficulty, and freezes the
 * catalogue into full expeditions. Pure functions; the CLI does the I/O.
 */
import type {
  CatalogEntry,
  Expedition,
  FactDef,
  Port,
  PromptDef,
  PromptLibrary,
} from '@meridian/content-schema';
import {
  catalogCode,
  evaluate,
  expeditionHash,
  factsUsed,
  freezeLeg,
  greedyRoute,
  isContextual,
  missionDone,
  validSet,
  type EngineDeps,
} from '@meridian/engine';

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

export interface ForgeInput {
  libraryVersion: number;
  dataVersion: string;
  defs: readonly FactDef[];
  prompts: readonly PromptDef[];
  ports: readonly Port[];
  catalog: readonly CatalogEntry[];
  deps: EngineDeps;
}

export interface ForgeOutput {
  library: PromptLibrary;
  expeditions: Expedition[];
  issues: Issue[];
}

/** Answers per contextual prompt are counted from every possible previous camp. */
export const CONTEXT_MIN_ANSWERS = 3;

/**
 * Difficulty 0 (easy) … 1 (hard): fewer answers and less famous answers make a prompt harder.
 *   0.6 × (1 − log-position of validCount in [8, 60]) + 0.4 × (1 − mean salience of the top 5)
 */
export function promptDifficulty(validIso3: readonly string[], deps: EngineDeps): number {
  const [lo, hi] = deps.balance.promptValidCount;
  const n = Math.min(hi, Math.max(lo, validIso3.length));
  const scarcity = 1 - Math.log(n / lo) / Math.log(hi / lo);
  const top = validIso3
    .map((c) => deps.facts.get(c)?.salience ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 5);
  const fame = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  return Math.round((0.6 * scarcity + 0.4 * (1 - fame)) * 100) / 100;
}

function checkPrompt(p: PromptDef, input: ForgeInput, issues: Issue[]): PromptDef {
  const { deps } = input;
  const err = (message: string) => issues.push({ level: 'error', where: p.id, message });
  const warn = (message: string) => issues.push({ level: 'warning', where: p.id, message });
  const defs = new Map(input.defs.map((d) => [d.id, d]));

  if (!p.id.startsWith(`${p.category}.`) && !p.contextual)
    warn(`id should start with its category "${p.category}."`);
  for (const f of factsUsed(p.predicate)) {
    const def = defs.get(f);
    if (!def) {
      err(`unknown fact "${f}"`);
      continue;
    }
    const missing = [...deps.entities.keys()].filter(
      (c) => deps.facts.get(c)?.facts[f] === undefined,
    );
    if (missing.length) err(`fact "${f}" is missing for ${missing.join(', ')}`);
  }
  if (!!p.contextual !== isContextual(p.predicate))
    err(
      p.contextual ? 'contextual prompt without a ctx rule' : 'ctx rule in a non-contextual prompt',
    );

  if (p.contextual) {
    // Every previous camp must leave enough answers, or the leg falls back (reported, not fatal).
    const poor: string[] = [];
    for (const [prev, e] of deps.entities) {
      const ctx = {
        prevIso3: prev,
        prevLonLat: e.aimPoint,
        portLonLat: e.aimPoint,
        locale: 'en' as const,
      };
      if (validSet(p.predicate, deps, ctx).filter((c) => c !== prev).length < CONTEXT_MIN_ANSWERS)
        poor.push(prev);
    }
    if (poor.length > deps.entities.size / 2)
      warn(`falls back from ${poor.length}/${deps.entities.size} previous camps`);
    return p;
  }

  // Territory-sensitive facts are allowed only when this prompt's answers are the same with and
  // without overseas parts: the check is per prompt, not per fact.
  const whole = validSet(p.predicate, deps, undefined, 'whole');
  const metro = validSet(p.predicate, deps, undefined, 'metro');
  if (whole.join() !== metro.join()) {
    const diff = [
      ...whole.filter((c) => !metro.includes(c)),
      ...metro.filter((c) => !whole.includes(c)),
    ];
    err(`ambiguous with or without overseas territories: ${diff.join(', ')}`);
  }
  const continents = new Set(whole.map((c) => deps.entities.get(c)!.continent));
  const [lo, hi] = deps.balance.promptValidCount;
  if (whole.length < lo || whole.length > hi)
    err(`${whole.length} answers, outside [${lo}, ${hi}]`);
  if (p.regional) {
    const outside = whole.filter((c) => !p.regional!.includes(deps.entities.get(c)!.continent));
    if (outside.length)
      err(`regional prompt has answers outside ${p.regional.join('/')}: ${outside.join(', ')}`);
  } else if (continents.size < deps.balance.promptMinContinents) {
    err(
      `answers on ${continents.size} continents (< ${deps.balance.promptMinContinents}); mark it regional`,
    );
  }
  return {
    ...p,
    computed: {
      validIso3: whole,
      validCount: whole.length,
      continents: continents.size,
      difficulty: promptDifficulty(whole, deps),
      dataVersion: input.dataVersion,
    },
  };
}

function checkCatalogEntry(
  c: CatalogEntry,
  prompts: Map<string, PromptDef>,
  ports: Map<string, Port>,
  input: ForgeInput,
  issues: Issue[],
): Expedition | null {
  const where = catalogCode(c.catalogNumber);
  const err = (message: string) => issues.push({ level: 'error', where, message });
  const start = ports.get(c.start);
  if (!start) err(`unknown port "${c.start}"`);
  if (c.meridianLon < -180 || c.meridianLon > 175)
    err(`meridian ${c.meridianLon} outside [-180, 175]`);
  const defs = c.legs.map((id) => {
    const p = prompts.get(id);
    if (!p) err(`unknown prompt "${id}"`);
    else if (p.retiredBy) err(`prompt "${id}" is retired (use "${p.retiredBy}")`);
    return p;
  });
  const fallback = c.fallback ? prompts.get(c.fallback) : undefined;
  if (c.fallback && !fallback) err(`unknown fallback prompt "${c.fallback}"`);
  defs.forEach((p, i) => {
    if (!p) return;
    if (p.contextual && i !== 5) err(`leg ${i + 1}: contextual prompts only on leg 6`);
    if (p.contextual && !fallback) err('contextual leg 6 needs a fallback');
    const prev = defs[i - 1];
    if (prev && !p.contextual && !prev.contextual && prev.category === p.category)
      err(`legs ${i} and ${i + 1} share the category "${p.category}"`);
  });
  if (fallback?.contextual) err('the fallback cannot be contextual');
  if (!start || defs.some((p) => !p) || (c.fallback && !fallback)) return null;

  const legs = defs.map((p, i) =>
    freezeLeg(i + 1, p!, i === 5 && p!.contextual ? fallback : undefined),
  );
  const draft = { start, legs, meridianLon: c.meridianLon };
  if (!greedyRoute(draft, input.deps)) err('no valid route: some leg runs out of unused answers');
  for (const m of c.missions) {
    const route = greedyRoute(draft, input.deps, m);
    if (!route || !missionDone(m, route, input.deps))
      err(`mission "${m.id}" not achievable (greedy route search)`);
  }
  const exp: Omit<Expedition, 'hash'> = {
    code: where,
    source: 'catalog',
    catalogNumber: c.catalogNumber,
    title: c.title,
    ...(c.theme ? { theme: c.theme } : {}),
    difficulty: c.difficulty,
    libraryVersion: input.libraryVersion,
    start,
    meridianLon: c.meridianLon,
    legs,
    missions: c.missions,
    dataVersion: input.dataVersion,
  };
  return { ...exp, hash: expeditionHash(exp) };
}

export function forge(input: ForgeInput): ForgeOutput {
  const issues: Issue[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ level: 'error', where: id, message: `duplicate ${kind} id` });
      seen.add(id);
    }
  };
  dup(
    'prompt',
    input.prompts.map((p) => p.id),
  );
  dup(
    'port',
    input.ports.map((p) => p.id),
  );
  dup(
    'catalogue',
    input.catalog.map((c) => catalogCode(c.catalogNumber)),
  );

  const prompts = input.prompts.map((p) => checkPrompt(p, input, issues));
  const byId = new Map(prompts.map((p) => [p.id, p]));
  for (const p of prompts)
    if (p.retiredBy && !byId.has(p.retiredBy))
      issues.push({
        level: 'error',
        where: p.id,
        message: `retiredBy "${p.retiredBy}" does not exist`,
      });

  for (const port of input.ports) {
    if (!input.deps.entities.has(port.iso3))
      issues.push({
        level: 'error',
        where: port.id,
        message: `port in non-playable "${port.iso3}"`,
      });
  }

  const portsById = new Map(input.ports.map((p) => [p.id, p]));
  const expeditions = [...input.catalog]
    .sort((a, b) => a.catalogNumber - b.catalogNumber)
    .map((c) => checkCatalogEntry(c, byId, portsById, input, issues))
    .filter((e): e is Expedition => !!e);

  return {
    library: {
      libraryVersion: input.libraryVersion,
      dataVersion: input.dataVersion,
      prompts,
      ports: [...input.ports],
    },
    expeditions,
    issues,
  };
}

/** Sanity helper for content authors: the answers of a prompt for a given previous camp. */
export function answersFrom(p: PromptDef, prevIso3: string, deps: EngineDeps): string[] {
  const e = deps.entities.get(prevIso3)!;
  const ctx = { prevIso3, prevLonLat: e.aimPoint, portLonLat: e.aimPoint, locale: 'en' as const };
  return [...deps.entities.keys()]
    .filter((c) => c !== prevIso3 && evaluate(p.predicate, c, deps, ctx))
    .sort();
}
