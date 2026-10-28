import type { Difficulty } from '@meridian/content-schema';

/**
 * Expedition codes (data-model §4.1).
 *   MER-NNNN     catalogue
 *   MER-<9 ch.>  generated: Crockford base32 of seed (30 bits) | difficulty (2) | libraryVersion (8),
 *                then one check character (position-weighted sum mod 31) that catches any mistyped or swapped
 *                character, except a 0↔Z confusion (difference of 31).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'expert'];

export type DecodedCode =
  | { source: 'catalog'; catalogNumber: number }
  | { source: 'generated'; seed: number; difficulty: Difficulty; libraryVersion: number };

const checkChar = (payload: string) => {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum += (i + 1) * ALPHABET.indexOf(payload[i]!);
  return ALPHABET[sum % 31]!;
};

export function catalogCode(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw new RangeError(`catalog number ${n}`);
  return `MER-${String(n).padStart(4, '0')}`;
}

export function encodeGeneratedCode(
  seed: number,
  difficulty: Difficulty,
  libraryVersion: number,
): string {
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 30) throw new RangeError(`seed ${seed}`);
  if (!Number.isInteger(libraryVersion) || libraryVersion < 1 || libraryVersion > 255)
    throw new RangeError(`libraryVersion ${libraryVersion}`);
  // 40 bits = 8 base32 characters; split to stay within 32-bit integer arithmetic.
  const hi = seed >>> 10; // 20 bits
  const lo = ((seed & 0x3ff) << 10) | (DIFFICULTIES.indexOf(difficulty) << 8) | libraryVersion;
  let payload = '';
  for (const word of [hi, lo])
    for (let s = 15; s >= 0; s -= 5) payload += ALPHABET[(word >>> s) & 31];
  return `MER-${payload}${checkChar(payload)}`;
}

/** Normalises user input (case, O→0, I/L→1, spaces, dashes) and decodes; null if invalid. */
export function decodeCode(input: string): DecodedCode | null {
  const s = input
    .trim()
    .toUpperCase()
    .replace(/[\s_]/g, '')
    .replace(/^MER-?/, '')
    .replace(/-/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (/^\d{4}$/.test(s)) {
    const n = Number(s);
    return n >= 1 ? { source: 'catalog', catalogNumber: n } : null;
  }
  if (s.length !== 9 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  const payload = s.slice(0, 8);
  if (checkChar(payload) !== s[8]) return null;
  const word = (part: string) => [...part].reduce((v, c) => (v << 5) | ALPHABET.indexOf(c), 0);
  const hi = word(payload.slice(0, 4));
  const lo = word(payload.slice(4));
  const d = (lo >>> 8) & 3;
  const libraryVersion = lo & 0xff;
  if (d > 2 || libraryVersion < 1) return null;
  return {
    source: 'generated',
    seed: (hi << 10) | (lo >>> 10),
    difficulty: DIFFICULTIES[d]!,
    libraryVersion,
  };
}

/** Canonical form of any accepted code ('mer-7kq2…' → 'MER-7KQ2…'), or null. */
export function normaliseCode(input: string): string | null {
  const d = decodeCode(input);
  if (!d) return null;
  return d.source === 'catalog'
    ? catalogCode(d.catalogNumber)
    : encodeGeneratedCode(d.seed, d.difficulty, d.libraryVersion);
}
