import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwa } from './scripts/pwa-plugin';

export default defineConfig({
  plugins: [react(), pwa()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
