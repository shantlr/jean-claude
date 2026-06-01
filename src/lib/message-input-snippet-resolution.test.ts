import { describe, expect, it } from 'vitest';

import { resolveMessageInputText } from '@/lib/resolve-message-input-text';

describe('resolveMessageInputText', () => {
  it('resolves task variables before sending follow-up prompts', () => {
    expect(
      resolveMessageInputText('merge {{task.sourceBranch}} into this branch', {
        task: {
          sourceBranch: 'main',
          branchName: 'jean-claude/fix-snippets',
        },
      }),
    ).toBe('merge main into this branch');
  });

  it('leaves ordinary prompts unchanged', () => {
    expect(resolveMessageInputText('  run tests  ')).toBe('run tests');
  });
});
