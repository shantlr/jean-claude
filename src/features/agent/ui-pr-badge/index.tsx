import { GitPullRequest } from 'lucide-react';

import { Chip } from '@/common/ui/chip';

export function PrBadge({
  pullRequestId,
  pullRequestUrl,
}: {
  pullRequestId: string;
  pullRequestUrl: string;
}) {
  return (
    <a
      href={pullRequestUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open pull request"
    >
      <Chip size="xs" color="green" icon={<GitPullRequest />}>
        PR #{pullRequestId}
      </Chip>
    </a>
  );
}
