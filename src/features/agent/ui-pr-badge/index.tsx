import { ExternalLink, GitPullRequest } from 'lucide-react';

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
      className="inline-flex items-center gap-1 rounded-md bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-900"
      title="Open pull request in Azure DevOps"
    >
      <GitPullRequest className="h-3 w-3" />
      PR #{pullRequestId}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
