import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TelemetryEvent } from '@meridian/content-schema';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ServerConfig } from '../src/config';
import { RateLimiter } from '../src/rateLimit';
import { TELEMETRY_DB_FILE, TELEMETRY_REQUESTS_PER_MINUTE } from '../src/telemetry/routes';
import { TelemetryStore, type TelemetrySummary } from '../src/telemetry/store';

const TOKEN = 'test-admin-token-0123456789';

function setup(over: Partial<ServerConfig> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'meridian-telemetry-'));
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    staticDir: mkdtempSync(join(tmpdir(), 'meridian-static-')),
    dataDir,
    version: 'test',
    commit: 'abc',
    telemetryAdminToken: TOKEN,
    ...over,
  };
  return { app: createApp(config), dataDir };
}

let ipCounter = 0;
/** A distinct client per call by default, so tests do not trip the rate limit. */
function post(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request('/api/telemetry', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `203.0.113.${++ipCounter % 250}`,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const summary = (app: ReturnType<typeof createApp>, token = TOKEN) =>
  app.request('/api/telemetry/summary', { headers: { authorization: `Bearer ${token}` } });

const leg = (over: Partial<Extract<TelemetryEvent, { type: 'leg_resolved' }>> = {}) => ({
  type: 'leg_resolved' as const,
  code: 'MER-7KQ2',
  leg: 1,
  promptId: 'geo.landlocked',
  valid: true,
  ms: 10_000,
  provisionalMoves: 2,
  spyglass: false,
  tier: 'trail' as const,
  ...over,
});

const finished = (durationMs: number, code = 'MER-7KQ2') => ({
  type: 'expedition_finished' as const,
  code,
  distanceKm: 12_345.6,
  renown: 420,
  durationMs,
  falseTrails: 1,
  attempt: 'first' as const,
});

const SESSION = 'b7f3c2a1-0d4e-4f5a-9b8c-7d6e5f4a3b2c';

describe('POST /api/telemetry', () => {
  it('stores a valid batch and answers 202 without caching', async () => {
    const { app, dataDir } = setup();
    const res = await post(app, {
      v: 1,
      session: SESSION,
      events: [
        { type: 'expedition_started', code: 'MER-7KQ2', difficulty: 'normal', source: 'catalog' },
        leg(),
        leg({ leg: 2, valid: false, tier: null, promptId: 'geo.island', ms: 30_000 }),
        { type: 'share', code: 'MER-7KQ2', kind: 'clipboard' },
        { type: 'abandoned', code: 'MER-8ABC', leg: 3 },
        { type: 'plant_failed', reason: 'disputed' },
        finished(600_000),
      ],
    });
    expect(res.status).toBe(202);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ accepted: 7, rejected: 0, stored: true });
    expect(existsSync(join(dataDir, TELEMETRY_DB_FILE))).toBe(true);
  });

  it('keeps valid events of a batch and rejects malformed ones individually', async () => {
    const { app } = setup();
    const res = await post(app, {
      v: 1,
      session: SESSION,
      events: [
        leg(),
        leg({ ms: -1 }),
        { type: 'unknown_future_event', code: 'MER-7KQ2' },
        { type: 'plant_failed', reason: 'Free text with a name' },
        { ...leg(), email: 'someone@example.com' },
      ],
    });
    expect(await res.json()).toEqual({ accepted: 2, rejected: 3, stored: true });
    // Unknown keys are stripped by Zod: nothing beyond the schema is ever stored.
    const s = (await (await summary(app)).json()) as TelemetrySummary;
    expect(JSON.stringify(s)).not.toContain('example.com');
  });

  it.each([
    ['not JSON', '{oops', 400, 'invalid_json'],
    ['wrong version', { v: 2, session: SESSION, events: [leg()] }, 400, 'invalid_batch'],
    ['missing session', { v: 1, events: [leg()] }, 400, 'invalid_batch'],
    ['bad session', { v: 1, session: 'x', events: [leg()] }, 400, 'invalid_batch'],
    ['empty batch', { v: 1, session: SESSION, events: [] }, 400, 'invalid_batch'],
    [
      'oversized batch (> 50 events)',
      { v: 1, session: SESSION, events: Array.from({ length: 51 }, () => leg()) },
      400,
      'invalid_batch',
    ],
  ])('rejects %s', async (_name, body, status, error) => {
    const { app } = setup();
    const res = await post(app, body);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('rejects bodies over 32 KB with 413 before parsing', async () => {
    const { app } = setup();
    const res = await post(
      app,
      JSON.stringify({ v: 1, session: SESSION, pad: 'x'.repeat(40_000) }),
    );
    expect(res.status).toBe(413);
  });

  it('rejects cross-origin posts', async () => {
    const { app } = setup();
    const body = { v: 1, session: SESSION, events: [leg()] };
    const evil = await post(app, body, { origin: 'https://evil.example', host: 'meridian.test' });
    expect(evil.status).toBe(403);
    const same = await post(app, body, {
      origin: 'https://meridian.test',
      host: 'meridian.test',
    });
    expect(same.status).toBe(202);
  });

  it('rate-limits per client IP and recovers for other clients', async () => {
    const { app } = setup();
    const body = { v: 1, session: SESSION, events: [leg()] };
    const ip = { 'cf-connecting-ip': '198.51.100.7' };
    for (let i = 0; i < TELEMETRY_REQUESTS_PER_MINUTE; i++) {
      expect((await post(app, body, ip)).status).toBe(202);
    }
    const limited = await post(app, body, ip);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await post(app, body, { 'cf-connecting-ip': '198.51.100.8' })).status).toBe(202);
  });

  it('accepts but drops events when no data volume is configured', async () => {
    const { app } = setup({ dataDir: null });
    const res = await post(app, { v: 1, session: SESSION, events: [leg()] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0, rejected: 0, stored: false });
  });

  it('never stores the client IP', async () => {
    const { app, dataDir } = setup();
    await post(
      app,
      { v: 1, session: SESSION, events: [leg()] },
      { 'cf-connecting-ip': '192.0.2.99' },
    );
    const db = new DatabaseSync(join(dataDir, TELEMETRY_DB_FILE));
    const dump = JSON.stringify(
      db.prepare("select name from sqlite_master where type = 'table'").all(),
    );
    const rows = JSON.stringify(db.prepare('select * from events').all());
    db.close();
    expect(rows).not.toContain('192.0.2.99');
    expect(dump).not.toMatch(/ip|address/i);
  });
});

