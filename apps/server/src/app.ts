import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ServerConfig } from './config';

/**
 * Cache policy (architecture §7.4). Cloudflare honours these headers:
 * hashed build assets are immutable; the HTML shell and PWA files are always revalidated.
 */
export const CACHE = {
  immutable: 'public, max-age=31536000, immutable',
  revalidate: 'no-cache',
  short: 'public, max-age=3600',
  none: 'no-store',
} as const;

const REVALIDATE = /^\/(index\.html|sw\.js|manifest\.webmanifest|registerSW\.js)?$/;

export function cacheControlFor(path: string): string {
  if (path.startsWith('/assets/')) return CACHE.immutable;
  if (REVALIDATE.test(path)) return CACHE.revalidate;
  return CACHE.short;
}

async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function createApp(config: ServerConfig) {
  const app = new Hono();
  const startedAt = Date.now();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        // Cloudflare Web Analytics (cookieless RUM beacon injected by the zone).
        scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
        // React sets inline style attributes (stamp rotation, swatches).
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'https://cloudflareinsights.com'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ── API ─────────────────────────────────────────────────────────────────────
  const api = new Hono();
  api.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', CACHE.none);
  });

  api.get('/health', async (c) => {
    const dataWritable = config.dataDir ? await isWritable(config.dataDir) : null;
    const ok = dataWritable !== false;
    return c.json(
      {
        status: ok ? 'ok' : 'degraded',
        version: config.version,
        commit: config.commit,
        uptimeS: Math.round((Date.now() - startedAt) / 1000),
        dataDir: config.dataDir ? { writable: dataWritable } : null,
      },
      ok ? 200 : 503,
    );
  });

  api.all('*', (c) => c.json({ error: 'not_found' }, 404));
  app.route('/api', api);

  // ── Front-end (built PWA) ───────────────────────────────────────────────────
  app.use('*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/') || !c.res.ok) return;
    const isHtml = c.res.headers.get('content-type')?.includes('text/html') ?? false;
    c.res.headers.set('Cache-Control', isHtml ? CACHE.revalidate : cacheControlFor(c.req.path));
  });

  app.use('*', serveStatic({ root: config.staticDir }));

  // SPA fallback: client-side routes (e.g. /x/MER-7KQ2) get the HTML shell.
  // Missing build assets must 404, never fall back to HTML.
  app.get('*', (c, next) => {
    if (c.req.path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(c.req.path)) return next();
    return serveStatic({ root: config.staticDir, path: 'index.html' })(c, next);
  });

  app.notFound((c) => c.text('Not found', 404));
  return app;
}
