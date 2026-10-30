import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: ['tests/setup/mongo-launch-timeout.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
