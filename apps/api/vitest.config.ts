import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      STORAGE_DRIVER: 'memory',
      // Tests must not depend on the gitignored `.env`; provide deterministic secrets.
      JWT_SECRET: 'test-jwt-secret',
      COOKIE_SECRET: 'test-cookie-secret',
    },
  },
});
