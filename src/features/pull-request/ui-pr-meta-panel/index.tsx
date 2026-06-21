import { CheckCircle2, FileCode, GitMerge, User } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';



import type { AzureDevOpsPullRequestDetails } from '@shared/azure-devops-types';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { PrWorkItems } from '@/features/pull-request/ui-pr-work-items';
import { UserAvatar } from '@/common/ui/user-avatar';


// --- Vote status config ---

const VOTE_STATUS_CONFIG: Record<
  AzureDevOpsPullRequestDetails['reviewers'][number]['voteStatus'],
  { label: string; className: string }
> = {
  approved: { label: 'Approved', className: 'text-status-done' },
  'approved-with-suggestions': {
    label: 'Approved*',
    className: 'text-status-done',
  },
  waiting: { label: 'Reviewing', className: 'text-blue-400' },
  rejected: { label: 'Rejected', className: 'text-status-fail' },
  none: { label: 'Pending', className: 'text-ink-3' },
};

// --- Card wrapper ---

function MetaCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-glass-border bg-bg-1 overflow-hidden rounded-lg border">
      <div className="border-glass-border/50 text-ink-3 flex items-center gap-2 border-b px-3.5 py-2 text-[10.5px] font-semibold tracking-wider uppercase">
        {icon}
        {title}
      </div>
      <div className="px-3.5 py-2.5">{children}</div>
    </div>
  );
}

// --- Main component ---

export function PrMetaPanel({
  pr,
  fileCount = 0,
  providerId,
  workItems = [],
  isWorkItemsLoading = false,
  azureProjectId,
  azureProjectName,
  onLinkWorkItem,
  onUnlinkWorkItem,
  isLinkingWorkItem,
  isUnlinkingWorkItem,
}: {
  pr: AzureDevOpsPullRequestDetails;
  fileCount?: number;
  providerId?: string;
  workItems?: AzureDevOpsWorkItem[];
  isWorkItemsLoading?: boolean;
  azureProjectId?: string;
  azureProjectName?: string;
  onLinkWorkItem?: (workItemId: number) => void;
  onUnlinkWorkItem?: (workItemId: number) => void;
  isLinkingWorkItem?: boolean;
  isUnlinkingWorkItem?: boolean;
}) {
  const reviewers = pr.reviewers.filter((r) => !r.isContainer);

  return (
    <div className="flex flex-col gap-4">
      {/* Reviewers */}
      <MetaCard icon={<User className="h-3.5 w-3.5" />} title="Reviewers">
        {reviewers.length === 0 ? (
          <p className="text-ink-3 text-[12.5px]">No reviewers assigned</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reviewers.map((reviewer) => {
              const config = VOTE_STATUS_CONFIG[reviewer.voteStatus];
              const avatarUrl =
                reviewer.imageUrl && providerId
                  ? encodeProxyUrl(providerId, reviewer.imageUrl)
                  : reviewer.imageUrl;

              return (
                <div
                  key={reviewer.id}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <UserAvatar
                    name={reviewer.displayName}
                    imageUrl={avatarUrl}
                    size="sm"
                    vote={reviewer.voteStatus}
                  />
                  <span className="text-ink-1 min-w-0 flex-1 truncate">
                    {reviewer.displayName}
                  </span>
                  <span
                    className={clsx(
                      'shrink-0 text-[11px] font-medium',
                      config.className,
                    )}
                  >
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </MetaCard>

      {/* Changes */}
      {fileCount > 0 && (
        <MetaCard icon={<FileCode className="h-3.5 w-3.5" />} title="Changes">
          <span className="text-ink-1 text-[12.5px]">
            {fileCount} {fileCount === 1 ? 'file' : 'files'} changed
          </span>
        </MetaCard>
      )}

      {/* Work Items */}
      <PrWorkItems
        workItems={workItems}
        isLoading={isWorkItemsLoading}
        providerId={providerId}
        azureProjectId={azureProjectId}
        azureProjectName={azureProjectName}
        onLink={onLinkWorkItem}
        onUnlink={onUnlinkWorkItem}
        isLinking={isLinkingWorkItem}
        isUnlinking={isUnlinkingWorkItem}
      />

      {/* Auto-complete */}
      {pr.autoCompleteSetBy && (
        <MetaCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          title="Auto-Complete"
        >
          <div className="flex items-center gap-2 text-[12.5px]">
            <GitMerge className="text-ink-3 h-3.5 w-3.5 shrink-0" />
            <span className="text-ink-1">
              Enabled by{' '}
              <span className="text-ink-0 font-medium">
                {pr.autoCompleteSetBy.displayName}
              </span>
            </span>
          </div>
        </MetaCard>
      )}
    </div>
  );
}
