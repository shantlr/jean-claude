import clsx from 'clsx';
import {
  AlertTriangle,
  Download,
  GitBranch,
  Github,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Chip } from '@/common/ui/chip';
import { Input } from '@/common/ui/input';
import {
  DetailPlaceholder,
  ListDetailLayout,
  ListPane,
} from '@/common/ui/list-detail-layout';
import {
  useAddGithubSource,
  useInstallSourceItems,
  useRefreshSource,
  useSources,
  useUpdateSourceInstall,
} from '@/hooks/use-sources';
import { formatRelativeTime } from '@/lib/time';
import { useSkillsRailWidth } from '@/stores/navigation';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  SourceInstallStatus,
  SourceItemKind,
  SourceItemView,
  SourceView,
} from '@shared/source-management-types';

type SourceItemSelection = {
  targetName: string;
  enabledBackends: Record<AgentBackendType, boolean>;
};

const BACKENDS: Array<{ type: AgentBackendType; label: string }> = [
  { type: 'claude-code', label: 'Claude Code' },
  { type: 'opencode', label: 'OpenCode' },
];

function shortCommit(commit: string): string {
  return commit ? commit.slice(0, 7) : 'unknown';
}

function formatSourceTime(value: string | undefined): string {
  if (!value) return 'never';
  return formatRelativeTime(value);
}

function sourceItemKindLabel(kind: SourceItemKind): string {
  return kind === 'skill' ? 'Skills' : 'Agents';
}

function isInstallableStatus(status: SourceInstallStatus): boolean {
  return status === 'available';
}

function targetNameError(
  item: SourceItemView,
  targetName: string,
): string | null {
  if (!targetName.trim()) return 'Target name is required';
  const normalized = targetName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!/[a-z0-9]/.test(normalized)) {
    return `${item.kind === 'skill' ? 'Skill' : 'Agent'} target name must include a letter or number`;
  }
  return null;
}

function statusLabel(status: SourceInstallStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'installed':
      return 'Installed';
    case 'up-to-date':
      return 'Up to date';
    case 'update-available':
      return 'Update available';
    case 'local-changes':
      return 'Local changes';
    case 'source-missing':
      return 'Source missing';
    case 'installed-missing':
      return 'Installed missing';
    case 'conflict':
      return 'Conflict';
  }
}

function StatusBadge({ status }: { status: SourceInstallStatus }) {
  const color =
    status === 'available'
      ? 'green'
      : status === 'up-to-date' || status === 'installed'
        ? 'blue'
        : status === 'update-available'
          ? 'purple'
          : status === 'conflict' ||
              status === 'local-changes' ||
              status === 'source-missing' ||
              status === 'installed-missing'
            ? 'amber'
            : 'neutral';

  return (
    <Chip size="xs" color={color}>
      {statusLabel(status)}
    </Chip>
  );
}

function statusHelpText(status: SourceInstallStatus): string | null {
  switch (status) {
    case 'available':
      return null;
    case 'up-to-date':
    case 'installed':
      return 'Installed item matches source.';
    case 'update-available':
      return 'Source has changed since install.';
    case 'local-changes':
      return 'Installed item has local changes; update will overwrite them.';
    case 'source-missing':
      return 'Source item is missing from the repository.';
    case 'installed-missing':
      return 'Installed item is missing locally.';
    case 'conflict':
      return 'Install cannot be safely updated automatically.';
  }
}

function SourceItemUpdateControl({
  item,
  isUpdating,
  onUpdate,
}: {
  item: SourceItemView;
  isUpdating: boolean;
  onUpdate: (item: SourceItemView) => void;
}) {
  if (item.status === 'update-available' || item.status === 'local-changes') {
    return (
      <Button
        type="button"
        size="xs"
        variant="secondary"
        icon={<RefreshCw size={12} />}
        loading={isUpdating}
        disabled={!item.install}
        onClick={() => onUpdate(item)}
      >
        Update
      </Button>
    );
  }

  if (item.status === 'up-to-date' || item.status === 'installed') {
    return (
      <span className="text-ink-3 rounded bg-white/[0.04] px-2 py-1 text-xs">
        Up to date
      </span>
    );
  }

  if (
    item.status === 'source-missing' ||
    item.status === 'installed-missing' ||
    item.status === 'conflict'
  ) {
    return (
      <span className="text-status-warn flex items-center gap-1 text-xs">
        <AlertTriangle size={12} />
        Needs attention
      </span>
    );
  }

  return null;
}

