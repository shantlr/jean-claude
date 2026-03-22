import { ExternalLink, GitPullRequest } from 'lucide-react';

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
      title="Open pull request in Azure DevOps"
    >
      <Chip size="sm" color="green" icon={<GitPullRequest />}>
        PR #{pullRequestId}
        <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
      </Chip>
    </a>
  );
}
