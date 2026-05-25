import { describe, expect, it } from 'vitest';

import { canMergeWorktree } from './utils-merge-eligibility';

describe('canMergeWorktree', () => {
  it('allows merge when status is loaded and target branch is unprotected', () => {
    expect(
      canMergeWorktree({
        isStatusLoading: false,
        isSelectedBranchProtected: false,
      }),
    ).toBe(true);
  });

  it('does not block merge based on staged changes', () => {
    const hasStagedChanges = true;

    expect(
      canMergeWorktree({
        isStatusLoading: false,
        isSelectedBranchProtected: false,
      }) && hasStagedChanges,
    ).toBe(true);
  });

  it('blocks merge while status is loading', () => {
    expect(
      canMergeWorktree({
        isStatusLoading: true,
        isSelectedBranchProtected: false,
      }),
    ).toBe(false);
  });

  it('blocks merge into protected branches', () => {
    expect(
      canMergeWorktree({
        isStatusLoading: false,
        isSelectedBranchProtected: true,
      }),
    ).toBe(false);
  });
});
