import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  TELEMETRY_MAX_BYTES,
  TelemetryBatch,
  TelemetryEvent,
  type TelemetryEvent as Event,
} from '@meridian/content-schema';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ServerConfig } from '../config';
import { RateLimiter } from '../rateLimit';
import { TelemetryStore } from './store';

export const TELEMETRY_DB_FILE = 'telemetry.db';
/** Per client IP: one batch every 2 s on average is far above what a real client sends. */
export const TELEMETRY_REQUESTS_PER_MINUTE = 30;
/** Whole server: protects the disk from a distributed flood. */
export const TELEMETRY_EVENTS_PER_MINUTE = 20_000;

/**
 * Best-effort client address, used only as an in-memory rate-limit key (hashed, never stored).
 * Cloudflare sets CF-Connecting-IP; Traefik (Coolify) sets X-Forwarded-For.
 */
function clientKey(c: Context): string {
  const h = (name: string) => c.req.header(name)?.split(',')[0]?.trim();
  const direct = h('cf-connecting-ip') ?? h('x-real-ip') ?? h('x-forwarded-for');
  if (direct) return direct;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function sameToken(given: string, expected: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function createTelemetryApi(config: ServerConfig) {
  const api = new Hono();
  const perClient = new RateLimiter(TELEMETRY_REQUESTS_PER_MINUTE, 60_000);
  const global = new RateLimiter(TELEMETRY_EVENTS_PER_MINUTE, 60_000);

  // Opened lazily so that a missing/read-only volume only affects telemetry (and /api/health).
  let store: TelemetryStore | null = null;
  let lastPurge = 0;
  const getStore = (): TelemetryStore | null => {
    if (!config.dataDir) return null;
    if (!store) {
      mkdirSync(config.dataDir, { recursive: true });
      store = new TelemetryStore(join(config.dataDir, TELEMETRY_DB_FILE));
    }
    if (Date.now() - lastPurge > 86_400_000) {
      lastPurge = Date.now();
      store.purge();
    }
    return store;
  };

  api.post(
    '/',
    async (c, next) => {
      const retryAfter = perClient.hit(clientKey(c));
      if (retryAfter) {
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: 'rate_limited' }, 429);
      }
      // Same-origin only: the app is served by this server (CSP connect-src 'self').
      const origin = c.req.header('origin');
      if (origin) {
        let host: string | null = null;
        try {
          host = new URL(origin).host;
        } catch {
          /* malformed */
        }
        if (host !== c.req.header('host')) return c.json({ error: 'forbidden_origin' }, 403);
      }
      await next();
    },
    bodyLimit({
      maxSize: TELEMETRY_MAX_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      let body: unknown;
      try {
        body = JSON.parse(await c.req.text());
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const batch = TelemetryBatch.safeParse(body);
      if (!batch.success) return c.json({ error: 'invalid_batch' }, 400);

      const events: Event[] = [];
      for (const raw of batch.data.events) {
        const parsed = TelemetryEvent.safeParse(raw);
        if (parsed.success) events.push(parsed.data);
      }
      const rejected = batch.data.events.length - events.length;

      if (events.length > 0) {
        const retryAfter = global.hit('*', events.length);
        if (retryAfter) {
          c.header('Retry-After', String(retryAfter));
          return c.json({ error: 'rate_limited' }, 429);
        }
        try {
          const s = getStore();
          if (!s) return c.json({ accepted: 0, rejected, stored: false }, 202);
          s.record(batch.data.session, events);
        } catch (err) {
          console.error('telemetry: write failed', err);
          return c.json({ error: 'unavailable' }, 503);
        }
      }
      return c.json({ accepted: events.length, rejected, stored: true }, 202);
    },
  );

  api.get('/summary', (c) => {
    const token = config.telemetryAdminToken;
    // Without a configured token the route does not exist.
    if (!token) return c.json({ error: 'not_found' }, 404);
    const auth = c.req.header('authorization') ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!given || !sameToken(given, token)) {
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const minN = Math.max(1, Number.parseInt(c.req.query('minN') ?? '1', 10) || 1);
    try {
      const s = getStore();
      if (!s) return c.json({ error: 'no_data_dir' }, 503);
      return c.json(s.summary({ minN }));
    } catch (err) {
      console.error('telemetry: summary failed', err);
      return c.json({ error: 'unavailable' }, 503);
    }
  });

  return api;
}
