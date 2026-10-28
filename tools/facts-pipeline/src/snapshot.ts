/**
 * Online step: fetches the facts Meridian needs from Wikidata (CC0) and writes a normalised,
 * dated snapshot to content/facts/wikidata-snapshot.json. The build step only reads that file,
 * so content builds are reproducible offline.
 *
 *   pnpm --filter @meridian/facts-pipeline snapshot
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntitiesFile } from '@meridian/content-schema';
import type { SnapshotCountry } from './snapshot-types';
import { itemIds, label, latestQuantity, Wikidata } from './wikidata';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const wd = new Wikidata(resolve(here, '../.cache/wikidata'));

const { entities } = JSON.parse(
  readFileSync(resolve(root, 'content/geo/entities.json'), 'utf8'),
) as EntitiesFile;
const isos = entities.map((e) => e.iso3);

// Checked against the item labels: Q13196750 = left, Q14565199 = right.
const DRIVING: Record<string, 'left' | 'right'> = { Q13196750: 'left', Q14565199: 'right' };
const FOOT = 'Q3710';

async function main() {
  // 1. ISO 3166-1 alpha-3 → item (the item with most sitelinks wins, e.g. State of Palestine).
  const rows = await wd.sparql(
    `SELECT ?item ?iso ?sitelinks WHERE { VALUES ?iso { ${isos.map((i) => `"${i}"`).join(' ')} } ?item wdt:P298 ?iso ; wikibase:sitelinks ?sitelinks . }`,
  );
  const qidOf = new Map<string, { qid: string; sitelinks: number }>();
  for (const r of rows) {
    const qid = r.item!.value.split('/').pop()!;
    const sitelinks = Number(r.sitelinks!.value);
    const iso = r.iso!.value;
    if (!qidOf.has(iso) || qidOf.get(iso)!.sitelinks < sitelinks)
      qidOf.set(iso, { qid, sitelinks });
  }
  const missing = isos.filter((i) => !qidOf.has(i));
  if (missing.length) throw new Error(`No Wikidata item for ${missing.join(', ')}`);

  // 2. Country items.
  const countries = await wd.entities([...qidOf.values()].map((v) => v.qid));

  // 3. Referenced items: highest points, flags, languages, currencies, organisations.
  const refs = { hp: [] as string[], flag: [] as string[], other: [] as string[] };
  for (const e of countries.values()) {
    refs.hp.push(...itemIds(e.claims?.P610));
    refs.flag.push(...itemIds(e.claims?.P163));
    refs.other.push(
      ...itemIds(e.claims?.P37),
      ...itemIds(e.claims?.P38),
      ...itemIds(e.claims?.P463),
    );
  }
  const highPoints = await wd.entities(refs.hp, 'labels|claims');
  const flags = await wd.entities(refs.flag, 'claims');
  const colourIds = [...flags.values()].flatMap((f) => itemIds(f.claims?.P462));
  const labelled = await wd.entities([...refs.other, ...colourIds], 'labels');

  // 4. UNESCO World Heritage Sites per country: distinct official site IDs (P757), without the
  // component IDs ("1234-001"), so that a site counts once however many items describe it.
  const unesco = await wd.sparql(
    `SELECT ?item (COUNT(DISTINCT ?id) AS ?n) WHERE { ?site wdt:P757 ?id ; wdt:P17 ?item . FILTER(!CONTAINS(STR(?id), "-")) } GROUP BY ?item`,
  );
  const unescoByQid = new Map(
    unesco.map((r) => [r.item!.value.split('/').pop()!, Number(r.n!.value)]),
  );

  const out: Record<string, SnapshotCountry> = {};
  for (const iso of isos) {
    const { qid, sitelinks } = qidOf.get(iso)!;
    const e = countries.get(qid);
    if (!e) throw new Error(`No entity for ${iso} (${qid}); got ${countries.size} entities`);
    const c = e.claims ?? {};
    const pop = latestQuantity(c.P1082);
    const hpId = itemIds(c.P610)[0];
    const hp = hpId ? highPoints.get(hpId) : undefined;
    const elev = latestQuantity(hp?.claims?.P2044);
    const sides = itemIds(c.P1622)
      .map((q) => DRIVING[q])
      .filter(Boolean);
    out[iso] = {
      qid,
      sitelinks,
      population: pop ? { value: Math.round(pop.amount), year: pop.year } : null,
      drivingSide: sides.length === 1 ? sides[0]! : null,
      highestPoint:
        hpId && elev
          ? {
              qid: hpId,
              label: label(hp),
              elevationM: Math.round(elev.unit === FOOT ? elev.amount * 0.3048 : elev.amount),
            }
          : null,
      currencies: itemIds(c.P38).map((q) => `${q}:${label(labelled.get(q))}`),
      languages: itemIds(c.P37).map((q) => `${q}:${label(labelled.get(q))}`),
      memberOf: itemIds(c.P463),
      flagColors: [
        ...new Set(
          itemIds(c.P163).flatMap((f) =>
            itemIds(flags.get(f)?.claims?.P462).map((q) => label(labelled.get(q)).toLowerCase()),
          ),
        ),
      ].sort(),
      unescoSites: unescoByQid.get(qid) ?? 0,
    };
  }

  // Notoriety measured on another item where the ISO item is not the one people know (NLD).
  const curated = JSON.parse(readFileSync(resolve(root, 'content/facts/curated.json'), 'utf8')) as {
    salienceItem?: Record<string, { qid: string }>;
  };
  const salienceItems = Object.entries(curated.salienceItem ?? {}).filter(
    ([k]) => !k.startsWith('$'),
  );
  const salienceEntities = await wd.entities(
    salienceItems.map(([, v]) => v.qid),
    'sitelinks',
  );
  for (const [iso, { qid }] of salienceItems) {
    out[iso]!.sitelinks = Object.keys(salienceEntities.get(qid)?.sitelinks ?? {}).length;
    out[iso]!.sitelinksQid = qid;
  }

  const snapshot = {
    source: 'Wikidata (CC0)',
    retrieved: new Date().toISOString().slice(0, 10),
    countries: out,
  };
  writeFileSync(
    resolve(root, 'content/facts/wikidata-snapshot.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  // Coverage report for review.
  const cov = (f: (s: SnapshotCountry) => boolean) => isos.filter((i) => f(out[i]!)).length;
  console.log(`snapshot ${snapshot.retrieved}: ${isos.length} countries`);
  console.log(
    `  population ${cov((s) => !!s.population)}, driving ${cov((s) => !!s.drivingSide)}, highest ${cov((s) => !!s.highestPoint)}`,
  );
  console.log(
    `  currencies ${cov((s) => s.currencies.length > 0)}, languages ${cov((s) => s.languages.length > 0)}`,
  );
  console.log(
    `  flagColors ${cov((s) => s.flagColors.length > 0)}, unesco>0 ${cov((s) => s.unescoSites > 0)}`,
  );
}

await main();
