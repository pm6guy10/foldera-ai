import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    /** Pre-push runs the full suite in parallel; Windows CI-like runs can exceed 5s on cold imports. */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /**
     * - `FOLDERA_DRY_RUN` empty so tests do not inherit local fixture mode from `.env.local`.
     * - `ANTHROPIC_API_KEY` set so modules that throw when missing a key still load; **all** SDK
     *   traffic is satisfied by `test/stubs/anthropic-sdk-vitest.ts` unless a test file uses `vi.mock`.
     */
    env: {
      FOLDERA_DRY_RUN: '',
      ANTHROPIC_API_KEY: 'vitest-offline-stub-key-not-for-production',
      /** Required so real code paths that call assertPaidLlmAllowed still run against the offline SDK stub. */
      ALLOW_PAID_LLM: 'true',
    },
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist', '**/.claude/**', '**/.clone/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      /** Never hit api.anthropic.com during `vitest run` — see stub header. */
      '@anthropic-ai/sdk': path.resolve(__dirname, './test/stubs/anthropic-sdk-vitest.ts'),
    },
  },
});

