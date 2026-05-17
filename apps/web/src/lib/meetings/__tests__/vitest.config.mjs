import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 自作テスト専用の ad-hoc vitest config。
 * apps/web に vitest 依存が無いため、root を本ディレクトリにして
 * @/lib と @ksp/shared の alias を解決する。
 *
 * 実行例 (リポジトリルートから):
 *   pnpm --filter @ksp/worker exec vitest run \
 *     --config apps/web/src/lib/meetings/__tests__/vitest.config.mjs
 */
const ROOT = resolve(import.meta.dirname, '../../../../../..');

export default defineConfig({
  resolve: {
    alias: {
      '@/lib': resolve(ROOT, 'apps/web/src/lib'),
      '@ksp/shared': resolve(ROOT, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    include: [resolve(import.meta.dirname, 'derive.test.ts')],
  },
});
