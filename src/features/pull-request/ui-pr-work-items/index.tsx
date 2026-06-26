import {
  ChevronDown,
  ExternalLink,
  Eye,
  Link,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type React from 'react';
import { useQuery } from '@tanstack/react-query';



import { api, type AzureDevOpsWorkItem } from '@/lib/api';
import { Modal } from '@/common/ui/modal';
import { WorkItemPreview } from '@/features/work-item/ui-work-item-preview';


import { WorkItemTypeIcon } from '../../work-item/ui-work-item-shared';

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'in progress':
    case 'active':
      return 'bg-acc/20 text-acc-ink';
    case 'new':
    case 'to do':
      return 'bg-bg-2/20 text-ink-2';
    case 'resolved':
    case 'done':
    case 'closed':
      return 'bg-status-done/20 text-status-done';
    case 'removed':
      return 'bg-status-fail/20 text-status-fail';
    default:
      return 'bg-bg-2/20 text-ink-2';
  }
}

function WorkItemSearchInput({
  providerId,
  azureProjectId,
  azureProjectName,
  linkedWorkItemIds,
  onLink,
  onPreview,
  isLinking,
  onClose,
}: {
  providerId: string;
  azureProjectId: string;
  azureProjectName: string;
  linkedWorkItemIds: Set<number>;
  onLink: (workItemId: number) => void;
  onPreview: (workItem: AzureDevOpsWorkItem) => void;
  isLinking: boolean;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const isIdSearch = /^\d+$/.test(debouncedSearch.trim());
  const shouldSearch = debouncedSearch.trim().length >= 2 && !isIdSearch;

  const { data: searchResults = [], isLoading: isSearching } = useQuery<
    AzureDevOpsWorkItem[]
  >({
    queryKey: [
      'work-items-search',
      providerId,
      azureProjectId,
      debouncedSearch,
    ],
    queryFn: () =>
      api.azureDevOps.queryWorkItems({
        providerId,
        projectId: azureProjectId,
        projectName: azureProjectName,
        filters: {
          searchText: debouncedSearch.trim(),
          states: ['New', 'Active', 'In Progress', 'To Do', 'In Design'],
        },
      }),
    enabled: shouldSearch,
    staleTime: 30_000,
  });

  // Filter out already-linked items and limit results
  const filteredResults = searchResults
    .filter((wi) => !linkedWorkItemIds.has(wi.id))
    .slice(0, 8);

  // For ID search, check if the ID is in search results or show prompt
  const idSearchValue = isIdSearch
    ? parseInt(debouncedSearch.trim(), 10)
    : null;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && idSearchValue && !isLinking) {
        if (!linkedWorkItemIds.has(idSearchValue)) {
          onLink(idSearchValue);
        }
      }
    },
    [onClose, idSearchValue, isLinking, linkedWorkItemIds, onLink],
  );

  const handleLinkClick = useCallback(
    (workItemId: number) => {
      if (!isLinking) {
        onLink(workItemId);
      }
    },
    [isLinking, onLink],
  );

  return (
    <div className="border-glass-border-strong mt-1 rounded-md border">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Search className="text-ink-3 h-3.5 w-3.5 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by title or enter work item ID…"
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
        {isLinking && (
          <Loader2 className="text-ink-3 h-3.5 w-3.5 shrink-0 animate-spin" />
        )}
        <button
          onClick={onClose}
          className="text-ink-3 hover:text-ink-1 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Results */}
      {debouncedSearch.trim().length >= 2 && (
        <div className="border-glass-border-strong max-h-48 overflow-y-auto border-t">
          {isSearching && !isIdSearch && (
            <div className="text-ink-3 flex items-center gap-2 px-3 py-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </div>
          )}

          {/* ID search: show direct link option */}
          {idSearchValue && !linkedWorkItemIds.has(idSearchValue) && (
            <button
              onClick={() => handleLinkClick(idSearchValue)}
              disabled={isLinking}
              className="hover:bg-bg-2 flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50"
            >
              <Link className="text-acc-ink h-3 w-3 shrink-0" />
              <span className="text-ink-1 text-xs">
                Link work item{' '}
                <span className="text-acc-ink font-medium">
                  #{idSearchValue}
                </span>
              </span>
            </button>
          )}

          {/* Text search results */}
          {!isIdSearch &&
            !isSearching &&
            filteredResults.length === 0 &&
            debouncedSearch.trim().length >= 2 && (
              <div className="text-ink-3 px-3 py-2 text-xs">
                No matching work items found
              </div>
            )}

          {!isIdSearch &&
            filteredResults.map((wi) => (
              <div
                key={wi.id}
                className="hover:bg-bg-2 group flex w-full items-center gap-2 px-3 py-1.5"
              >
                <WorkItemTypeIcon type={wi.fields.workItemType} size="sm" />
                <span className="text-acc-ink text-xs font-medium">
                  #{wi.id}
                </span>
                <span className="text-ink-1 min-w-0 flex-1 truncate text-xs">
                  {wi.fields.title}
                </span>
                <span
                  className={clsx(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    getStatusColor(wi.fields.state),
                  )}
                >
                  {wi.fields.state}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => onPreview(wi)}
                    className="text-ink-3 hover:text-ink-1 rounded p-0.5 transition-colors"
                    title="Preview work item"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleLinkClick(wi.id)}
                    disabled={isLinking}
                    className="text-ink-3 hover:text-acc-ink rounded p-0.5 transition-colors disabled:opacity-50"
                    title="Link work item"
                  >
                    <Link className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function PrWorkItems({
  workItems,
  isLoading,
  providerId,
  azureProjectId,
  azureProjectName,
  onLink,
  onUnlink,
  isLinking,
  isUnlinking,
  readOnly = false,
}: {
  workItems: AzureDevOpsWorkItem[];
  isLoading: boolean;
  providerId?: string;
  azureProjectId?: string;
  azureProjectName?: string;
  onLink?: (workItemId: number) => void;
  onUnlink?: (workItemId: number) => void;
  isLinking?: boolean;
  isUnlinking?: boolean;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<AzureDevOpsWorkItem | null>(
    null,
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, wi: AzureDevOpsWorkItem) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setPreviewItem(wi);
      }
    },
    [],
  );

  const linkedWorkItemIds = new Set(workItems.map((wi) => wi.id));

  const canLink = !!providerId && !!azureProjectId && !!azureProjectName && !!onLink;
  const canUnlink = !!onUnlink;

  const handleUnlink = useCallback(
    (e: React.MouseEvent, workItemId: number) => {
      e.preventDefault();
      e.stopPropagation();
      setUnlinkingId(workItemId);
      onUnlink?.(workItemId);
    },
    [onUnlink],
  );

  // Clear unlinking state when mutation completes
  useEffect(() => {
    if (!isUnlinking) {
      startTransition(() => setUnlinkingId(null));
    }
  }, [isUnlinking]);

  // Close search after successful link
  useEffect(() => {
    if (!isLinking && showSearch) {
      // Keep search open — user may want to link more
    }
  }, [isLinking, showSearch]);

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-ink-2 mb-3 text-sm font-medium">Work Items</h2>
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="text-ink-3 h-4 w-4 animate-spin" />
          <span className="text-ink-3 text-xs">Loading work items…</span>
        </div>
      </div>
    );
  }

  // Show section even when empty if we can link
  if (workItems.length === 0 && !canLink) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-ink-2 flex items-center gap-1 text-sm font-medium"
        >
          <ChevronDown
            className={clsx(
              'h-3.5 w-3.5 transition-transform',
              !expanded && '-rotate-90',
            )}
          />
          Work Items
          {workItems.length > 0 && (
            <span className="text-ink-3 ml-1 text-xs font-normal">
              ({workItems.length})
            </span>
          )}
        </button>

        {canLink && expanded && (
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="text-ink-3 hover:text-ink-1 ml-auto rounded p-0.5 transition-colors"
            title="Link work item"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <>
          {workItems.length > 0 && (
            <div className="space-y-1">
              {workItems.map((wi) => (
                <div
                  key={wi.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewItem(wi)}
                  onKeyDown={(e) => handleRowKeyDown(e, wi)}
                  className="hover:bg-bg-2 group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="mt-0.5 shrink-0">
                    <WorkItemTypeIcon type={wi.fields.workItemType} size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-acc-ink shrink-0 text-xs font-medium">
                        #{wi.id}
                      </span>
                      <span className="text-ink-1 min-w-0 flex-1 truncate text-xs">
                        {wi.fields.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      <span
                        className={clsx(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                          getStatusColor(wi.fields.state),
                        )}
                      >
                        {wi.fields.state}
                      </span>
                      {wi.fields.assignedTo && (
                        <span className="text-ink-3 max-w-28 min-w-0 truncate text-[10px]">
                          {wi.fields.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 shrink-0">
                    {unlinkingId === wi.id ? (
                      <Loader2 className="text-ink-3 h-3 w-3 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <a
                          href={wi.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-3 hover:text-ink-1 rounded p-0.5 transition-colors"
                          title="Open in Azure DevOps"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {canUnlink && (
                          <button
                            onClick={(e) => handleUnlink(e, wi.id)}
                            className="text-ink-3 hover:text-status-fail rounded p-0.5 transition-colors"
                            title="Unlink work item"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {workItems.length === 0 && !showSearch && (
            <p className="text-ink-3 px-2 text-xs italic">
              No linked work items
            </p>
          )}

          {showSearch && canLink && (
            <WorkItemSearchInput
              providerId={providerId}
              azureProjectId={azureProjectId}
              azureProjectName={azureProjectName}
              linkedWorkItemIds={linkedWorkItemIds}
              onLink={onLink}
              onPreview={setPreviewItem}
              isLinking={!!isLinking}
              onClose={() => setShowSearch(false)}
            />
          )}
        </>
      )}

      {/* Work item preview modal */}
      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={
          previewItem ? (
            <span className="flex items-center gap-2">
              <WorkItemTypeIcon type={previewItem.fields.workItemType} />
              <span className="text-ink-2 text-sm font-medium">
                #{previewItem.id}
              </span>
              <span className="text-ink-1 text-sm">
                {previewItem.fields.title}
              </span>
            </span>
          ) : undefined
        }
        size="xl"
        panelClassName="h-[85vh]"
        contentClassName="flex min-h-0 flex-1 overflow-hidden p-4"
      >
        <WorkItemPreview
          workItem={previewItem}
          providerId={providerId}
          projectName={previewItem?.fields.teamProject ?? azureProjectName}
          showCommentsAside
          readOnly={readOnly}
        />
      </Modal>
    </div>
  );
}
