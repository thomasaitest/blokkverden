import { defineConfig } from 'vitest/config';

const base = process.env.BASE_PATH || './';

export default defineConfig({
  base,
  server: { host: '127.0.0.1', port: 5177 },
  preview: { host: '127.0.0.1', port: 4177 },
  worker: { format: 'es' },
  test: {
    testTimeout: 30000,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
