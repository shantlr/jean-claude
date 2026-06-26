import {
  BookOpen,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FlaskConical,
  GitPullRequest,
  History,
  Link2,
  Loader2,
  MessagesSquare,
} from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { diffWordsWithSpace } from 'diff';
import type { ReactNode } from 'react';

import type {
  AzureDevOpsPullRequestStatus,
  AzureDevOpsWorkItem,
  WorkItemHistoryEntry,
} from '@/lib/api';
import { Dropdown, DropdownItem } from '@/common/ui/dropdown';
import {
  useAddWorkItemComment,
  useLinkedPullRequestStatuses,
  useRelatedTestCases,
  useUpdateWorkItemState,
  useWorkItemById,
  useWorkItemComments,
  useWorkItemHistory,
  useWorkItemsByIds,
  useWorkItemStates,
} from '@/hooks/use-work-items';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { Chip } from '@/common/ui/chip';
import { formatRelativeTime } from '@/lib/time';
import { Modal } from '@/common/ui/modal';
import { PrDetail } from '@/features/pull-request/ui-pr-detail';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProject } from '@/hooks/use-projects';
import { useWorkItemCommentsPaneWidth } from '@/stores/navigation';
import { WorkItemComments } from '@/features/work-item/ui-work-item-comments';

type DetailsTab = 'comments' | 'history' | 'test-cases';

type LinkDetailModal =
  | { type: 'work-item'; workItemId: number }
  | {
      type: 'pull-request';
      pr: NonNullable<AzureDevOpsWorkItem['linkedPrs']>[number];
    };

