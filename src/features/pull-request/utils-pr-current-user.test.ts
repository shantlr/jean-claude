import { describe, expect, it } from 'vitest';

import type { AzureDevOpsPullRequestDetails, AzureDevOpsUser } from '@/lib/api';

import {
  findCurrentReviewer,
  getCurrentIdentityId,
} from './utils-pr-current-user';

type Reviewer = AzureDevOpsPullRequestDetails['reviewers'][number];

const currentUser: AzureDevOpsUser = {
  id: 'profile-id',
  displayName: 'Pat',
  emailAddress: 'pat@example.com',
};

const createdBy = {
  id: 'author-id',
  displayName: 'Author',
  uniqueName: 'author@example.com',
};

function reviewer(overrides: Partial<Reviewer>): Reviewer {
  return {
    id: 'reviewer-id',
    displayName: 'Reviewer',
    uniqueName: 'reviewer@example.com',
    voteStatus: 'none',
    ...overrides,
  };
}

describe('PR current user identity resolution', () => {
  it('uses explicit reviewer identity before user fallback', () => {
    const reviewers = [
      reviewer({ id: 'org-id', uniqueName: 'other@example.com' }),
    ];

    expect(
      getCurrentIdentityId({
        reviewers,
        currentUser: { ...currentUser, identityId: 'org-id' },
      }),
    ).toBe('org-id');
  });

  it('matches reviewer by email when identity IDs differ', () => {
    const reviewers = [
      reviewer({ id: 'reviewer-id', uniqueName: 'PAT@example.com' }),
    ];

    expect(findCurrentReviewer({ reviewers, currentUser })?.id).toBe(
      'reviewer-id',
    );
  });

  it('does not match reviewer id by profile id', () => {
    const reviewers = [
      reviewer({ id: 'profile-id', uniqueName: 'other@example.com' }),
    ];

    expect(findCurrentReviewer({ reviewers, currentUser })).toBeNull();
  });

  it('does not use profile id as a vote identity', () => {
    expect(getCurrentIdentityId({ reviewers: [], currentUser })).toBeNull();
  });

  it('uses resolved org identity when user is not already a reviewer', () => {
    expect(
      getCurrentIdentityId({
        reviewers: [],
        currentUser: { ...currentUser, identityId: 'org-id' },
      }),
    ).toBe('org-id');
  });

  it('uses creator identity when current user is PR author by email', () => {
    expect(
      getCurrentIdentityId({
        reviewers: [],
        createdBy: { ...createdBy, uniqueName: 'pat@example.com' },
        currentUser,
      }),
    ).toBe('author-id');
  });
});
