import { z } from 'zod';
import { ContinentCode, Iso3, LonLat } from './primitives';

/** Player-facing text, always in both languages (data-model §conventions). */
export const I18nText = z.object({ fr: z.string().min(1), en: z.string().min(1) });
export type I18nText = z.infer<typeof I18nText>;

// ── Facts (data-model §3.1–3.2) ─────────────────────────────────────────────────

export const PromptCategory = z.enum([
  'relief',
  'water',
  'borders',
  'climate',
  'society',
  'flag',
  'position',
]);
export type PromptCategory = z.infer<typeof PromptCategory>;

export const FactValue = z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]);
export type FactValue = z.infer<typeof FactValue>;

export const FactDef = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  type: z.enum(['boolean', 'number', 'enum', 'set']),
  unit: z.string().optional(),
  category: PromptCategory,
  /** True when the value depends on whether overseas territories are counted: never usable in a prompt. */
  territorySensitive: z.boolean(),
  /** How the value is obtained (wikidata snapshot, computed from the geometry, curated list). */
  origin: z.enum(['wikidata', 'geometry', 'curated']),
  description: I18nText,
});
export type FactDef = z.infer<typeof FactDef>;

export const FactSource = z.object({ ref: z.string().min(1), retrieved: z.string() });

export const CountryFacts = z.object({
  iso3: Iso3,
  /** Whole sovereign state (overseas parts included: they count for their state). */
  facts: z.record(z.string(), FactValue),
  /**
   * Geometric facts recomputed on the metropolitan parts only, when they differ. A prompt whose
   * answer set changes between the two readings is ambiguous and rejected by prompt-forge.
   */
  metro: z.record(z.string(), FactValue),
  sources: z.record(z.string(), FactSource),
  /** 0–1 notoriety (Wikidata sitelinks percentile): the rarity prior (gameplay-systems §6.3). */
  salience: z.number().min(0).max(1),
});
export type CountryFacts = z.infer<typeof CountryFacts>;

export const FactsFile = z.object({
  dataVersion: z.string(),
  defs: z.array(FactDef),
  countries: z.array(CountryFacts),
});
export type FactsFile = z.infer<typeof FactsFile>;

// ── Predicates (data-model §3.3): data, never code ─────────────────────────────

export const ContextRule = z.discriminatedUnion('rule', [
  z.object({ rule: z.literal('neighborOf') }),
  z.object({ rule: z.literal('otherHemisphere'), axis: z.enum(['NS', 'EW']) }),
  z.object({ rule: z.literal('sameContinent') }),
  z.object({ rule: z.literal('otherContinent') }),
  z.object({ rule: z.literal('closerToPort') }),
  z.object({ rule: z.literal('sameInitial') }),
]);
export type ContextRule = z.infer<typeof ContextRule>;

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { fact: string; eq: boolean | number | string }
  | { fact: string; gt?: number; gte?: number; lt?: number; lte?: number }
  | { fact: string; includes: string }
  | { fact: string; in: string[] }
  | { ctx: ContextRule };

export const Predicate: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(Predicate).min(1) }).strict(),
    z.object({ any: z.array(Predicate).min(1) }).strict(),
    z.object({ not: Predicate }).strict(),
    z.object({ fact: z.string(), eq: z.union([z.boolean(), z.number(), z.string()]) }).strict(),
    z
      .object({
        fact: z.string(),
        gt: z.number().optional(),
        gte: z.number().optional(),
        lt: z.number().optional(),
        lte: z.number().optional(),
      })
      .strict()
      .refine(
        (p) =>
          p.gt !== undefined || p.gte !== undefined || p.lt !== undefined || p.lte !== undefined,
        'empty comparison',
      ),
    z.object({ fact: z.string(), includes: z.string() }).strict(),
    z.object({ fact: z.string(), in: z.array(z.string()).min(1) }).strict(),
    z.object({ ctx: ContextRule }).strict(),
  ]),
) as z.ZodType<Predicate>;

// ── Prompts, ports, missions (data-model §3.4, §4) ──────────────────────────────

export const PromptComputed = z.object({
  validIso3: z.array(Iso3),
  validCount: z.number().int(),
  continents: z.number().int(),
  /** 0 (easy) … 1 (hard), computed by prompt-forge. */
  difficulty: z.number().min(0).max(1),
  dataVersion: z.string(),
});