function WorkItemTypeIcon({
  type,
  size = 'md',
}: {
  type: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (type) {
    case 'Bug':
      return <Bug className={`${sizeClass} text-status-fail shrink-0`} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={`${sizeClass} text-acc-ink shrink-0`} />;
    case 'Task':
      return (
        <CheckSquare className={`${sizeClass} text-status-done shrink-0`} />
      );
    default:
      return <FileText className={`${sizeClass} text-ink-2 shrink-0`} />;
  }
}

function getStateColor(state: string): {
  color: 'neutral' | 'blue' | 'yellow' | 'green';
  ringClass: string;
} {
  if (state === 'Active') {
    return { color: 'blue', ringClass: 'ring-1 ring-acc/30' };
  } else if (state === 'New') {
    return { color: 'yellow', ringClass: 'ring-1 ring-status-run/30' };
  } else if (state === 'Resolved' || state === 'Done' || state === 'Closed') {
    return { color: 'green', ringClass: 'ring-1 ring-status-done/30' };
  }
  return { color: 'neutral', ringClass: '' };
}

function StateBadge({ state }: { state: string }) {
  const { color, ringClass } = getStateColor(state);
  return (
    <Chip size="sm" color={color} className={ringClass}>
      {state}
    </Chip>
  );
}

function EditableStateBadge({
  state,
  states: availableStates,
  providerId,
  workItemId,
}: {
  state: string;
  states: string[];
  providerId: string;
  workItemId: number;
}) {
  const updateState = useUpdateWorkItemState();
  const { color, ringClass } = getStateColor(state);
  const dropdownRef = useRef<{ toggle: () => void } | null>(null);
  const states = availableStates.includes(state)
    ? availableStates
    : [state, ...availableStates];

  const handleSelect = useCallback(
    (s: string) => {
      dropdownRef.current?.toggle();
      if (s !== state) {
        updateState.mutate({ providerId, workItemId, state: s });
      }
    },
    [state, providerId, workItemId, updateState],
  );

  return (
    <Dropdown
      dropdownRef={dropdownRef}
      trigger={
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1"
        >
          <Chip
            size="sm"
            color={color}
            className={clsx(
              ringClass,
              '[&>span]:flex [&>span]:items-center [&>span]:gap-1',
            )}
            icon={
              updateState.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : undefined
            }
          >
            {state}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </Chip>
        </button>
      }
    >
      {states.map((s) => (
        <DropdownItem
          key={s}
          onClick={() => handleSelect(s)}
          checked={s === state}
        >
          {s}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

export function WorkItemDetails({
  projectId,
  workItemId,
}: {
  projectId: string;
  workItemId: number;
}) {
  const { data: project } = useProject(projectId);
  const providerId = project?.workItemProviderId ?? null;
  const configuredProjectName = project?.workItemProjectName ?? null;
  const {
    width: commentsPaneWidth,
    setWidth: setCommentsPaneWidth,
    minWidth: minCommentsPaneWidth,
    maxWidth: maxCommentsPaneWidth,
  } = useWorkItemCommentsPaneWidth();

  const {
    data: workItem,
    isLoading,
    error,
  } = useWorkItemById({
    providerId,
    workItemId,
  });
  const projectName = workItem?.fields.teamProject ?? configuredProjectName;
  const { data: availableStates = [] } = useWorkItemStates({
    providerId,
    projectName,
    workItemType: workItem?.fields.workItemType ?? null,
  });
  const {
    data: comments = [],
    isLoading: isLoadingComments,
    error: commentsError,
  } = useWorkItemComments({
    providerId,
    projectName,
    workItemIds: [workItemId],
  });
  const {
    data: history = [],
    isLoading: isLoadingHistory,
    error: historyError,
  } = useWorkItemHistory({
    providerId,
    projectName,
    workItemId,
  });
  const { data: relatedTestCases = [], isLoading: isLoadingTestCases } =
    useRelatedTestCases({
      providerId,
      projectName,
      workItemId,
    });
  const linkedPrs = workItem?.linkedPrs ?? [];
  const { data: linkedPullRequestStatuses = [] } = useLinkedPullRequestStatuses({
    providerId,
    linkedPrs,
  });
  const linkedWorkItemIds = getLinkedWorkItemIds(workItem);
  const { data: linkedWorkItems = [], isLoading: isLoadingLinkedWorkItems } =
    useWorkItemsByIds({
      providerId,
      workItemIds: linkedWorkItemIds,
    });
  const addComment = useAddWorkItemComment();
  const hasTestCases = isLoadingTestCases || relatedTestCases.length > 0;
  const [activeTab, setActiveTab] = useState<DetailsTab>('comments');
  const [linkDetailModal, setLinkDetailModal] = useState<LinkDetailModal | null>(
    null,
  );
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    if (!hasTestCases && activeTab === 'test-cases') {
      startTransition(() => setActiveTab('comments'));
    }
  }, [hasTestCases, activeTab]);

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: commentsPaneWidth,
    minWidth: minCommentsPaneWidth,
    maxWidth: maxCommentsPaneWidth,
    maxWidthFraction: 0.6,
    direction: 'left',
    onWidthChange: setCommentsPaneWidth,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setContainerWidth(container.offsetWidth);
    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  const effectiveCommentsPaneWidth = Math.min(
    commentsPaneWidth,
    maxCommentsPaneWidth,
    Math.floor(containerWidth * 0.6),
  );

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-ink-3 text-sm">
          {error ? 'Failed to load work item' : 'Work item not found'}
        </p>
      </div>
    );
  }

  const { fields } = workItem;
  const hasReproSteps = fields.workItemType === 'Bug' && !!fields.reproSteps;
  const hasContent = !!fields.description || hasReproSteps;
  const hasLinks =
    !!workItem.parentId ||
    !!workItem.childIds?.length ||
    !!workItem.relatedWorkItemIds?.length ||
    !!workItem.linkedPrs?.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-glass-border/50 shrink-0 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <WorkItemTypeIcon type={fields.workItemType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-ink-2 text-sm font-medium">
                #{workItem.id}
              </span>
              <span className="text-ink-4 text-xs">&bull;</span>
              <span className="text-ink-2 text-xs">{fields.workItemType}</span>
            </div>
            <h1 className="text-ink-0 mt-1 text-lg font-semibold">
              {fields.title}
            </h1>
          </div>
          {workItem.url && (
            <a
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:border-glass-border hover:text-ink-1 border-glass-border flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
              title="Open in Azure DevOps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {providerId ? (
            <EditableStateBadge
              state={fields.state}
              states={availableStates.map((s) => s.name)}
              providerId={providerId}
              workItemId={workItem.id}
            />
          ) : (
            <StateBadge state={fields.state} />
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-3">Assigned to:</span>
            <span className="text-ink-1">
              {fields.assignedTo ?? 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-3">Project:</span>
              <span className="text-ink-1">
                {fields.teamProject ?? project.name}
              </span>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className={clsx(
          'flex min-h-0 flex-1 overflow-hidden',
          isDragging && 'select-none',
        )}
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4">
          {hasContent ? (
            <div className="w-full">
              {fields.description && (
                <AzureHtmlContent
                  html={fields.description}
                  providerId={providerId ?? undefined}
                  className="text-ink-1 text-sm"
                  imageClassName="max-h-96 w-auto object-contain"
                  enableImageModal
                />
              )}

              {hasReproSteps && (
                <div className={fields.description ? 'mt-6' : undefined}>
                  <h2 className="text-ink-0 mb-2 text-sm font-semibold">
                    Repro Steps
                  </h2>
                  <AzureHtmlContent
                    html={fields.reproSteps!}
                    providerId={providerId ?? undefined}
                    className="text-ink-1 text-sm"
                    imageClassName="max-h-96 w-auto object-contain"
                    enableImageModal
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-ink-3 w-full text-sm italic">
              No description provided.
            </p>
          )}
        </div>

        <div
          onMouseDown={handleMouseDown}
          className={clsx(
            'hover:bg-acc/30 h-full w-1 shrink-0 cursor-col-resize transition-colors',
            isDragging && 'bg-acc/30',
          )}
        />

        <aside
          className="border-glass-border/50 bg-bg-1/20 flex min-w-0 shrink-0 flex-col border-l"
          style={{ width: effectiveCommentsPaneWidth }}
        >
          {hasLinks && (
            <WorkItemLinks
              workItem={workItem}
              linkedWorkItems={linkedWorkItems}
              linkedPullRequestStatuses={linkedPullRequestStatuses}
              isLoadingWorkItems={isLoadingLinkedWorkItems}
              onOpenWorkItem={(id) =>
                setLinkDetailModal({ type: 'work-item', workItemId: id })
              }
              onOpenPullRequest={(pr) =>
                setLinkDetailModal({ type: 'pull-request', pr })
              }
            />
          )}

          <div className="border-glass-border flex gap-0 border-b px-3">
            <FeedTabButton
              active={activeTab === 'comments'}
              onClick={() => setActiveTab('comments')}
              icon={<MessagesSquare className="h-3.5 w-3.5" />}
              label="Comments"
              count={comments.length}
            />
            <FeedTabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon={<History className="h-3.5 w-3.5" />}
              label="History"
              count={history.length}
            />
            {hasTestCases && (
              <FeedTabButton
                active={activeTab === 'test-cases'}
                onClick={() => setActiveTab('test-cases')}
                icon={<FlaskConical className="h-3.5 w-3.5" />}
                label="Test Cases"
                count={relatedTestCases.length}
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {activeTab === 'comments' && (
              <WorkItemComments
                comments={comments}
                isLoading={isLoadingComments}
                error={
                  commentsError instanceof Error ? commentsError.message : null
                }
                providerId={providerId ?? undefined}
                emptyMessage="No comments on this work item yet."
                hideHeader
                isAddingComment={addComment.isPending}
                onAddComment={
                  providerId && projectName
                    ? (text) =>
                        addComment.mutateAsync({
                          providerId,
                          projectName,
                          workItemId,
                          text,
                        })
                    : undefined
                }
              />
            )}

            {activeTab === 'history' && (
              <WorkItemHistory
                history={history}
                isLoading={isLoadingHistory}
                error={
                  historyError instanceof Error ? historyError.message : null
                }
                providerId={providerId ?? undefined}
              />
            )}

            {activeTab === 'test-cases' && (
              <div className="flex flex-col gap-2">
                {isLoadingTestCases ? (
                  <p className="text-ink-3 text-sm">Loading test cases...</p>
                ) : (
                  relatedTestCases.map((tc) => (
                    <ExpandableTestCase
                      key={tc.id}
                      testCase={tc}
                      providerId={providerId ?? undefined}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <LinkedDetailModal
        projectId={projectId}
        providerId={providerId}
        modal={linkDetailModal}
        onClose={() => setLinkDetailModal(null)}
      />
    </div>
  );
}

function getLinkedWorkItemIds(workItem?: AzureDevOpsWorkItem | null): number[] {
  if (!workItem) return [];
  return Array.from(
    new Set([
      ...(workItem.parentId ? [workItem.parentId] : []),
      ...(workItem.childIds ?? []),
      ...(workItem.relatedWorkItemIds ?? []),
    ]),
  );
}

function WorkItemLinks({
  workItem,
  linkedWorkItems,
  linkedPullRequestStatuses,
  isLoadingWorkItems,
  onOpenWorkItem,
  onOpenPullRequest,
}: {
  workItem: AzureDevOpsWorkItem;
  linkedWorkItems: AzureDevOpsWorkItem[];
  linkedPullRequestStatuses: AzureDevOpsPullRequestStatus[];
  isLoadingWorkItems: boolean;
  onOpenWorkItem: (workItemId: number) => void;
  onOpenPullRequest: (
    pr: NonNullable<AzureDevOpsWorkItem['linkedPrs']>[number],
  ) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const findWorkItem = (id: number) => linkedWorkItems.find((wi) => wi.id === id);
  const findPullRequestStatus = (
    pr: NonNullable<AzureDevOpsWorkItem['linkedPrs']>[number],
  ) =>
    linkedPullRequestStatuses.find(
      (status) => status.key === getLinkedPrKey(pr),
    );

  return (
    <section className="border-glass-border border-b bg-white/[0.018]">
      <button
        type="button"
        className="hover:bg-white/[0.025] flex w-full items-center gap-2 px-5 py-3 text-left transition-colors"
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? (
          <ChevronRight className="text-ink-3 h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="text-ink-3 h-3.5 w-3.5" />
        )}
        <Link2 className="text-ink-3 h-3.5 w-3.5" />
        <h2 className="text-ink-1 flex-1 text-sm font-semibold">Links</h2>
        <span className="bg-ink-4/20 text-ink-3 rounded-full px-1.5 py-0.5 text-[10px]">
          {getLinkCount(workItem)}
        </span>
      </button>

      {!collapsed && <div className="flex flex-col gap-2.5 px-5 pb-3">
        {!!workItem.linkedPrs?.length && (
          <LinkGroup label="Pull Requests">
            {workItem.linkedPrs.map((pr) => (
              <LinkedPrChip
                key={`${pr.projectId}-${pr.repoId}-${pr.prId}`}
                pr={pr}
                status={findPullRequestStatus(pr)}
                onOpen={() => onOpenPullRequest(pr)}
              />
            ))}
          </LinkGroup>
        )}

        {workItem.parentId && (
          <LinkGroup label="Parent">
            <LinkedWorkItemChip
              workItemId={workItem.parentId}
              workItem={findWorkItem(workItem.parentId)}
              isLoading={isLoadingWorkItems}
              onOpen={() => onOpenWorkItem(workItem.parentId ?? 0)}
            />
          </LinkGroup>
        )}

        {!!workItem.childIds?.length && (
          <LinkGroup label="Children">
            {workItem.childIds.map((id) => (
              <LinkedWorkItemChip
                key={id}
                workItemId={id}
                workItem={findWorkItem(id)}
                isLoading={isLoadingWorkItems}
                onOpen={() => onOpenWorkItem(id)}
              />
            ))}
          </LinkGroup>
        )}

        {!!workItem.relatedWorkItemIds?.length && (
          <LinkGroup label="Related">
            {workItem.relatedWorkItemIds.map((id) => (
              <LinkedWorkItemChip
                key={id}
                workItemId={id}
                workItem={findWorkItem(id)}
                isLoading={isLoadingWorkItems}
                onOpen={() => onOpenWorkItem(id)}
              />
            ))}
          </LinkGroup>
        )}
      </div>}
    </section>
  );
}

function getLinkCount(workItem: AzureDevOpsWorkItem): number {
  return (
    (workItem.linkedPrs?.length ?? 0) +
    (workItem.parentId ? 1 : 0) +
    (workItem.childIds?.length ?? 0) +
    (workItem.relatedWorkItemIds?.length ?? 0)
  );
}

function getLinkedPrKey(
  pr: NonNullable<AzureDevOpsWorkItem['linkedPrs']>[number],
): string {
  return `${pr.projectId}:${pr.repoId}:${pr.prId}`;
}

function LinkGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
      <span className="text-ink-3 pt-1 text-xs font-medium">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function LinkedPrChip({
  pr,
  status,
  onOpen,
}: {
  pr: NonNullable<AzureDevOpsWorkItem['linkedPrs']>[number];
  status?: AzureDevOpsPullRequestStatus;
  onOpen: () => void;
}) {
  const content = (
    <>
      <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-acc-ink" />
      <span>PR #{pr.prId}</span>
      {status?.isDraft && <span className="text-ink-3">Draft</span>}
    </>
  );

  return (
    <LinkChip onClick={onOpen} title={`Open PR #${pr.prId}`}>
      {content}
    </LinkChip>
  );
}

function LinkedWorkItemChip({
  workItemId,
  workItem,
  isLoading,
  onOpen,
}: {
  workItemId: number;
  workItem?: AzureDevOpsWorkItem;
  isLoading: boolean;
  onOpen: () => void;
}) {
  const title = workItem
    ? `#${workItem.id} ${workItem.fields.title}`
    : `#${workItemId}`;
  const content = (
    <>
      {workItem ? (
        <WorkItemTypeIcon type={workItem.fields.workItemType} size="sm" />
      ) : isLoading ? (
        <Loader2 className="text-ink-3 h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <FileText className="text-ink-3 h-3.5 w-3.5 shrink-0" />
      )}
      <span className="text-ink-2 shrink-0 text-xs font-medium">
        #{workItemId}
      </span>
      {workItem && (
        <span className="min-w-0 truncate">{workItem.fields.title}</span>
      )}
    </>
  );

  return (
    <LinkChip onClick={onOpen} title={title}>
      {content}
    </LinkChip>
  );
}

function LinkChip({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  const className =
    'border-glass-border/70 text-ink-1 hover:border-glass-border hover:bg-white/[0.04] flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-white/[0.025] px-2 py-1 text-left text-xs transition-colors';

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}

function LinkedDetailModal({
  projectId,
  providerId,
  modal,
  onClose,
}: {
  projectId: string;
  providerId: string | null;
  modal: LinkDetailModal | null;
  onClose: () => void;
}) {
  if (modal?.type === 'work-item') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title={`Work Item #${modal.workItemId}`}
        size="xl"
        contentClassName="min-h-0 overflow-hidden p-0"
        panelClassName="h-[85vh]"
      >
        <WorkItemDetails projectId={projectId} workItemId={modal.workItemId} />
      </Modal>
    );
  }

  if (modal?.type === 'pull-request') {
    if (!providerId) {
      return (
        <Modal
          isOpen
          onClose={onClose}
          title={`Pull Request #${modal.pr.prId}`}
          size="lg"
        >
          <p className="text-status-fail text-sm">
            Work item provider is required to load pull request details.
          </p>
        </Modal>
      );
    }

    return (
      <Modal
        isOpen
        onClose={onClose}
        title={`Pull Request #${modal.pr.prId}`}
        size="xl"
        contentClassName="min-h-0 overflow-hidden p-0"
        panelClassName="h-[85vh]"
      >
        <PrDetail
          projectId={projectId}
          prId={modal.pr.prId}
          repoInfo={{
            projectName: '',
            providerId,
            projectId: modal.pr.projectId,
            repoId: modal.pr.repoId,
          }}
          readOnly
        />
      </Modal>
    );
  }

  return null;
}

function WorkItemHistory({
  history,
  isLoading,
  error,
  providerId,
}: {
  history: WorkItemHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  providerId?: string;
}) {
  if (isLoading) {
    return <p className="text-ink-3 text-sm">Loading history...</p>;
  }

  if (error) {
    return <p className="text-status-fail text-sm">{error}</p>;
  }

  if (history.length === 0) {
    return <p className="text-ink-3 text-sm italic">No history found.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="border-glass-border/60 rounded-md border bg-white/[0.018] px-3 py-2.5"
        >
          <div className="mb-2 flex items-baseline gap-2">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <p className="text-ink-1 truncate text-[13px] font-medium">
                {entry.revisedBy}
              </p>
              <p
                className="text-ink-3 shrink-0 text-[11px]"
                title={
                  entry.revisedDate
                    ? new Date(entry.revisedDate).toLocaleString()
                    : undefined
                }
              >
                {entry.revisedDate
                  ? formatRelativeTime(entry.revisedDate)
                  : 'Unknown date'}
              </p>
            </div>
            <span className="text-ink-4 shrink-0 text-[11px]">
              #{entry.id}
            </span>
          </div>

          <div className="divide-glass-border/50 divide-y">
            {entry.fields.map((field) => (
              <HistoryChangeRow
                key={field.name}
                field={field}
                providerId={providerId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryChangeRow({
  field,
  providerId,
}: {
  field: WorkItemHistoryEntry['fields'][number];
  providerId?: string;
}) {
  const isComment = field.name === 'Comment' || field.name === 'History';
  const showDiff = shouldShowHistoryTextDiff(field);

  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-1.5">
      <span className="text-ink-2 truncate text-[12px] font-medium">
        {isComment ? 'Comment' : formatHistoryFieldName(field.name)}
      </span>
      {isComment ? (
        <HistoryCommentValue value={field.newValue} providerId={providerId} />
      ) : showDiff ? (
        <HistoryTextDiff
          oldValue={field.oldValue ?? ''}
          newValue={field.newValue ?? ''}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-start gap-1.5">
          <HistoryValue value={field.oldValue} providerId={providerId} />
          <span className="text-ink-4 text-center text-[11px] leading-5">
            -&gt;
          </span>
          <HistoryValue value={field.newValue} providerId={providerId} />
        </div>
      )}
    </div>
  );
}

function HistoryCommentValue({
  value,
  providerId,
}: {
  value?: string;
  providerId?: string;
}) {
  if (!value) {
    return <span className="text-ink-4 text-[12px] italic">Empty</span>;
  }

  if (!value.includes('<')) {
    return (
      <p className="text-ink-1 text-[12px] leading-5 whitespace-pre-wrap">
        {value}
      </p>
    );
  }

  return (
    <AzureHtmlContent
      html={value}
      providerId={providerId}
      className="text-ink-1 text-[12px] leading-5"
      imageClassName="max-h-20 w-auto object-contain"
      enableImageModal
    />
  );
}

function HistoryValue({
  value,
  providerId,
}: {
  value?: string;
  providerId?: string;
}) {
  if (!value) {
    return <span className="text-ink-4 text-[12px] italic">Empty</span>;
  }

  if (!value.includes('<')) {
    return (
      <span className="text-ink-1 truncate text-[12px]" title={value}>
        {value}
      </span>
    );
  }

  return (
    <AzureHtmlContent
      html={value}
      providerId={providerId}
      className="text-ink-2 text-[12px] leading-5"
      imageClassName="max-h-16 w-auto object-contain"
      enableImageModal
    />
  );
}

function formatHistoryFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bId\b/g, 'ID');
}

function shouldShowHistoryTextDiff(
  field: WorkItemHistoryEntry['fields'][number],
): boolean {
  const oldValue = field.oldValue ?? '';
  const newValue = field.newValue ?? '';
  if (!oldValue && !newValue) {
    return false;
  }
  if (oldValue === newValue) {
    return false;
  }

  const fieldName = field.name.toLowerCase();
  return (
    oldValue.includes('<') ||
    newValue.includes('<') ||
    oldValue.length > 40 ||
    newValue.length > 40 ||
    ['acceptance', 'criteria', 'description', 'repro', 'steps', 'title'].some(
      (part) => fieldName.includes(part),
    )
  );
}

function HistoryTextDiff({
  oldValue,
  newValue,
}: {
  oldValue: string;
  newValue: string;
}) {
  const changes = diffWordsWithSpace(
    plainHistoryValue(oldValue),
    plainHistoryValue(newValue),
  );

  return (
    <div className="min-w-0 rounded border border-white/[0.06] bg-black/10 px-2 py-1.5 text-[12px] leading-5">
      {changes.map((part, index) => (
        <span
          key={`${index}-${part.value}`}
          className={clsx(
            part.added &&
              'rounded bg-status-done/15 px-0.5 text-status-done',
            part.removed &&
              'rounded bg-status-fail/15 px-0.5 text-status-fail line-through decoration-status-fail/70',
            !part.added && !part.removed && 'text-ink-2',
          )}
        >
          {part.value}
        </span>
      ))}
    </div>
  );
}

function plainHistoryValue(value: string): string {
  if (!value.includes('<')) return value.trim();

  const element = document.createElement('div');
  element.innerHTML = value;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function ExpandableTestCase({
  testCase,
  providerId,
}: {
  testCase: AzureDevOpsWorkItem;
  providerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = testCase.fields.description || testCase.fields.reproSteps;
  const hasSteps = testCase.testSteps && testCase.testSteps.length > 0;
  const hasContent = !!description || hasSteps;

  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'oklch(1 0 0 / 0.06)',
        background: 'oklch(1 0 0 / 0.02)',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`text-ink-3 h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        <span className="text-ink-2 text-xs font-medium">#{testCase.id}</span>
        <span className="text-ink-1 min-w-0 truncate text-sm">
          {testCase.fields.title}
        </span>
        <span className="text-ink-3 ml-auto shrink-0 text-xs">
          {testCase.fields.state}
        </span>
      </button>
      {expanded && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
        >
          {description && (
            <AzureHtmlContent
              html={description}
              providerId={providerId}
              className="text-ink-2 text-sm"
            />
          )}
          {hasSteps && (
            <div className="mt-1">
              {testCase.testSteps!.map((step, i) => (
                <div
                  key={i}
                  className="border-b py-2 last:border-b-0"
                  style={{ borderColor: 'oklch(1 0 0 / 0.04)' }}
                >
                  <div className="flex gap-2">
                    <span className="text-ink-3 w-5 shrink-0 text-xs">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <AzureHtmlContent
                        html={step.action}
                        providerId={providerId}
                        className="text-ink-1 text-sm"
                      />
                      {step.expectedResult && (
                        <div className="text-ink-3 mt-0.5">
                          <span className="text-xs font-medium">
                            Expected:{' '}
                          </span>
                          <AzureHtmlContent
                            html={step.expectedResult}
                            providerId={providerId}
                            className="text-ink-3 inline text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!hasContent && (
            <p className="text-ink-3 text-sm italic">No description.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FeedTabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-accent-1 text-ink-1'
          : 'text-ink-3 hover:text-ink-2 border-transparent'
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
            active ? 'bg-accent-1/10 text-accent-1' : 'bg-ink-4/20 text-ink-3'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
