import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheControlFor, CACHE, createApp } from '../src/app';
import type { ServerConfig } from '../src/config';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Meridian</title>');
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
  writeFileSync(join(dir, 'sw.js'), '// sw');
  return dir;
}

const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  port: 0,
  host: '127.0.0.1',
  staticDir: fixture(),
  dataDir: null,
  version: 'test',
  commit: 'abc',
  ...over,
});

describe('cache policy (architecture §7.4)', () => {
  it.each([
    ['/assets/index-abc123.js', CACHE.immutable],
    ['/index.html', CACHE.revalidate],
    ['/sw.js', CACHE.revalidate],
    ['/manifest.webmanifest', CACHE.revalidate],
    ['/favicon.svg', CACHE.short],
  ])('%s → %s', (path, expected) => {
    expect(cacheControlFor(path)).toBe(expected);
  });
});

describe('server', () => {
  it('serves health without caching', async () => {
    const res = await createApp(config()).request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      status: 'ok',
      version: 'test',
      commit: 'abc',
      dataDir: null,
    });
  });

  it('reports a writable data volume', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'meridian-data-'));
    const res = await createApp(config({ dataDir })).request('/api/health');
    expect(await res.json()).toMatchObject({ status: 'ok', dataDir: { writable: true } });
  });

  it.skipIf(process.getuid?.() === 0)(
    'fails health when the data volume is read-only',
    async () => {
      const dataDir = mkdtempSync(join(tmpdir(), 'meridian-ro-'));
      chmodSync(dataDir, 0o500);
      const res = await createApp(config({ dataDir })).request('/api/health');
      expect(res.status).toBe(503);
    },
  );

  it('fails health when the data volume is missing', async () => {
    const res = await createApp(config({ dataDir: '/nonexistent/meridian-data' })).request(
      '/api/health',
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await createApp(config()).request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('serves hashed assets as immutable', async () => {
    const res = await createApp(config()).request('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(CACHE.immutable);
  });

  it('serves the HTML shell with revalidation, including SPA routes', async () => {
    const app = createApp(config());
    for (const path of ['/', '/x/MER-7KQ2']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain('<title>Meridian</title>');
      expect(res.headers.get('cache-control'), path).toBe(CACHE.revalidate);
    }
  });

  it('never serves the HTML shell for a missing asset', async () => {
    const res = await createApp(config()).request('/assets/missing-123.js');
    expect(res.status).toBe(404);
  });

  it('sends security headers with a strict CSP', async () => {
    const res = await createApp(config()).request('/');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    expect(csp).not.toContain('unsafe-eval');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});
