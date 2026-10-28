import type { LonLat } from '@meridian/geo';
import { normaliseCode } from './code';

/**
 * Challenge / ghost code (data-model §8): `v2.<expeditionCode>.<legs>`, legs = base64url of
 * 7 bytes per played leg: flags (bit 0: played) + lon×1000 (int24) + lat×1000 (int24).
 * Countries are not encoded: the receiver re-derives them from the points, so a forged code
 * cannot claim an impossible answer, and the score is recomputed, never declared.
 */
export interface SharedRoute {
  code: string;
  picks: LonLat[];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.ceil((Math.min(3, bytes.length - i) * 8) / 6);
    for (let c = 0; c < chars; c++) out += B64[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}

function fromBase64Url(s: string): Uint8Array | null {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let c = 0; c < 4; c++) {
      const v = c < chunk.length ? B64.indexOf(chunk[c]!) : 0;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    const count = Math.floor((chunk.length * 6) / 8);
    for (let b = 0; b < count; b++) bytes.push((n >> (16 - 8 * b)) & 255);
  }
  return new Uint8Array(bytes);
}

const writeInt24 = (b: Uint8Array, o: number, v: number) => {
  const u = v < 0 ? v + 0x1000000 : v;
  b[o] = (u >> 16) & 255;
  b[o + 1] = (u >> 8) & 255;
  b[o + 2] = u & 255;
};
const readInt24 = (b: Uint8Array, o: number) => {
  const u = (b[o]! << 16) | (b[o + 1]! << 8) | b[o + 2]!;
  return u & 0x800000 ? u - 0x1000000 : u;
};

export function encodeShare(code: string, picks: readonly LonLat[]): string {
  const bytes = new Uint8Array(picks.length * 7);
  picks.forEach(([lon, lat], i) => {
    bytes[i * 7] = 1;
    writeInt24(bytes, i * 7 + 1, Math.round(lon * 1000));
    writeInt24(bytes, i * 7 + 4, Math.round(lat * 1000));
  });
  return `v2.${code}.${toBase64Url(bytes)}`;
}

export function decodeShare(share: string): SharedRoute | null {
  const m = /^v2\.(MER-[0-9A-Za-z]+)\.([A-Za-z0-9_-]*)$/.exec(share.trim());
  if (!m) return null;
  const code = normaliseCode(m[1]!);
  const bytes = fromBase64Url(m[2]!);
  if (!code || !bytes || bytes.length % 7 !== 0 || bytes.length > 6 * 7) return null;
  const picks: LonLat[] = [];
  for (let o = 0; o < bytes.length; o += 7) {
    if (!(bytes[o]! & 1)) return null;
    const lon = readInt24(bytes, o + 1) / 1000;
    const lat = readInt24(bytes, o + 4) / 1000;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    picks.push([lon, lat]);
  }
  return { code, picks };
}
