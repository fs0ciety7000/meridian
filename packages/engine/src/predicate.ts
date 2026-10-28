import type {
  ContextRule,
  CountryFacts,
  PlayableEntity,
  Predicate,
} from '@meridian/content-schema';
import { haversineKm, type LonLat } from '@meridian/geo';
import type { EngineDeps, FactsRecord, LegContext } from './types';

/**
 * The facts a predicate reads. `whole` counts overseas parts for their state (the rule of the
 * game); `metro` overlays the metropolitan values — prompt-forge rejects prompts whose answer set
 * differs between the two readings, so the engine always validates on `whole`.
 */
export function readFacts(cf: CountryFacts, reading: 'whole' | 'metro' = 'whole'): FactsRecord {
  return reading === 'whole' ? cf.facts : { ...cf.facts, ...cf.metro };
}

/** Facts referenced by a predicate (prompt-forge: sources, territorySensitive, coverage). */
export function factsUsed(p: Predicate, out = new Set<string>()): Set<string> {
  if ('all' in p) p.all.forEach((q) => factsUsed(q, out));
  else if ('any' in p) p.any.forEach((q) => factsUsed(q, out));
  else if ('not' in p) factsUsed(p.not, out);
  else if ('fact' in p) out.add(p.fact);
  return out;
}

export function isContextual(p: Predicate): boolean {
  if ('all' in p) return p.all.some(isContextual);
  if ('any' in p) return p.any.some(isContextual);
  if ('not' in p) return isContextual(p.not);
  return 'ctx' in p;
}

const initial = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(the|l'|le |la |les )/i, '')
    .trim()
    .charAt(0)
    .toUpperCase();

function evalContext(
  rule: ContextRule,
  entity: PlayableEntity,
  ctx: LegContext,
  deps: EngineDeps,
): boolean {
  // Point rules use the planted point; a country as a whole is judged by its aim point.
  const at: LonLat = ctx.pick ?? entity.aimPoint;
  const prev = deps.entities.get(ctx.prevIso3);
  switch (rule.rule) {
    case 'neighborOf':
      return entity.neighbors.includes(ctx.prevIso3);
    case 'otherHemisphere': {
      const axis = rule.axis === 'NS' ? 1 : 0;
      const a = Math.sign(at[axis]);
      const b = Math.sign(ctx.prevLonLat[axis]);
      return a !== 0 && b !== 0 && a !== b;
    }
    case 'sameContinent':
      return !!prev && entity.continent === prev.continent;
    case 'otherContinent':
      return !!prev && entity.continent !== prev.continent;
    case 'closerToPort':
      return haversineKm(at, ctx.portLonLat) < haversineKm(ctx.prevLonLat, ctx.portLonLat);
    case 'sameInitial': {
      if (!deps.nameOf) return false;
      return (
        entity.iso3 !== ctx.prevIso3 &&
        initial(deps.nameOf(entity.iso3, ctx.locale)) ===
          initial(deps.nameOf(ctx.prevIso3, ctx.locale))
      );
    }
  }
}

/**
 * Evaluates a declarative predicate (data-model §3.3). A missing fact never matches
 * (prompt-forge refuses prompts that read a fact missing for any entity).
 */
export function evaluate(
  p: Predicate,
  iso3: string,
  deps: EngineDeps,
  ctx?: LegContext,
  facts?: FactsRecord,
): boolean {
  const f = facts ?? deps.facts.get(iso3)?.facts;
  if (!f) return false;
  const rec = (q: Predicate): boolean => evaluate(q, iso3, deps, ctx, f);
  if ('all' in p) return p.all.every(rec);
  if ('any' in p) return p.any.some(rec);
  if ('not' in p) return !rec(p.not);
  if ('ctx' in p) {
    const entity = deps.entities.get(iso3);
    if (!ctx || !entity) return false;
    return evalContext(p.ctx, entity, ctx, deps);
  }
  const v = f[p.fact];
  if (v === undefined) return false;
  if ('eq' in p) return v === p.eq;
  if ('includes' in p) return Array.isArray(v) && v.includes(p.includes);
  if ('in' in p)
    return Array.isArray(v) ? v.some((x) => p.in.includes(x)) : p.in.includes(String(v));
  if (typeof v !== 'number') return false;
  return (
    (p.gt === undefined || v > p.gt) &&
    (p.gte === undefined || v >= p.gte) &&
    (p.lt === undefined || v < p.lt) &&
    (p.lte === undefined || v <= p.lte)
  );
}

/** Every entity satisfying a predicate, sorted (country-level: point rules use aim points). */
export function validSet(
  p: Predicate,
  deps: EngineDeps,
  ctx?: LegContext,
  reading: 'whole' | 'metro' = 'whole',
): string[] {
  const out: string[] = [];
  for (const [iso3, cf] of deps.facts)
    if (deps.entities.has(iso3) && evaluate(p, iso3, deps, ctx, readFacts(cf, reading)))
      out.push(iso3);
  return out.sort();
}
