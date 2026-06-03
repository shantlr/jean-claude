import { describe, expect, it } from 'vitest';

import { formatCreateWorktreeError } from './utils-worktree-errors';

describe('formatCreateWorktreeError', () => {
  it('explains when the requested branch is already checked out in another worktree', () => {
    const error = new Error('Command failed: git worktree add ...');
    Object.assign(error, {
      stderr:
        "fatal: 'feature/pr-123' is already checked out at '/tmp/project-pr-123'",
    });

    expect(formatCreateWorktreeError(error)).toBe(
      [
        'Branch "feature/pr-123" is already checked out in another worktree:',
        '/tmp/project-pr-123',
        '',
        'Choose a different source branch, remove that worktree, or open the existing worktree instead.',
      ].join('\n'),
    );
  });

  it('keeps the original git error for unrelated failures', () => {
    expect(formatCreateWorktreeError(new Error('fatal: not a git repo'))).toBe(
      'Failed to create git worktree: fatal: not a git repo',
    );
  });
});
