/**
 * Performance budgets (architecture §8, development-plan 3.7) — run after `pnpm build`:
 *   pnpm budgets
 *
 * - Initial JS: entry module(s) and modulepreloads referenced by dist/index.html, gzipped.
 * - Initial geo: world-110m + micro-10m + entities (what the map loads before first paint).
 *
 * Sizes are gzip (zlib default level, as reported by Vite) in kB of 1000 bytes. Exits 1 when a
 * budget is exceeded or an expected file is missing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../dist'));
const KB = 1000;

export const BUDGETS = { initialJsGz: 180 * KB, initialGeoGz: 80 * KB } as const;
const GEO_INITIAL = [
  /^world-110m\.topo-[\w-]+\.json$/,
  /^micro-10m\.topo-[\w-]+\.json$/,
  /^entities-[\w-]+\.json$/,
];

const gz = (file: string) => gzipSync(readFileSync(file)).length;
const fmt = (bytes: number) => `${(bytes / KB).toFixed(2)} kB`;

let failed = false;
function report(name: string, files: { name: string; bytes: number }[], budget: number) {
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const ok = total <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: ${fmt(total)} gz / budget ${fmt(budget)} (${((total / budget) * 100).toFixed(1)} %)`,
  );
  for (const f of files) console.log(`       ${f.name.padEnd(48)} ${fmt(f.bytes)}`);
}

// Initial JS: <script type="module" src> and <link rel="modulepreload" href> in the HTML shell.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = [
  ...html.matchAll(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
  ...html.matchAll(/<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
].map((m) => m[1]!);
if (scripts.length === 0) {
  console.error(`FAIL no module script found in ${join(dist, 'index.html')}`);
  process.exit(1);
}
report(
  'initial JS',
  [...new Set(scripts)].map((src) => ({
    name: src,
    bytes: gz(join(dist, src.replace(/^\//, ''))),
  })),
  BUDGETS.initialJsGz,
);

const assets = readdirSync(join(dist, 'assets'));
const geo = GEO_INITIAL.map((pattern) => {
  const name = assets.find((a) => pattern.test(a));
  if (!name) {
    console.error(`FAIL initial geo file ${pattern} not found in ${join(dist, 'assets')}`);
    process.exit(1);
  }
  return { name: `/assets/${name}`, bytes: gz(join(dist, 'assets', name)) };
});
report('initial geo', geo, BUDGETS.initialGeoGz);

process.exit(failed ? 1 : 0);
