import type { AzureDevOpsPullRequestDetails, AzureDevOpsUser } from '@/lib/api';

type PullRequestIdentity = AzureDevOpsPullRequestDetails['createdBy'];
type PullRequestReviewer = AzureDevOpsPullRequestDetails['reviewers'][number];

function getVerifiedIdentityIds(currentUser: AzureDevOpsUser) {
  return currentUser.identityId ? [currentUser.identityId] : [];
}

export function findCurrentReviewer({
  reviewers,
  currentUser,
}: {
  reviewers: PullRequestReviewer[];
  currentUser: AzureDevOpsUser | null | undefined;
}): PullRequestReviewer | null {
  if (!currentUser) return null;

  for (const identityId of getVerifiedIdentityIds(currentUser)) {
    const reviewer = reviewers.find(
      (candidate) => !candidate.isContainer && candidate.id === identityId,
    );
    if (reviewer) return reviewer;
  }

  const currentEmail = currentUser.emailAddress.toLowerCase();
  return (
    reviewers.find(
      (reviewer) =>
        !reviewer.isContainer &&
        reviewer.uniqueName.toLowerCase() === currentEmail,
    ) ?? null
  );
}

export function getCurrentIdentityId({
  reviewers,
  createdBy,
  currentUser,
}: {
  reviewers: PullRequestReviewer[];
  createdBy?: PullRequestIdentity;
  currentUser: AzureDevOpsUser | null | undefined;
}): string | null {
  if (!currentUser) return null;

  const currentReviewer = findCurrentReviewer({ reviewers, currentUser });
  if (currentReviewer) return currentReviewer.id;

  for (const identityId of getVerifiedIdentityIds(currentUser)) {
    if (!createdBy || createdBy.id === identityId) {
      return identityId;
    }
  }

  if (
    createdBy?.uniqueName.toLowerCase() ===
    currentUser.emailAddress.toLowerCase()
  ) {
    return createdBy.id;
  }

  return currentUser.identityId ?? null;
}