export const PromptDef = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/),
  category: PromptCategory,
  text: I18nText,
  /** Educational note shown on a false trail. */
  explain: I18nText,
  predicate: Predicate,
  regional: z.array(ContinentCode).optional(),
  /** Contextual prompts only: the fallback prompt id when no answer exists. */
  contextual: z.boolean().optional(),
  retiredBy: z.string().optional(),
  computed: PromptComputed.optional(),
});
export type PromptDef = z.infer<typeof PromptDef>;

export const Port = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: I18nText,
  iso3: Iso3,
  lonLat: LonLat,
});
export type Port = z.infer<typeof Port>;

export const MissionId = z.enum([
  'continentHopper',
  'equatorShuttle',
  'southernSoul',
  'northernSoul',
  'longHaul',
  'noFalseTrail',
  'meridianWeaver',
]);
export type MissionId = z.infer<typeof MissionId>;

export const MissionDef = z.object({
  id: MissionId,
  params: z.record(z.string(), z.number()).optional(),
});
export type MissionDef = z.infer<typeof MissionDef>;

export const Difficulty = z.enum(['easy', 'normal', 'expert']);
export type Difficulty = z.infer<typeof Difficulty>;

export const LegDef = z.object({
  index: z.number().int().min(1).max(6),
  promptId: z.string(),
  /** Frozen copy of the prompt at publication time. */
  predicate: Predicate,
  text: I18nText,
  explain: I18nText,
  fallback: z
    .object({ promptId: z.string(), predicate: Predicate, text: I18nText, explain: I18nText })
    .optional(),
});
export type LegDef = z.infer<typeof LegDef>;

export const ExpeditionCode = z.string().regex(/^MER-[0-9A-HJKMNP-TV-Z]{4,9}$/);

export const Expedition = z.object({
  code: ExpeditionCode,
  source: z.enum(['catalog', 'generated']),
  catalogNumber: z.number().int().positive().optional(),
  title: I18nText.optional(),
  theme: z.string().optional(),
  seed: z.number().int().nonnegative().optional(),
  difficulty: Difficulty,
  libraryVersion: z.number().int().positive(),
  start: Port,
  meridianLon: z.number().int().min(-180).max(175).multipleOf(5),
  legs: z.array(LegDef).length(6),
  missions: z.array(MissionDef).max(3),
  dataVersion: z.string(),
  hash: z.string(),
});
export type Expedition = z.infer<typeof Expedition>;

/** A hand-written catalogue entry, before the forge freezes predicates and computes the hash. */
export const CatalogEntry = z.object({
  catalogNumber: z.number().int().positive(),
  title: I18nText,
  theme: z.string().optional(),
  difficulty: Difficulty,
  start: z.string(), // port id
  meridianLon: z.number().int().multipleOf(5),
  legs: z.array(z.string()).length(6), // prompt ids
  /** Required when leg 6 is contextual: the prompt used when the context leaves no answer. */
  fallback: z.string().optional(),
  missions: z.array(MissionDef).max(3),
  designNote: z.string().optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;

export const PromptLibrary = z.object({
  libraryVersion: z.number().int().positive(),
  /** Facts version the `computed` blocks were derived from. */
  dataVersion: z.string(),
  prompts: z.array(PromptDef),
  ports: z.array(Port),
});
export type PromptLibrary = z.infer<typeof PromptLibrary>;

/** Hand-edited sources of the library (prompt-forge adds `computed` and merges them). */
export const PromptsSource = z.object({
  libraryVersion: z.number().int().positive(),
  prompts: z.array(PromptDef.omit({ computed: true }).strict()),
});
export type PromptsSource = z.infer<typeof PromptsSource>;

export const PortsSource = z.object({ ports: z.array(Port) });
export type PortsSource = z.infer<typeof PortsSource>;

/** Built catalogue: every entry frozen into a full Expedition. */
export const CatalogFile = z.object({
  libraryVersion: z.number().int().positive(),
  dataVersion: z.string(),
  expeditions: z.array(Expedition),
});
export type CatalogFile = z.infer<typeof CatalogFile>;
