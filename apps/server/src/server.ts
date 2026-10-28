import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp(config);
let server: ReturnType<typeof serve>;

function start(hostname: string) {
  const instance = serve({ fetch: app.fetch, port: config.port, hostname }, (info) => {
    console.log(
      `meridian ${config.version} (${config.commit}) listening on ${info.address}:${info.port}`,
    );
    console.log(`  static: ${config.staticDir}`);
    console.log(`  data:   ${config.dataDir ?? '(none)'}`);
  });
  instance.on('error', (err: NodeJS.ErrnoException) => {
    // Containers with IPv6 disabled cannot bind '::': fall back to IPv4.
    if (hostname === '::' && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
      console.warn('IPv6 unavailable, falling back to 0.0.0.0');
      server = start('0.0.0.0');
      return;
    }
    throw err;
  });
  return instance;
}

server = start(config.host);

// Coolify stops containers with SIGTERM: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
