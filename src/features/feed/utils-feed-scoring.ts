import type { FeedItemAttention, ProjectPriority } from '@shared/feed-types';

const BASE_URGENCY: Record<FeedItemAttention, number> = {
  errored: 100,
  'needs-permission': 90,
  'has-question': 85,
  completed: 70,
  interrupted: 60,
  'review-requested': 50,
  'pr-comments': 45,
  running: 30,
  note: 105,
  waiting: 10,
};

const PROJECT_BOOST: Record<ProjectPriority, number> = {
  high: 30,
  normal: 0,
  low: -20,
};

const LOW_PRIORITY_PENALTY = -50;

export function computeFeedScore({
  attention,
  projectPriority,
  isLowPriority,
}: {
  attention: FeedItemAttention;
  projectPriority: ProjectPriority;
  isLowPriority: boolean;
}): number {
  return (
    BASE_URGENCY[attention] +
    PROJECT_BOOST[projectPriority] +
    (isLowPriority ? LOW_PRIORITY_PENALTY : 0)
  );
}
