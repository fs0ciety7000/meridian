/**
 * pnpm forge          validates content/library + content/expeditions and writes
 *                     content/library/library-v<N>.json and content/library/catalog.json
 * pnpm forge:check    same validation; fails if the written files are stale (CI)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CatalogEntry,
  CatalogFile,
  EntitiesFile,
  FactsFile,
  PortsSource,
  PromptLibrary,
  PromptsSource,
} from '@meridian/content-schema';
import { BALANCE, type EngineDeps } from '@meridian/engine';
import { forge } from './forge';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const at = (p: string) => resolve(root, p);
const read = (p: string): unknown => JSON.parse(readFileSync(at(p), 'utf8'));
const check = process.argv.includes('--check');

const facts = FactsFile.parse(read('content/facts/facts.json'));
const { entities } = EntitiesFile.parse(read('content/geo/entities.json'));
const promptsSrc = PromptsSource.parse(read('content/library/prompts.json'));
const portsSrc = PortsSource.parse(read('content/library/ports.json'));
const catalog = existsSync(at('content/expeditions'))
  ? readdirSync(at('content/expeditions'))
      .filter((f) => /^\d{4}\.json$/.test(f))
      .map((f) => CatalogEntry.parse(read(`content/expeditions/${f}`)))
  : [];
const published = existsSync(at('content/library/published.json'))
  ? (read('content/library/published.json') as { published: number[] }).published
  : [];

const names = new Intl.DisplayNames(['en'], { type: 'region' });
const iso2 = new Map(entities.map((e) => [e.iso3, e.iso2]));
const deps: EngineDeps = {
  facts: new Map(facts.countries.map((c) => [c.iso3, c])),
  entities: new Map(entities.map((e) => [e.iso3, e])),
  nameOf: (c) => names.of(iso2.get(c) ?? c) ?? c,
  balance: BALANCE,
};

const out = forge({
  libraryVersion: promptsSrc.libraryVersion,
  dataVersion: facts.dataVersion,
  defs: facts.defs,
  prompts: promptsSrc.prompts,
  ports: portsSrc.ports,
  catalog,
  deps,
});

for (const i of out.issues)
  console[i.level === 'error' ? 'error' : 'warn'](`${i.level} ${i.where}: ${i.message}`);
const errors = out.issues.filter((i) => i.level === 'error').length;

const report = out.library.prompts
  .filter((p) => p.computed)
  .map(
    (p) =>
      `  ${p.id.padEnd(36)} ${String(p.computed!.validCount).padStart(3)} answers  ${p.computed!.continents} cont.  difficulty ${p.computed!.difficulty.toFixed(2)}`,
  );
console.log(
  `library v${out.library.libraryVersion}: ${out.library.prompts.length} prompts, ${out.library.ports.length} ports, ${out.expeditions.length} catalogue expeditions`,
);
if (process.argv.includes('--report')) console.log(report.join('\n'));
if (errors) {
  console.error(`${errors} error(s)`);
  process.exit(1);
}

const files = {
  [`content/library/library-v${out.library.libraryVersion}.json`]: `${JSON.stringify(PromptLibrary.parse(out.library), null, 2)}\n`,
  'content/library/catalog.json': `${JSON.stringify(
    CatalogFile.parse({
      libraryVersion: out.library.libraryVersion,
      dataVersion: facts.dataVersion,
      expeditions: out.expeditions,
    }),
    null,
    2,
  )}\n`,
};
let stale = 0;
for (const [path, content] of Object.entries(files)) {
  const current = existsSync(at(path)) ? readFileSync(at(path), 'utf8') : null;
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${path} (run pnpm forge)`);
    stale++;
  } else if (
    path.includes('library-v') &&
    current &&
    published.includes(out.library.libraryVersion)
  ) {
    // Published libraries are replayed by old codes: they never change. Bump libraryVersion.
    console.error(
      `library v${out.library.libraryVersion} is published: bump libraryVersion in content/library/prompts.json`,
    );
    process.exit(1);
  } else {
    writeFileSync(at(path), content);
    console.log(`wrote ${path}`);
  }
}
if (stale) process.exit(1);
