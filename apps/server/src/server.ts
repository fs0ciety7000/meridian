import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const server = serve(
  { fetch: createApp(config).fetch, port: config.port, hostname: config.host },
  (info) => {
    console.log(
      `meridian ${config.version} (${config.commit}) listening on ${info.address}:${info.port}`,
    );
    console.log(`  static: ${config.staticDir}`);
    console.log(`  data:   ${config.dataDir ?? '(none)'}`);
  },
);

// Coolify stops containers with SIGTERM: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
