import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UA = 'MeridianGeoGame/0.1 (https://github.com/fs0ciety7000/meridian)';
const API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';

export interface Claim {
  mainsnak: { snaktype: string; datavalue?: { value: unknown } };
  rank: 'preferred' | 'normal' | 'deprecated';
  qualifiers?: Record<string, { datavalue?: { value: unknown } }[]>;
}

export interface WdEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Wikidata {
  constructor(private cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
  }

  private async cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const file = resolve(this.cacheDir, `${createHash('sha1').update(key).digest('hex')}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
    const value = await fetcher();
    writeFileSync(file, JSON.stringify(value));
    return value;
  }

  private async get(url: string, attempt = 0): Promise<unknown> {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 429 && attempt < 6) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 65_000;
      console.log(`  rate-limited, waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
      return this.get(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
    return res.json();
  }

  /**
   * wbgetentities in batches of up to 50, cached on disk. Country items are large: a batch
   * the API truncates (12 MB limit) is split in two and never cached.
   */
  async entities(ids: string[], props = 'labels|claims|sitelinks'): Promise<Map<string, WdEntity>> {
    const out = new Map<string, WdEntity>();
    const unique = [...new Set(ids)].sort();
    for (let i = 0; i < unique.length; i += 50)
      await this.batch(unique.slice(i, i + 50), props, out);
    return out;
  }

  private async batch(batch: string[], props: string, out: Map<string, WdEntity>): Promise<void> {
    const url = `${API}?action=wbgetentities&format=json&languages=en|fr&props=${props}&ids=${batch.join('|')}`;
    const file = resolve(this.cacheDir, `${createHash('sha1').update(url).digest('hex')}.json`);
    type Response = { entities: Record<string, WdEntity>; warnings?: unknown };
    let data: Response;
    if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8')) as Response;
    else {
      await sleep(300);
      data = (await this.get(url)) as Response;
      if (JSON.stringify(data.warnings ?? '').includes('truncated')) {
        if (batch.length === 1)
          throw new Error(`Entity ${batch[0]} exceeds the API response limit`);
        const half = Math.ceil(batch.length / 2);
        await this.batch(batch.slice(0, half), props, out);
        await this.batch(batch.slice(half), props, out);
        return;
      }
      writeFileSync(file, JSON.stringify(data));
    }
    for (const [id, e] of Object.entries(data.entities)) out.set(id, e);
  }

  async sparql(query: string): Promise<Record<string, { value: string }>[]> {
    const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
    const data = (await this.cached(url, () => this.get(url))) as {
      results: { bindings: Record<string, { value: string }>[] };
    };
    return data.results.bindings;
  }
}

// ── Claim helpers ─────────────────────────────────────────────────────────────

const ended = (c: Claim) => !!c.qualifiers?.P582?.length;
const live = (claims: Claim[] | undefined) =>
  (claims ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak.snaktype === 'value');

/** Current values: preferred rank if any, else normal; claims with an end time (P582) are dropped. */
export function current(claims: Claim[] | undefined): Claim[] {
  const valid = live(claims).filter((c) => !ended(c));
  const preferred = valid.filter((c) => c.rank === 'preferred');
  return preferred.length ? preferred : valid;
}

export const itemIds = (claims: Claim[] | undefined) =>
  current(claims).map((c) => (c.mainsnak.datavalue!.value as { id: string }).id);

const pointInTime = (c: Claim) => {
  const t = (c.qualifiers?.P585?.[0]?.datavalue?.value as { time?: string } | undefined)?.time;
  return t ? Number(t.slice(1, 5)) : 0;
};

/** Latest quantity (by point in time, P585) among the current claims. */
export function latestQuantity(
  claims: Claim[] | undefined,
): { amount: number; unit: string; year: number } | null {
  const best = [...current(claims)].sort((a, b) => pointInTime(b) - pointInTime(a))[0];
  if (!best) return null;
  const v = best.mainsnak.datavalue!.value as { amount: string; unit: string };
  return {
    amount: Number(v.amount),
    unit: v.unit.split('/').pop() ?? '1',
    year: pointInTime(best),
  };
}

export const label = (e: WdEntity | undefined, lang = 'en') =>
  e?.labels?.[lang]?.value ?? e?.labels?.en?.value ?? '';
