import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * apps/web 配下の meetings/derive テストだけを worker の vitest 環境から走らせるための ad-hoc config。
 *
 * apps/web に vitest 依存を追加せず、純粋関数テストだけ走らせるための回避策。
 * 実行: pnpm --filter @ksp/worker exec vitest run --config vitest.web-meetings.config.ts
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['apps/web/src/lib/meetings/__tests__/derive.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@/lib': resolve(__dirname, '../web/src/lib'),
      '@ksp/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
