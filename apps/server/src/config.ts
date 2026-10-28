import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  host: string;
  /** Built front-end (apps/web/dist). */
  staticDir: string;
  /** Persistent volume (SQLite in phase 4). Health fails if set but not writable. */
  dataDir: string | null;
  version: string;
  commit: string;
  /** Bearer token for `GET /api/telemetry/summary`; the route is disabled (404) when unset. */
  telemetryAdminToken: string | null;
}

/** Reads configuration from the environment (documented in docs/deployment.md). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    port: Number(env.PORT ?? 3000),
    // '::' is dual-stack: `localhost` resolves to ::1 first in Alpine. Not `HOST`, which
    // platforms such as Coolify inject (HOST=0.0.0.0) and would silently override.
    host: env.LISTEN_HOST ?? '::',
    staticDir: resolve(env.STATIC_DIR ?? resolve(here, 'public')),
    dataDir: env.DATA_DIR ? resolve(env.DATA_DIR) : null,
    version: env.APP_VERSION ?? 'dev',
    commit: (env.GIT_COMMIT ?? 'unknown').slice(0, 12),
    telemetryAdminToken: env.TELEMETRY_ADMIN_TOKEN?.trim() || null,
  };
}
