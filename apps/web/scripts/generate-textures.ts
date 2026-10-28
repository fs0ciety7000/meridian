/**
 * Generates the seamless paper and grain textures (design-system §4) deterministically.
 * These are procedural placeholders the Art Director can replace with scanned material;
 * the budget stays the same: paper ≤ 80 KB (AVIF), grain as small as possible.
 *
 * Usage: pnpm --filter @meridian/web textures
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/textures');

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise: the lattice wraps, so the tile is seamless. */
function periodicNoise(size: number, cells: number, rand: () => number): Float32Array {
  const lattice = Array.from({ length: cells * cells }, rand);
  const at = (x: number, y: number) =>
    lattice[((y + cells) % cells) * cells + ((x + cells) % cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const sx = smooth(fx - x0);
      const sy = smooth(fy - y0);
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      out[y * size + x] = top * (1 - sy) + bottom * sy;
    }
  }
  return out;
}

function fbm(
  size: number,
  rand: () => number,
  octaves: [cells: number, weight: number][],
): Float32Array {
  const out = new Float32Array(size * size);
  const total = octaves.reduce((s, [, w]) => s + w, 0);
  for (const [cells, weight] of octaves) {
    const layer = periodicNoise(size, cells, rand);
    for (let i = 0; i < out.length; i++) out[i]! += (layer[i]! * weight) / total;
  }
  return out;
}

/** Laid-paper texture: soft cloudiness + chain/laid lines + a few fibres, warm grey. */
async function paper(size = 512) {
  const rand = mulberry32(0x6d65726964);
  const cloud = fbm(size, rand, [
    [4, 1],
    [8, 0.6],
    [32, 0.35],
    [128, 0.25],
  ]);
  const shade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const laid = 0.5 + 0.5 * Math.cos((y / size) * Math.PI * 2 * 96);
    for (let x = 0; x < size; x++) {
      const chain = Math.exp(-(((x % 128) - 64) ** 2) / 6);
      const i = y * size + x;
      shade[i] = (cloud[i]! - 0.5) * 0.09 + laid * 0.012 + chain * 0.018;
    }
  }
  for (let f = 0; f < 90; f++) {
    let x = rand() * size;
    let y = rand() * size;
    let angle = rand() * Math.PI * 2;
    const length = 8 + rand() * 30;
    const depth = 0.012 + rand() * 0.02;
    for (let s = 0; s < length; s++) {
      angle += (rand() - 0.5) * 0.35;
      x += Math.cos(angle);
      y += Math.sin(angle);
      const i =
        (((Math.round(y) % size) + size) % size) * size + (((Math.round(x) % size) + size) % size);
      shade[i]! += depth;
    }
  }
  // Multiplied over the base colour: white = no change, so keep values near 1.
  const data = Buffer.alloc(size * size * 3);
  for (let i = 0; i < shade.length; i++) {
    const v = Math.max(0, Math.min(1, 0.955 - shade[i]!));
    data[i * 3] = Math.round(255 * v);
    data[i * 3 + 1] = Math.round(255 * (v - 0.006));
    data[i * 3 + 2] = Math.round(255 * (v - 0.02));
  }
  const img = sharp(data, { raw: { width: size, height: size, channels: 3 } });
  await img.clone().avif({ quality: 55, effort: 9 }).toFile(`${outDir}/paper.avif`);
  await img.clone().webp({ quality: 72 }).toFile(`${outDir}/paper.webp`);
}

/** Monochrome film grain, centred on mid-grey for `overlay`/`soft-light` blending. */
async function grain(size = 256) {
  const rand = mulberry32(0x6772616e);
  const data = Buffer.alloc(size * size);
  for (let i = 0; i < data.length; i++) {
    const g = (rand() + rand() + rand()) / 3; // approx. gaussian
    data[i] = Math.round(128 + (g - 0.5) * 120);
  }
  const img = sharp(data, { raw: { width: size, height: size, channels: 1 } });
  await img.clone().avif({ quality: 50, effort: 9 }).toFile(`${outDir}/grain.avif`);
  await img.clone().webp({ quality: 60 }).toFile(`${outDir}/grain.webp`);
}

mkdirSync(outDir, { recursive: true });
await Promise.all([paper(), grain()]);
console.log(`textures written to ${outDir}`);
