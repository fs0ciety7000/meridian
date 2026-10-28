import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/server', 'tools/*', 'apps/web'],
    passWithNoTests: true,
  },
});
