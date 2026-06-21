import { Check, ChevronDown, Hand, RotateCcw, ThumbsUp, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import clsx from 'clsx';


import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import {
  useCurrentAzureUser,
  useVotePullRequest,
} from '@/hooks/use-pull-requests';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import type { ReviewerVoteStatus } from '@shared/azure-devops-types';



import {
  findCurrentReviewer,
  getCurrentIdentityId,
} from '../utils-pr-current-user';

const VOTE_OPTIONS = [
  {
    vote: 10,
    label: 'Approve',
    status: 'approved' as const,
    icon: Check,
    color: 'text-green-400',
  },
  {
    vote: 5,
    label: 'Approve with suggestions',
    status: 'approved-with-suggestions' as const,
    icon: ThumbsUp,
    color: 'text-emerald-400',
  },
  {
    vote: -5,
    label: 'Wait for author',
    status: 'waiting' as const,
    icon: Hand,
    color: 'text-amber-400',
  },
  {
    vote: -10,
    label: 'Reject',
    status: 'rejected' as const,
    icon: X,
    color: 'text-red-400',
  },
] as const;

const APPROVE_VOTE = 10;

export function PrVoteDropdown({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const voteMutation = useVotePullRequest(projectId, pr.id);

  const currentReviewer = useMemo(() => {
    return findCurrentReviewer({ reviewers: pr.reviewers, currentUser });
  }, [pr.reviewers, currentUser]);

  const voterId = useMemo(() => {
    return getCurrentIdentityId({
      reviewers: pr.reviewers,
      currentUser,
    });
  }, [pr.reviewers, currentUser]);

  const currentVote: ReviewerVoteStatus = useMemo(() => {
    return currentReviewer?.voteStatus ?? 'none';
  }, [currentReviewer]);

  const handleVote = useCallback(
    (vote: number) => {
      if (!voterId) return;
      voteMutation.mutate({ reviewerId: voterId, vote });
    },
    [voterId, voteMutation],
  );

  const handleReset = useCallback(() => {
    if (!voterId) return;
    voteMutation.mutate({ reviewerId: voterId, vote: 0 });
  }, [voterId, voteMutation]);

  // Show dropdown if we can identify the user (even if not yet a reviewer)
  if (!voterId) return null;

  return (
    <div className="flex h-7 items-stretch">
      <button
        className={clsx(
          'flex h-full items-center rounded-l-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50',
          currentVote === 'approved' && 'bg-green-700',
        )}
        disabled={voteMutation.isPending}
        onClick={() => handleVote(APPROVE_VOTE)}
      >
        {currentVote === 'approved' ? 'Approved' : 'Approve'}
      </button>
      <Dropdown
        align="right"
        trigger={
          <button
            className={clsx(
              'flex h-full items-center justify-center rounded-r-lg border-l border-white/20 bg-green-600 px-2 text-white transition-colors hover:bg-green-700 disabled:opacity-50',
              currentVote === 'approved' && 'bg-green-700',
            )}
            disabled={voteMutation.isPending}
            aria-label="More vote options"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        }
      >
        {VOTE_OPTIONS.map((option) => (
          <DropdownItem
            key={option.vote}
            onClick={() => handleVote(option.vote)}
            icon={<option.icon className={clsx('h-4 w-4', option.color)} />}
            checked={currentVote === option.status}
          >
            {option.label}
          </DropdownItem>
        ))}
        {currentVote !== 'none' && (
          <>
            <DropdownDivider />
            <DropdownItem
              onClick={handleReset}
              icon={<RotateCcw className="text-ink-3 h-4 w-4" />}
            >
              Reset vote
            </DropdownItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}
