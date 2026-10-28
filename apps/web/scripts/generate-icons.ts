/**
 * App icons for the web manifest, rendered from the compass favicon (run once:
 * `pnpm --filter @meridian/web icons`; the PNGs are committed in public/icons).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/icons');
mkdirSync(out, { recursive: true });
const svg = readFileSync(resolve(here, '../public/favicon.svg'));

// Maskable icons keep the motif inside the 80 % safe zone on a paper background.
const maskable = (size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#F7F1E5"/><image href="data:image/svg+xml;base64,${svg.toString('base64')}" x="${size * 0.12}" y="${size * 0.12}" width="${size * 0.76}" height="${size * 0.76}"/></svg>`,
  );

for (const size of [192, 512]) {
  await sharp(svg, { density: 600 }).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
  await sharp(maskable(size)).png().toFile(`${out}/maskable-${size}.png`);
}
await sharp(svg, { density: 600 })
  .resize(180, 180)
  .flatten({ background: '#F7F1E5' })
  .png()
  .toFile(`${out}/apple-touch-icon.png`);
console.log('icons written to public/icons');