function SourceRow({
  source,
  isActive,
  onSelect,
}: {
  source: SourceView;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full max-w-full min-w-0 flex-col gap-1.5 overflow-hidden px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      style={{
        background: isActive
          ? 'color-mix(in oklch, oklch(0.78 0.18 295) 18%, transparent)'
          : 'transparent',
        borderLeft: isActive
          ? '2px solid oklch(0.78 0.18 295)'
          : '2px solid transparent',
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Github
          size={14}
          className={clsx('shrink-0', isActive ? 'text-acc-ink' : 'text-ink-3')}
        />
        <span className="text-ink-0 min-w-0 truncate text-sm font-medium">
          {source.owner}/{source.repo}
        </span>
      </div>
      <div className="text-ink-3 flex min-w-0 items-center gap-1.5 text-xs">
        <GitBranch size={11} className="shrink-0" />
        <span className="truncate">{source.branch}</span>
        <span>·</span>
        <span className="font-mono">{shortCommit(source.currentCommit)}</span>
      </div>
      {source.error ? (
        <div className="text-status-fail flex min-w-0 items-center gap-1.5 text-xs">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{source.error}</span>
        </div>
      ) : null}
    </button>
  );
}

function SourceAddForm({
  value,
  error,
  isAdding,
  inputRef,
  onChange,
  onSubmit,
}: {
  value: string;
  error: string | null;
  isAdding: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="GitHub repository URL"
          size="sm"
          error={!!error}
          disabled={isAdding}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          icon={<Plus size={14} />}
          loading={isAdding}
          disabled={!value.trim() || isAdding}
          className="shrink-0 px-2"
          aria-label="Add source"
          title="Add source"
        />
      </div>
      {error ? <p className="text-status-fail text-xs">{error}</p> : null}
    </form>
  );
}

function SourceItemSection({
  title,
  items,
  selections,
  updatingInstallId,
  onSelectionChange,
  onUpdate,
}: {
  title: string;
  items: SourceItemView[];
  selections: Record<string, SourceItemSelection>;
  updatingInstallId: string | null;
  onSelectionChange: (
    item: SourceItemView,
    update: SourceItemSelection | null,
  ) => void;
  onUpdate: (item: SourceItemView) => void;
}) {
  return (
    <section className="border-line-soft bg-glass-subtle rounded-lg border">
      <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-ink-0 text-sm font-semibold">{title}</h3>
        <span className="text-ink-3 text-xs">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="divide-line-soft divide-y">
          {items.map((item) => {
            const selection = selections[item.id] ?? null;
            const isInstallable = isInstallableStatus(item.status);
            const helpText = statusHelpText(item.status);
            const error = selection
              ? targetNameError(item, selection.targetName)
              : null;

            return (
              <div key={item.id} className="px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    size="sm"
                    checked={!!selection}
                    disabled={!isInstallable}
                    onChange={(checked) =>
                      onSelectionChange(
                        item,
                        checked
                          ? {
                              targetName: item.detectedName,
                              enabledBackends: {
                                'claude-code': true,
                                opencode: true,
                                codex: false,
                              },
                            }
                          : null,
                      )
                    }
                    className="pt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-ink-0 min-w-0 truncate text-sm font-medium">
                          {item.detectedName}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <SourceItemUpdateControl
                        item={item}
                        isUpdating={updatingInstallId === item.install?.id}
                        onUpdate={onUpdate}
                      />
                    </div>
                    <div className="text-ink-3 mt-1 truncate font-mono text-xs">
                      {item.sourceRelativePath}
                    </div>
                    {helpText ? (
                      <div className="text-ink-4 mt-1 text-xs">{helpText}</div>
                    ) : null}
                  </div>
                </div>

                {selection ? (
                  <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      size="sm"
                      value={selection.targetName}
                      onChange={(event) =>
                        onSelectionChange(item, {
                          ...selection,
                          targetName: event.target.value,
                        })
                      }
                      placeholder="Target name"
                      aria-label={`Target name for ${item.detectedName}`}
                      error={!!error}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      {BACKENDS.map((backend) => (
                        <Checkbox
                          key={backend.type}
                          size="sm"
                          label={backend.label}
                          checked={selection.enabledBackends[backend.type]}
                          onChange={(checked) =>
                            onSelectionChange(item, {
                              ...selection,
                              enabledBackends: {
                                ...selection.enabledBackends,
                                [backend.type]: checked,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                    {error ? (
                      <p className="text-status-fail text-xs sm:col-span-2">
                        {error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-ink-3 text-sm">
            No {title.toLowerCase()} detected.
          </p>
        </div>
      )}
    </section>
  );
}

function SourceDetail({ source }: { source: SourceView }) {
  const refreshSource = useRefreshSource();
  const installSourceItems = useInstallSourceItems();
  const updateSourceInstall = useUpdateSourceInstall();
  const addToast = useToastStore((s) => s.addToast);
  const [selections, setSelections] = useState<
    Record<string, SourceItemSelection>
  >({});
  const [installError, setInstallError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingInstallId, setUpdatingInstallId] = useState<string | null>(
    null,
  );

  const itemsByKind = useMemo(
    () => ({
      skill: source.items.filter((item) => item.kind === 'skill'),
      agent: source.items.filter((item) => item.kind === 'agent'),
    }),
    [source.items],
  );
  const selectedItems = useMemo(
    () => source.items.filter((item) => selections[item.id]),
    [selections, source.items],
  );
  const hasInvalidSelection = selectedItems.some((item) => {
    const selection = selections[item.id];
    return (
      !!targetNameError(item, selection.targetName) ||
      !Object.values(selection.enabledBackends).some(Boolean)
    );
  });

  useEffect(() => {
    const installableItems = new Map(
      source.items
        .filter((item) => isInstallableStatus(item.status))
        .map((item) => [item.id, item]),
    );
    setSelections((current) => {
      let changed = false;
      const next: Record<string, SourceItemSelection> = {};

      for (const [itemId, selection] of Object.entries(current)) {
        const item = installableItems.get(itemId);
        if (!item) {
          changed = true;
          continue;
        }

        const targetName = selection.targetName || item.detectedName;
        next[itemId] =
          targetName === selection.targetName
            ? selection
            : {
                ...selection,
                targetName,
              };
        if (next[itemId] !== selection) changed = true;
      }

      return changed ? next : current;
    });
  }, [source.id, source.items]);

  const handleSelectionChange = useCallback(
    (item: SourceItemView, update: SourceItemSelection | null) => {
      setInstallError(null);
      setUpdateError(null);
      setSelections((current) => {
        if (!update) {
          if (!current[item.id]) return current;
          const { [item.id]: _removed, ...next } = current;
          return next;
        }

        return {
          ...current,
          [item.id]: update,
        };
      });
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    try {
      await refreshSource.mutateAsync(source.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh source';
      addToast({ message, type: 'error' });
    }
  }, [addToast, refreshSource, source.id]);

  const handleInstall = useCallback(async () => {
    const items = selectedItems.flatMap((item) => {
      const selection = selections[item.id];
      if (!selection) return [];
      return {
        sourceId: source.id,
        sourceItemId: item.id,
        targetName: selection.targetName.trim(),
        enabledBackends: BACKENDS.filter(
          (backend) => selection.enabledBackends[backend.type],
        ).map((backend) => backend.type),
      };
    });

    setInstallError(null);
    try {
      await installSourceItems.mutateAsync({ items });
      setSelections({});
      addToast({
        message: `Installed ${items.length} ${items.length === 1 ? 'item' : 'items'}`,
        type: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to install source items';
      setInstallError(message);
      addToast({ message, type: 'error' });
    }
  }, [addToast, installSourceItems, selectedItems, selections, source.id]);

  const handleUpdate = useCallback(
    async (item: SourceItemView) => {
      const installId = item.install?.id;
      if (!installId) return;

      let overwriteLocalChanges = false;
      if (item.status === 'local-changes') {
        const confirmed = window.confirm(
          `Update ${item.detectedName} and overwrite local changes?`,
        );
        if (!confirmed) return;
        overwriteLocalChanges = true;
      }

      setInstallError(null);
      setUpdateError(null);
      setUpdatingInstallId(installId);
      try {
        await updateSourceInstall.mutateAsync({
          sourceId: source.id,
          installId,
          overwriteLocalChanges,
        });
        addToast({ message: `Updated ${item.detectedName}`, type: 'success' });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update install';
        setUpdateError(message);
        addToast({ message, type: 'error' });
      } finally {
        setUpdatingInstallId((current) =>
          current === installId ? null : current,
        );
      }
    },
    [addToast, source.id, updateSourceInstall],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/[0.18]">
      <div className="border-line-soft flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <Github size={16} className="text-acc-ink shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-ink-0 truncate text-sm font-semibold tracking-tight">
            {source.owner}/{source.repo}
          </div>
          <div className="text-ink-3 mt-0.5 truncate text-xs">{source.url}</div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<RefreshCw size={14} />}
          loading={refreshSource.isPending}
          onClick={handleRefresh}
        >
          Refresh
        </Button>
      </div>

      <div className="border-line-soft flex shrink-0 flex-wrap items-center gap-3 border-b bg-black/[0.12] px-5 py-2.5">
        <span className="text-ink-2 text-xs">Branch {source.branch}</span>
        <span className="text-ink-3 text-xs">Commit</span>
        <code className="text-ink-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">
          {shortCommit(source.currentCommit)}
        </code>
        <span className="text-ink-3 text-xs">
          Scanned {formatSourceTime(source.lastScanAt)}
        </span>
        <span className="text-ink-3 text-xs">
          Fetched {formatSourceTime(source.lastFetchedAt)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {source.error ? (
          <div className="border-status-fail/30 bg-status-fail/10 text-status-fail mb-4 rounded-lg border px-3 py-2 text-sm">
            {source.error}
          </div>
        ) : null}

        {installError ? (
          <div className="border-status-fail/30 bg-status-fail/10 text-status-fail mb-4 rounded-lg border px-3 py-2 text-sm">
            {installError}
          </div>
        ) : null}

        {updateError ? (
          <div className="border-status-fail/30 bg-status-fail/10 text-status-fail mb-4 rounded-lg border px-3 py-2 text-sm">
            {updateError}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-ink-3 text-sm">
            {selectedItems.length} selected for install
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            icon={<Download size={14} />}
            loading={installSourceItems.isPending}
            disabled={selectedItems.length === 0 || hasInvalidSelection}
            onClick={handleInstall}
          >
            Install Selected
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <SourceItemSection
            title={sourceItemKindLabel('skill')}
            items={itemsByKind.skill}
            selections={selections}
            updatingInstallId={updatingInstallId}
            onSelectionChange={handleSelectionChange}
            onUpdate={handleUpdate}
          />
          <SourceItemSection
            title={sourceItemKindLabel('agent')}
            items={itemsByKind.agent}
            selections={selections}
            updatingInstallId={updatingInstallId}
            onSelectionChange={handleSelectionChange}
            onUpdate={handleUpdate}
          />
        </div>
      </div>
    </div>
  );
}

export function SourcesSettings() {
  const {
    data: sources = [],
    error: sourcesError,
    isError: isSourcesError,
    isLoading,
  } = useSources();
  const addGithubSource = useAddGithubSource();
  const addToast = useToastStore((s) => s.addToast);
  const { width, setWidth, minWidth, maxWidth } = useSkillsRailWidth();
  const onWidthChange = useCallback(
    (nextWidth: number) => setWidth(nextWidth),
    [setWidth],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ??
    sources[0] ??
    null;
  const effectiveSelectedSourceId = selectedSource?.id ?? null;
  const sourcesErrorMessage =
    sourcesError instanceof Error
      ? sourcesError.message
      : 'Failed to load sources';

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const url = sourceUrl.trim();
      if (!url) return;

      setAddError(null);
      try {
        const source = await addGithubSource.mutateAsync({ url });
        setSourceUrl('');
        setSelectedSourceId(source.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to add GitHub source';
        setAddError(message);
        addToast({ message, type: 'error' });
      }
    },
    [addGithubSource, addToast, sourceUrl],
  );

  if (isLoading) {
    return <p className="text-ink-3">Loading sources...</p>;
  }

  return (
    <ListDetailLayout
      list={
        <ListPane
          width={width}
          minWidth={minWidth}
          maxWidth={maxWidth}
          onWidthChange={onWidthChange}
          contentClassName="overflow-x-hidden"
          headerContent={
            <SourceAddForm
              value={sourceUrl}
              error={addError}
              isAdding={addGithubSource.isPending}
              inputRef={inputRef}
              onChange={(value) => {
                setSourceUrl(value);
                if (addError) setAddError(null);
              }}
              onSubmit={handleSubmit}
            />
          }
        >
          {isSourcesError ? (
            <div className="px-4 py-6">
              <div className="border-status-fail/30 bg-status-fail/10 text-status-fail rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">Failed to load sources</p>
                    <p className="mt-1 text-xs break-words opacity-90">
                      {sourcesErrorMessage}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : sources.length > 0 ? (
            <div>
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  isActive={source.id === effectiveSelectedSourceId}
                  onSelect={() => setSelectedSourceId(source.id)}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-ink-2 text-sm font-medium">No sources yet</p>
              <p className="text-ink-3 mt-1 text-xs">
                Add a GitHub repository to scan skills and agents.
              </p>
            </div>
          )}
        </ListPane>
      }
      detail={
        selectedSource ? (
          <SourceDetail key={selectedSource.id} source={selectedSource} />
        ) : isSourcesError ? (
          <DetailPlaceholder message="Sources could not be loaded. Check the error in the source list, then try again." />
        ) : (
          <DetailPlaceholder
            message="Add a GitHub source to start discovering skills and agents."
            actions={
              <Button
                type="button"
                size="sm"
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => inputRef.current?.focus()}
              >
                Add Source
              </Button>
            }
          />
        )
      }
    />
  );
}
