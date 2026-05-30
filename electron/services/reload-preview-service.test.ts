import { describe, expect, it } from 'vitest';

import { runReloadPreviewCommand } from './reload-preview-service';

describe('runReloadPreviewCommand', () => {
  it('rejects with stderr when the command exits non-zero', async () => {
    await expect(
      runReloadPreviewCommand({
        command: process.execPath,
        args: [
          '-e',
          "process.stderr.write('network unavailable'); process.exit(1)",
        ],
        cwd: process.cwd(),
        label: 'Git pull',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('Git pull failed with exit code 1: network unavailable');
  });

  it('rejects when the command times out', async () => {
    await expect(
      runReloadPreviewCommand({
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 1000)'],
        cwd: process.cwd(),
        label: 'Git pull',
        timeoutMs: 25,
      }),
    ).rejects.toThrow(`Git pull timed out after 25ms: ${process.execPath} -e`);
  });
});
