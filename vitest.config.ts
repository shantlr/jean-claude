import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@shared': resolve('shared'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'shared/**/*.test.ts',
      'electron/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/features/agent/ui-diff-view/**/*.test.ts',
      'src/features/agent/ui-message-stream/**/*.test.ts',
      'src/features/agent/ui-worktree-actions/**/*.test.ts',
      'src/features/pull-request/**/*.test.ts',
      'src/features/task/**/*.test.ts',
      'src/stores/**/*.test.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
});
