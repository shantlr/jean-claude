import { FileCode, FileText, GitCommit, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';



import {
  DiffFileTree,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import {
  type MentionDisplayNames,
  normalizeMentionId,
} from '@/lib/azure-devops-mentions';
import {
  updateFeedPullRequest,
  useAddPullRequestComment,
  useAddPullRequestFileComment,
  usePullRequest,
  usePullRequestChanges,
  usePullRequestCommits,
  usePullRequestFileContent,
  usePullRequestThreads,
  useUploadPullRequestAttachment,
} from '@/hooks/use-pull-requests';
import { api } from '@/lib/api';
import type { DiffFile } from '@/features/common/ui-file-diff';
import type { MentionOption } from '@/common/ui/mention-textarea';
import type { PrDetailTab } from '@/stores/navigation';
import type { PromptImagePart } from '@shared/agent-backend-types';
import type { PullRequestRepoInfo } from '@/hooks/use-pull-requests';
import { useCommands } from '@/common/hooks/use-commands';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { usePrDetailState } from '@/stores/navigation';
import { usePrDraftCountByFile } from '@/stores/pr-comment-drafts';
import { useProject } from '@/hooks/use-projects';
import { useRecordPrView } from '@/hooks/use-pr-view-snapshot';



import { getCommentStatusCountByPrFile } from '../utils-pr-comment-counts';
import { PrCommitDiffView } from '../ui-pr-commit-diff-view';
import { PrCommits } from '../ui-pr-commits';
import { PrDiffView } from '../ui-pr-diff-view';
import { PrHeader } from '../ui-pr-header';
import { PrOverview } from '../ui-pr-overview';


import { useLatestRef } from '@/hooks/use-latest-ref';
const PR_DETAIL_TABS: PrDetailTab[] = ['overview', 'files', 'commits'];

export function PrDetail({
  projectId,
  prId,
  bottomPadding = 0,
  repoInfo,
  readOnly = false,
}: {
  projectId: string;
  prId: number;
  bottomPadding?: number;
  repoInfo?: PullRequestRepoInfo;
  readOnly?: boolean;
}) {
  const stateProjectId = repoInfo
    ? `${projectId}:${repoInfo.providerId}:${repoInfo.projectId}:${repoInfo.repoId}`
    : projectId;
  const {
    selectedFile,
    activeTab,
    selectedCommitId,
    selectedCommitFile,
    setSelectedFile,
    setActiveTab,
    setSelectedCommit,
    setSelectedCommitFile,
  } = usePrDetailState(stateProjectId, prId);
  const [fileTreeWidth, setFileTreeWidth] = useState(250);
  const [searchedMentionOptions, setSearchedMentionOptions] = useState<
    MentionOption[]
  >([]);

  const navigateTab = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = PR_DETAIL_TABS.indexOf(activeTab);
      const newIndex =
        direction === 'next'
          ? (currentIndex + 1) % PR_DETAIL_TABS.length
          : (currentIndex - 1 + PR_DETAIL_TABS.length) % PR_DETAIL_TABS.length;
      setActiveTab(PR_DETAIL_TABS[newIndex]);
    },
    [activeTab, setActiveTab],
  );

  useCommands('pr-detail-tab-navigation', [
    {
      label: 'Next PR Detail Tab',
      shortcut: 'shift+]',
      handler: () => navigateTab('next'),
      hideInCommandPalette: true,
    },
    {
      label: 'Previous PR Detail Tab',
      shortcut: 'shift+[',
      handler: () => navigateTab('prev'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Overview Tab',
      shortcut: 'cmd+shift+1',
      handler: () => setActiveTab('overview'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Files Tab',
      shortcut: 'cmd+shift+2',
      handler: () => setActiveTab('files'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Commits Tab',
      shortcut: 'cmd+shift+3',
      handler: () => setActiveTab('commits'),
      hideInCommandPalette: true,
    },
  ]);

  const { data: project } = useProject(projectId);

  const { mutate: recordPrView } = useRecordPrView();
  const recordPrViewRef = useLatestRef(recordPrView);

  // Record PR view for activity tracking.
  useEffect(() => {
    if (repoInfo) return;
    if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId)
      return;

    updateFeedPullRequest(projectId, prId, { hasNewActivity: false });

    recordPrViewRef.current({
      projectId,
      pullRequestId: prId,
      providerId: project.repoProviderId,
      repoProjectId: project.repoProjectId,
      repoId: project.repoId,
    });
  }, [
    prId,
    project?.repoId,
    project?.repoProjectId,
    project?.repoProviderId,
    projectId,
    recordPrViewRef,
    repoInfo,
  ]);

  const { data: pr, isLoading: isPrLoading } = usePullRequest(
    projectId,
    prId,
    repoInfo,
  );

  const { data: commits = [], isLoading: isCommitsLoading } =
    usePullRequestCommits(projectId, prId, repoInfo);
  const { data: files = [], isLoading: isFilesLoading } = usePullRequestChanges(
    projectId,
    prId,
    repoInfo,
  );
  const { data: threads = [] } = usePullRequestThreads(projectId, prId, repoInfo);

  // File content for selected file
  const selectedFileData = files.find((f) => f.path === selectedFile);
  const { data: baseContent = '', isLoading: isBaseLoading } =
    usePullRequestFileContent(
      projectId,
      prId,
      selectedFile ?? '',
      'base',
      repoInfo,
    );
  const { data: headContent = '', isLoading: isHeadLoading } =
    usePullRequestFileContent(
      projectId,
      prId,
      selectedFile ?? '',
      'head',
      repoInfo,
    );

  // Mutations
  const addComment = useAddPullRequestComment(projectId, prId, repoInfo);
  const addFileComment = useAddPullRequestFileComment(projectId, prId, repoInfo);
  const uploadAttachment = useUploadPullRequestAttachment(projectId, prId, repoInfo);

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: fileTreeWidth,
    minWidth: 200,
    maxWidthFraction: 0.4,
    onWidthChange: setFileTreeWidth,
  });

  const handleAddComment = useCallback(
    (content: string) => {
      addComment.mutate(content);
    },
    [addComment],
  );

  const handleAddFileComment = useCallback(
    (params: {
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) => {
      addFileComment.mutate(params);
    },
    [addFileComment],
  );

  const handleUploadImage = useCallback(
    async (image: PromptImagePart, fileName: string) => {
      const attachment = await uploadAttachment.mutateAsync({
        fileName,
        mimeType: image.mimeType || 'application/octet-stream',
        dataBase64: image.data,
      });
      return attachment.url;
    },
    [uploadAttachment],
  );

  // Convert PR files to unified DiffFile format for the tree
  const diffFiles: DiffFile[] = useMemo(() => {
    return files.map((f) => ({
      path: f.path,
      status: normalizeAzureChangeType(f.changeType),
      originalPath: f.originalPath,
    }));
  }, [files]);

  const commentStatusCountByFile = useMemo(() => {
    return getCommentStatusCountByPrFile({ files, threads });
  }, [files, threads]);

  const filePaths = useMemo(() => files.map((f) => f.path), [files]);
  const draftCountByFile = usePrDraftCountByFile(prId, filePaths);

  const { mentionDisplayNames, mentionOptions } = useMemo(() => {
    const names: MentionDisplayNames = {};
    const optionsById = new Map<string, MentionOption>();
    const addPerson = (person?: {
      id?: string;
      displayName?: string;
      uniqueName?: string;
      isContainer?: boolean;
    }) => {
      if (!person?.id || !person.displayName || person.isContainer) return;
      const id = normalizeMentionId(person.id);
      names[id] = person.displayName;
      optionsById.set(id, {
        id: person.id,
        displayName: person.displayName,
        uniqueName: person.uniqueName,
      });
    };

    addPerson(pr?.createdBy);
    for (const reviewer of pr?.reviewers ?? []) addPerson(reviewer);
    for (const thread of threads) {
      for (const comment of thread.comments) addPerson(comment.author);
    }
    for (const option of searchedMentionOptions) addPerson(option);

    return {
      mentionDisplayNames: names,
      mentionOptions: [...optionsById.values()].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    };
  }, [pr?.createdBy, pr?.reviewers, searchedMentionOptions, threads]);

  const handleSearchMentions = useCallback(
    async (query: string) => {
      const providerId = repoInfo?.providerId ?? project?.repoProviderId;
      if (!providerId) return [];
      const options = await api.azureDevOps.searchIdentities({
        providerId,
        query,
      });
      setSearchedMentionOptions((current) => {
        const byId = new Map<string, MentionOption>();
        for (const option of current) byId.set(option.id.toLowerCase(), option);
        for (const option of options) byId.set(option.id.toLowerCase(), option);
        return [...byId.values()];
      });
      return options;
    },
    [project?.repoProviderId, repoInfo?.providerId],
  );

  if (isPrLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Pull request not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-xs">
      {/* Header */}
      <PrHeader
        pr={pr}
        projectId={projectId}
        providerId={repoInfo?.providerId}
        readOnly={readOnly}
      />

      {/* Tab bar */}
      <div className="border-glass-border/50 flex items-center border-b px-5">
        <div className="flex gap-0.5">
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Overview"
          />
          <TabButton
            active={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
            icon={<FileCode className="h-3.5 w-3.5" />}
            label="Files"
            count={files.length}
          />
          <TabButton
            active={activeTab === 'commits'}
            onClick={() => setActiveTab('commits')}
            icon={<GitCommit className="h-3.5 w-3.5" />}
            label="Commits"
            count={commits.length}
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'overview' && (
          <PrOverview
            pr={pr}
            projectId={projectId}
            prId={prId}
            providerId={repoInfo?.providerId ?? project?.repoProviderId ?? undefined}
            azureProjectId={
              repoInfo?.projectId ?? project?.repoProjectId ?? undefined
            }
            repoId={repoInfo?.repoId ?? project?.repoId ?? undefined}
            azureProjectName={project?.repoProjectName ?? undefined}
            repoInfo={repoInfo}
            readOnly={readOnly}
            threads={threads}
            onAddComment={readOnly ? undefined : handleAddComment}
            isAddingComment={readOnly ? false : addComment.isPending}
            onUploadImage={readOnly ? undefined : handleUploadImage}
            bottomPadding={bottomPadding}
            fileCount={files.length}
            files={files}
            mentionOptions={mentionOptions}
            onSearchMentions={handleSearchMentions}
          />
        )}

        {activeTab === 'files' && (
          <div
            ref={containerRef}
            className={clsx('flex h-full', isDragging && 'select-none')}
            style={
              bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
            }
          >
            {/* File tree */}
            <div
              className="panel-edge-shadow-r relative flex shrink-0 flex-col"
              style={{ width: fileTreeWidth }}
            >
              {isFilesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
                </div>
              ) : (
                <DiffFileTree
                  files={diffFiles}
                  selectedPath={selectedFile}
                  onSelectFile={setSelectedFile}
                  commentStatusCountByFile={commentStatusCountByFile}
                  draftCountByFile={draftCountByFile}
                />
              )}
              {/* Resize handle */}
              <div
                onMouseDown={handleMouseDown}
                className={clsx(
                  'hover:bg-acc/50 absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors',
                  isDragging && 'bg-acc/50',
                )}
              />
            </div>

            {/* Diff view */}
            <div className="min-w-0 flex-1 overflow-hidden">
              {selectedFile && selectedFileData ? (
                <PrDiffView
                  file={selectedFileData}
                  baseContent={baseContent}
                  headContent={headContent}
                  isLoadingContent={isBaseLoading || isHeadLoading}
                  threads={threads}
                  projectId={projectId}
                  prId={prId}
                  providerId={
                    repoInfo?.providerId ?? project?.repoProviderId ?? undefined
                  }
                  onAddFileComment={readOnly ? undefined : handleAddFileComment}
                  onUploadImage={readOnly ? undefined : handleUploadImage}
                  isAddingComment={readOnly ? false : addFileComment.isPending}
                  mentionDisplayNames={mentionDisplayNames}
                  mentionOptions={mentionOptions}
                  onSearchMentions={handleSearchMentions}
                  readOnly={readOnly}
                />
              ) : (
                <div className="text-ink-3 flex h-full items-center justify-center">
                  Select a file to view changes
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'commits' &&
          (isCommitsLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div
              className="flex h-full"
              style={
                bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
              }
            >
              {/* Commit list — fixed width left panel */}
              <div
                className={clsx(
                  'shrink-0',
                  selectedCommitId ? 'panel-edge-shadow-r w-[320px]' : 'w-full',
                )}
              >
                <PrCommits
                  commits={commits}
                  selectedCommitId={selectedCommitId}
                  onSelectCommit={setSelectedCommit}
                  bottomPadding={selectedCommitId ? 0 : bottomPadding}
                />
              </div>

              {/* Commit diff view — fills remaining space */}
              {selectedCommitId && (
                <div className="min-w-0 flex-1 overflow-hidden">
                  <PrCommitDiffView
                    projectId={projectId}
                    commitId={selectedCommitId}
                    selectedFile={selectedCommitFile}
                    onSelectFile={setSelectedCommitFile}
                    bottomPadding={bottomPadding}
                    repoInfo={repoInfo}
                  />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function TabButton({
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
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
        active
          ? 'border-acc text-ink-0'
          : 'text-ink-2 hover:text-ink-1 border-transparent',
      )}
      style={{ marginBottom: -1 }}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 font-mono text-[10.5px]',
            active ? 'bg-acc/20 text-acc-ink' : 'bg-glass-medium text-ink-3',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
