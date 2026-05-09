import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 10_000,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      // tsconfig の paths と同期。テスト時の relative import 解決用。
      '@': resolve(__dirname, 'src'),
      '@ksp/db': resolve(__dirname, '../../packages/db/src/index.ts'),
      '@ksp/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
