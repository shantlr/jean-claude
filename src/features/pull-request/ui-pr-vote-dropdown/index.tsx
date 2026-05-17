import clsx from 'clsx';
import { Check, ChevronDown, Hand, ThumbsUp, RotateCcw, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Dropdown, DropdownItem, DropdownDivider } from '@/common/ui/dropdown';
import {
  useVotePullRequest,
  useCurrentAzureUser,
} from '@/hooks/use-pull-requests';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import type { ReviewerVoteStatus } from '@shared/azure-devops-types';

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

const VOTE_BUTTON_STYLES: Record<ReviewerVoteStatus, string> = {
  approved: 'bg-green-600 hover:bg-green-700 text-white',
  'approved-with-suggestions': 'bg-emerald-600 hover:bg-emerald-700 text-white',
  waiting: 'bg-amber-600 hover:bg-amber-700 text-white',
  rejected: 'bg-red-600 hover:bg-red-700 text-white',
  none: 'bg-glass-medium hover:bg-bg-3 text-ink-1',
};

const VOTE_LABELS: Record<ReviewerVoteStatus, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved',
  waiting: 'Waiting',
  rejected: 'Rejected',
  none: 'Vote',
};

export function PrVoteDropdown({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const voteMutation = useVotePullRequest(projectId, pr.id);

  const currentVote: ReviewerVoteStatus = useMemo(() => {
    if (!currentUser) return 'none';
    const reviewer = pr.reviewers.find(
      (r) => !r.isContainer && r.uniqueName === currentUser.emailAddress,
    );
    return reviewer?.voteStatus ?? 'none';
  }, [pr.reviewers, currentUser]);

  const handleVote = useCallback(
    (vote: number) => {
      if (!currentUser) return;
      voteMutation.mutate({ reviewerId: currentUser.id, vote });
    },
    [currentUser, voteMutation],
  );

  const handleReset = useCallback(() => {
    if (!currentUser) return;
    voteMutation.mutate({ reviewerId: currentUser.id, vote: 0 });
  }, [currentUser, voteMutation]);

  if (!currentUser) return null;

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className={clsx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            VOTE_BUTTON_STYLES[currentVote],
            voteMutation.isPending && 'opacity-50',
          )}
          disabled={voteMutation.isPending}
        >
          {VOTE_LABELS[currentVote]}
          <ChevronDown className="h-3 w-3" />
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
  );
}
