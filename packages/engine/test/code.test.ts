import { describe, expect, it } from 'vitest';
import { ExpeditionCode } from '@meridian/content-schema';
import {
  catalogCode,
  decodeCode,
  encodeGeneratedCode,
  mulberry32,
  normaliseCode,
} from '../src/index';

describe('expedition codes', () => {
  it('formats catalogue codes', () => {
    expect(catalogCode(42)).toBe('MER-0042');
    expect(decodeCode('mer-0042')).toEqual({ source: 'catalog', catalogNumber: 42 });
  });

  it('round-trips generated codes losslessly', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const seed = Math.floor(rand() * 2 ** 30);
      const difficulty = (['easy', 'normal', 'expert'] as const)[i % 3]!;
      const lib = 1 + Math.floor(rand() * 255);
      const code = encodeGeneratedCode(seed, difficulty, lib);
      expect(ExpeditionCode.safeParse(code).success).toBe(true);
      expect(decodeCode(code)).toEqual({
        source: 'generated',
        seed,
        difficulty,
        libraryVersion: lib,
      });
    }
  });

  it('accepts lower case, O for 0, I/L for 1 and stray separators', () => {
    const code = encodeGeneratedCode(1_000_001, 'normal', 3);
    const sloppy = ` ${code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l')} `;
    expect(normaliseCode(sloppy)).toBe(code);
  });

  it('rejects any single mistyped or swapped character', () => {
    const code = encodeGeneratedCode(123_456_789, 'expert', 9);
    const body = code.slice(4);
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let caught = 0;
    let total = 0;
    for (let i = 0; i < body.length; i++)
      for (const c of alphabet) {
        if (c === body[i]) continue;
        total++;
        if (decodeCode(body.slice(0, i) + c + body.slice(i + 1)) === null) caught++;
      }
    // Only a 0↔Z substitution (difference 31) can slip through the mod-31 check.
    expect(caught / total).toBeGreaterThan(0.99);
    for (let i = 0; i + 1 < body.length; i++) {
      if (body[i] === body[i + 1]) continue;
      const swapped = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      expect(decodeCode(swapped)).toBeNull();
    }
  });

  it('rejects garbage', () => {
    for (const s of ['', 'MER-', 'MER-0000', 'MER-ABC', 'MER-UUUUUUUUU', 'hello'])
      expect(decodeCode(s)).toBeNull();
  });
});