describe('GET /api/telemetry/summary', () => {
  it('is hidden without a configured token and protected with one', async () => {
    expect((await summary(setup({ telemetryAdminToken: null }).app)).status).toBe(404);
    const { app } = setup();
    expect((await app.request('/api/telemetry/summary')).status).toBe(401);
    const wrong = await summary(app, 'nope');
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toBe('Bearer');
    expect((await summary(app)).status).toBe(200);
  });

  it('reports false-trail rate per prompt, median time per expedition and plant failures', async () => {
    const { app } = setup();
    await post(app, {
      v: 1,
      session: SESSION,
      events: [
        { type: 'expedition_started', code: 'MER-7KQ2', difficulty: 'easy', source: 'generated' },
        { type: 'expedition_started', code: 'MER-7KQ2', difficulty: 'easy', source: 'generated' },
        { type: 'expedition_started', code: 'MER-7KQ2', difficulty: 'easy', source: 'challenge' },
        { type: 'expedition_started', code: 'MER-7KQ2', difficulty: 'easy', source: 'generated' },
        leg({ ms: 1000, spyglass: true, tier: 'incognita' }),
        leg({ ms: 3000, valid: false, tier: null, provisionalMoves: 4 }),
        leg({ ms: 2000, valid: false, tier: null, provisionalMoves: 0 }),
        leg({ ms: 2000, promptId: 'geo.island', tier: 'known' }),
        finished(300_000),
        finished(100_000),
        finished(900_000),
        { type: 'abandoned', code: 'MER-7KQ2', leg: 2 },
        { type: 'plant_failed', reason: 'disputed' },
        { type: 'plant_failed', reason: 'disputed' },
        { type: 'plant_failed', reason: 'sea' },
      ],
    });
    // A second session.
    await post(app, {
      v: 1,
      session: 'a1b2c3d4-0000-4000-8000-000000000000',
      events: [finished(200_000)],
    });

    const s = (await (await summary(app)).json()) as TelemetrySummary;
    expect(s.totals).toMatchObject({ events: 16, sessions: 2 });
    expect(s.prompts).toEqual([
      {
        promptId: 'geo.landlocked',
        n: 3,
        valid: 1,
        falseTrails: 2,
        falseTrailRate: 0.6667,
        meanMs: 2000,
        spyglassRate: 0.3333,
        meanProvisionalMoves: 2,
        tiers: { known: 0, trail: 0, frontier: 0, incognita: 1 },
      },
      {
        promptId: 'geo.island',
        n: 1,
        valid: 1,
        falseTrails: 0,
        falseTrailRate: 0,
        meanMs: 2000,
        spyglassRate: 0,
        meanProvisionalMoves: 2,
        tiers: { known: 1, trail: 0, frontier: 0, incognita: 0 },
      },
    ]);
    expect(s.expeditions).toEqual([
      {
        code: 'MER-7KQ2',
        started: 4,
        finished: 4,
        finishedFirst: 4,
        abandoned: 1,
        shares: 0,
        completionRate: 1,
        medianDurationMs: 250_000,
        meanDurationMs: 375_000,
        meanFalseTrails: 1,
        meanRenown: 420,
        meanDistanceKm: 12_346,
        legFalseTrailRate: 0.5,
      },
    ]);
    expect(s.plantFailed).toEqual({
      total: 3,
      byReason: [
        { reason: 'disputed', n: 2 },
        { reason: 'sea', n: 1 },
      ],
    });

    const filtered = (await (
      await app.request('/api/telemetry/summary?minN=2', {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()) as TelemetrySummary;
    expect(filtered.prompts.map((p) => p.promptId)).toEqual(['geo.landlocked']);
  });
});

describe('TelemetryStore', () => {
  it('purges raw events past retention but keeps aggregates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meridian-store-'));
    const store = new TelemetryStore(join(dir, 't.db'));
    store.record(SESSION, [finished(1000)], new Date('2026-01-01T12:00:00Z'));
    store.record(SESSION, [finished(3000)], new Date('2026-10-01T12:00:00Z'));
    expect(store.purge(new Date('2026-10-28T00:00:00Z'), 180)).toBe(1);
    const s = store.summary();
    expect(s.totals.events).toBe(1);
    expect(s.expeditions[0]).toMatchObject({ finished: 2, medianDurationMs: 3000 });
    store.close();
  });

  it('migrates idempotently when reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meridian-store-'));
    new TelemetryStore(join(dir, 't.db')).close();
    const again = new TelemetryStore(join(dir, 't.db'));
    expect(again.summary().totals.events).toBe(0);
    again.close();
  });
});

describe('RateLimiter', () => {
  it('uses fixed windows and bounds the number of tracked clients', () => {
    let now = 60_000;
    const rl = new RateLimiter(2, 60_000, 2, () => now);
    expect(rl.hit('a')).toBe(0);
    expect(rl.hit('a')).toBe(0);
    expect(rl.hit('a')).toBe(60);
    expect(rl.hit('b')).toBe(0);
    expect(rl.hit('c')).toBeGreaterThan(0); // table full
    now += 60_000;
    expect(rl.hit('a')).toBe(0);
    expect(rl.hit('c')).toBe(0);
  });
});
