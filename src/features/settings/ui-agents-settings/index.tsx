import {
  ArrowLeft,
  BookOpen,
  Bot,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';



import {
  DetailPlaceholder,
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import {
  useAgentContent,
  useCreateAgent,
  useDeleteAgent,
  useDisableAgent,
  useEnableAgent,
  useHasLegacyAgents,
  useLegacyAgentMigrationExecute,
  useLegacyAgentMigrationPreview,
  useManagedAgents,
  useUpdateAgent,
} from '@/hooks/use-managed-agents';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Chip } from '@/common/ui/chip';
import { IconButton } from '@/common/ui/icon-button';
import type { ManagedAgent } from '@shared/agent-management-types';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { Switch } from '@/common/ui/switch';
import { useSkillsRailWidth } from '@/stores/navigation';
import { useToastStore } from '@/stores/toasts';



const BACKENDS: AgentBackendType[] = ['claude-code', 'opencode'];

type DetailMode = 'read' | 'edit';

function backendLabel(backendType: AgentBackendType): string {
  return backendType === 'claude-code' ? 'Claude Code' : 'OpenCode';
}

function extractBody(raw: string): string {
  const match = raw.match(/^---\n[\s\S]*?\n---\n?/);
  return (match ? raw.slice(match[0].length) : raw).trim();
}

function DetailModeTab({
  mode,
  activeMode,
  icon,
  label,
  onClick,
}: {
  mode: DetailMode;
  activeMode: DetailMode;
  icon: ReactNode;
  label: string;
  onClick: (mode: DetailMode) => void;
}) {
  const isActive = mode === activeMode;
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
        isActive
          ? 'bg-acc-soft text-acc-ink'
          : 'text-ink-3 hover:text-ink-1 hover:bg-glass-light',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AgentRow({
  agent,
  isActive,
  onClick,
}: {
  agent: ManagedAgent;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <ListItemButton
      label={agent.name}
      isActive={isActive}
      isDimmed={!Object.values(agent.enabledBackends).some(Boolean)}
      size="compact"
      onClick={onClick}
      renderIcon={({ isActive: active, isDimmed }) => (
        <Bot
          size={14}
          className="shrink-0"
          style={{
            color: isDimmed
              ? 'oklch(0.4 0.01 280)'
              : active
                ? 'oklch(0.78 0.18 295)'
                : 'oklch(0.78 0.16 295)',
          }}
        />
      )}
      suffix={
        !agent.managed ? (
          <Chip size="xs" color="amber">
            legacy
          </Chip>
        ) : undefined
      }
    />
  );
}

function AgentRail({
  managedAgents,
  legacyAgents,
  selectedPath,
  hasLegacyAgents,
  onSelect,
  onAdd,
  onMigrate,
}: {
  managedAgents: ManagedAgent[];
  legacyAgents: ManagedAgent[];
  selectedPath: string | null;
  hasLegacyAgents?: boolean;
  onSelect: (agentPath: string) => void;
  onAdd: () => void;
  onMigrate: () => void;
}) {
  const { width, setWidth, minWidth, maxWidth } = useSkillsRailWidth();
  const onWidthChange = useCallback((w: number) => setWidth(w), [setWidth]);

  return (
    <ListPane
      width={width}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onWidthChange={onWidthChange}
      title="Agents"
      count={managedAgents.length + legacyAgents.length}
      headerActions={
        <div className="flex shrink-0 items-center gap-0.5">
          {hasLegacyAgents && (
            <button
              type="button"
              onClick={onMigrate}
              className="rounded p-1 transition-colors hover:bg-white/6 hover:text-white"
              style={{ color: 'oklch(0.7 0.01 280)' }}
              title="Migrate manually installed agents"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onAdd}
            className="rounded p-1 transition-colors"
            style={{ color: 'oklch(0.78 0.18 295)' }}
            title="Add agent"
          >
            <Plus size={13} />
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto">
        {managedAgents.length > 0 && (
          <div>
            <ListGroupHeader
              label={`My Agents (${managedAgents.length})`}
              accent
            />
            {managedAgents.map((agent) => (
              <AgentRow
                key={agent.agentPath}
                agent={agent}
                isActive={selectedPath === agent.agentPath}
                onClick={() => onSelect(agent.agentPath)}
              />
            ))}
          </div>
        )}

        {legacyAgents.length > 0 && (
          <div>
            <ListGroupHeader label={`Installed (${legacyAgents.length})`} />
            {legacyAgents.map((agent) => (
              <AgentRow
                key={agent.agentPath}
                agent={agent}
                isActive={selectedPath === agent.agentPath}
                onClick={() => onSelect(agent.agentPath)}
              />
            ))}
          </div>
        )}
      </div>
    </ListPane>
  );
}

function AgentEditor({
  agent,
  onClose,
  onSaved,
}: {
  agent?: ManagedAgent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!agent;
  const { data } = useAgentContent(agent?.agentPath ?? null);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [enabledBackends, setEnabledBackends] = useState<AgentBackendType[]>([
    'claude-code',
    'opencode',
  ]);
  const [hasChanges, setHasChanges] = useState(false);
  const initializedRef = useRef(false);
  const currentContentRef = useRef(content);
  const savingEditorRef = useRef(false);
  const pendingEditorSaveRef = useRef<string | null>(null);

  useEffect(() => {
    currentContentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (data) {
      startTransition(() => setName(data.name));
      startTransition(() => setDescription(data.description));
      startTransition(() => setContent(data.content));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    } else if (!agent) {
      startTransition(() => setName(''));
      startTransition(() => setDescription(''));
      startTransition(() => setContent(''));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    }
  }, [agent, data]);

  const save = useCallback(
    async (closeAfterSave = true) => {
      if (agent) {
        pendingEditorSaveRef.current = content;
        if (savingEditorRef.current) return;
        savingEditorRef.current = true;
      }

      try {
        if (agent) {
          while (pendingEditorSaveRef.current !== null) {
            const contentToSave = pendingEditorSaveRef.current;
            pendingEditorSaveRef.current = null;
            await updateAgent.mutateAsync({
              agentPath: agent.agentPath,
              content: contentToSave,
            });
            if (currentContentRef.current === contentToSave) {
              setHasChanges(false);
            }
          }
        } else {
          await createAgent.mutateAsync({
            enabledBackends,
            name,
            description,
            content,
          });
        }
        if (closeAfterSave) onSaved();
      } catch (error) {
        addToast({
          message:
            error instanceof Error ? error.message : 'Failed to save agent',
          type: 'error',
        });
      } finally {
        if (agent) savingEditorRef.current = false;
      }
    },
    [
      addToast,
      agent,
      content,
      createAgent,
      description,
      enabledBackends,
      name,
      onSaved,
      updateAgent,
    ],
  );

  const valid =
    isEditing || (name.trim().length > 0 && enabledBackends.length > 0);
  const pending = createAgent.isPending || updateAgent.isPending;

  useEffect(() => {
    if (!isEditing || !hasChanges || !agent) return;

    const saveTimeout = window.setTimeout(() => {
      void save(false);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [agent, hasChanges, isEditing, save]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-glass-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <IconButton
            onClick={onClose}
            icon={<ArrowLeft />}
            tooltip="Back"
            size="sm"
          />
          <h2 className="text-ink-1 text-lg font-semibold">
            {isEditing ? 'Edit Agent' : 'New Agent'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onClose}>
            {isEditing ? 'Close' : 'Cancel'}
          </Button>
          {isEditing ? (
            (hasChanges || pending) && (
              <span className="text-ink-3 text-xs">
                {pending ? 'Saving...' : 'Changes save automatically'}
              </span>
            )
          ) : (
            <Button
              type="button"
              onClick={() => save()}
              disabled={!valid || pending}
              loading={pending}
              variant="primary"
            >
              {pending ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="border-glass-border flex shrink-0 flex-wrap items-center gap-4 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-ink-2 text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-custom-agent"
              className="border-glass-border bg-bg-1 text-ink-1 w-48 rounded border px-2 py-1 text-sm outline-none"
            />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label className="text-ink-2 text-sm font-medium">
              Description
            </label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A brief description"
              className="border-glass-border bg-bg-1 text-ink-1 min-w-0 flex-1 rounded border px-2 py-1 text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-ink-2 text-sm font-medium">Backends</span>
            {BACKENDS.map((backend) => (
              <Checkbox
                key={backend}
                checked={enabledBackends.includes(backend)}
                onChange={(checked) =>
                  setEnabledBackends((prev) =>
                    checked
                      ? [...prev, backend]
                      : prev.filter((item) => item !== backend),
                  )
                }
                label={backendLabel(backend)}
                size="sm"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="border-glass-border flex items-center gap-2 rounded-t-lg border border-b-0 bg-black/20 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase">
          <Pencil size={11} className="text-ink-3" />
          <span className="text-ink-3">AGENT.md</span>
        </div>
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (isEditing && initializedRef.current) setHasChanges(true);
          }}
          spellCheck={false}
          placeholder="---\nname: agent-name\ndescription: When to use this agent\n---\n\nAgent instructions..."
          className="border-glass-border bg-bg-0/60 text-ink-1 caret-acc min-h-0 flex-1 resize-none rounded-b-lg border p-4 font-mono text-sm leading-relaxed focus:outline-none"
        />
      </div>
    </div>
  );
}

function AgentDetails({
  agent,
  onDelete,
  onToggleEnabled,
}: {
  agent: ManagedAgent;
  onDelete: () => void;
  onToggleEnabled: (backendType: AgentBackendType) => void;
}) {
  const { data, isLoading, error } = useAgentContent(agent.agentPath);
  const updateAgent = useUpdateAgent();
  const addToast = useToastStore((s) => s.addToast);
  const [mode, setMode] = useState<DetailMode>('read');
  const [editedContent, setEditedContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const initializedRef = useRef(false);
  const currentEditedContentRef = useRef(editedContent);
  const savingContentRef = useRef(false);
  const pendingContentSaveRef = useRef<string | null>(null);

  useEffect(() => {
    currentEditedContentRef.current = editedContent;
  }, [editedContent]);

  useEffect(() => {
    if (data?.content) {
      startTransition(() => setEditedContent(data.content));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    }
  }, [data]);

  const handleSave = useCallback(
    async (showToast = true) => {
      pendingContentSaveRef.current = editedContent;
      if (savingContentRef.current) return;

      savingContentRef.current = true;
      try {
        while (pendingContentSaveRef.current !== null) {
          const contentToSave = pendingContentSaveRef.current;
          pendingContentSaveRef.current = null;
          await updateAgent.mutateAsync({
            agentPath: agent.agentPath,
            content: contentToSave,
          });
          if (currentEditedContentRef.current === contentToSave) {
            setHasChanges(false);
          }
        }
        if (showToast) addToast({ message: 'Agent saved', type: 'success' });
      } catch (error) {
        addToast({
          message:
            error instanceof Error ? error.message : 'Failed to save agent',
          type: 'error',
        });
      } finally {
        savingContentRef.current = false;
      }
    },
    [addToast, agent.agentPath, editedContent, updateAgent],
  );

  useEffect(() => {
    if (mode !== 'edit' || !hasChanges) return;

    const saveTimeout = window.setTimeout(() => {
      void handleSave(false);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [handleSave, hasChanges, mode]);

  const handleDiscard = useCallback(() => {
    if (data?.content) {
      setEditedContent(data.content);
      setHasChanges(false);
    }
  }, [data]);

  const lineCount = editedContent.split('\n').length;
  const charCount = editedContent.length;
  const sourceProvenanceLabel = agent.sourceProvenance
    ? `Source: ${agent.sourceProvenance.owner}/${agent.sourceProvenance.repo} @ ${agent.sourceProvenance.commit.slice(0, 6)}`
    : undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/[0.18]">
      <div className="border-line-soft flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Bot size={16} className="text-acc-ink shrink-0" />
          <div className="text-ink-0 min-w-0 truncate text-sm font-semibold tracking-tight">
            {agent.name}
          </div>
        </div>

        <div className="bg-bg-0 border-glass-border flex shrink-0 gap-0.5 rounded-md border p-0.5">
          <DetailModeTab
            mode="read"
            activeMode={mode}
            icon={<BookOpen size={12} />}
            label="Read"
            onClick={setMode}
          />
          <DetailModeTab
            mode="edit"
            activeMode={mode}
            icon={<Pencil size={12} />}
            label="Edit"
            onClick={setMode}
          />
        </div>

        {confirmingDelete ? (
          <Button
            type="button"
            onClick={() => {
              onDelete();
              setConfirmingDelete(false);
            }}
            onBlur={() => setConfirmingDelete(false)}
            variant="danger"
            size="sm"
            autoFocus
          >
            Delete?
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-ink-3 hover:text-status-fail hover:bg-status-fail/10 rounded p-1.5 transition-colors"
            title="Delete agent"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="border-line-soft flex shrink-0 flex-wrap items-center gap-3 border-b bg-black/[0.12] px-5 py-2.5">
        <span className="text-ink-4 font-mono text-[10px] tracking-wider uppercase">
          Enabled in
        </span>
        {BACKENDS.map((backend) => (
          <Switch
            key={backend}
            checked={!!agent.enabledBackends[backend]}
            onChange={() => onToggleEnabled(backend)}
            label={backendLabel(backend)}
            disabled={!agent.managed}
          />
        ))}
        <div className="flex-1" />
        {sourceProvenanceLabel && (
          <span className="text-ink-4 font-mono text-[10px] tracking-wider">
            {sourceProvenanceLabel}
          </span>
        )}
        <Chip size="xs" color={agent.managed ? 'green' : 'amber'}>
          {agent.managed ? 'User' : 'Legacy'}
        </Chip>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-auto p-5">
          {isLoading && (
            <p className="text-ink-3 py-8 text-center text-sm">
              Loading content...
            </p>
          )}
          {error && (
            <p className="text-status-fail py-8 text-center text-sm">
              Failed to load agent content.
            </p>
          )}
          {!isLoading && !error && mode === 'read' && (
            <div className="mx-auto w-full max-w-2xl text-xs leading-relaxed">
              <MarkdownContent
                content={
                  extractBody(data?.content ?? '') || 'No content found.'
                }
              />
            </div>
          )}
          {!isLoading && !error && mode === 'edit' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-glass-border flex items-center gap-2 rounded-t-lg border border-b-0 bg-black/20 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase">
                <Pencil size={11} className="text-ink-3" />
                <span className="text-ink-3">AGENT.md</span>
                <div className="flex-1" />
                {hasChanges && <span className="text-acc-ink">● modified</span>}
              </div>
              <textarea
                value={editedContent}
                onChange={(event) => {
                  setEditedContent(event.target.value);
                  if (initializedRef.current) setHasChanges(true);
                }}
                spellCheck={false}
                className="border-glass-border bg-bg-0/60 text-ink-1 caret-acc min-h-0 flex-1 resize-none rounded-b-lg border p-4 font-mono text-sm leading-relaxed focus:outline-none"
              />
              <div className="mt-3 flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  onClick={handleDiscard}
                  disabled={!hasChanges}
                  size="sm"
                  icon={<Undo2 size={13} />}
                >
                  Discard
                </Button>
                <div className="flex-1" />
                {(hasChanges || updateAgent.isPending) && (
                  <span className="text-ink-4 font-mono text-[11px]">
                    {updateAgent.isPending
                      ? 'Saving...'
                      : 'Changes save automatically'}
                  </span>
                )}
                <span className="text-ink-4 font-mono text-[11px]">
                  {lineCount} lines · {charCount} chars
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentMigrationDialog({ onClose }: { onClose: () => void }) {
  const previewMutation = useLegacyAgentMigrationPreview();
  const executeMutation = useLegacyAgentMigrationExecute();
  const addToast = useToastStore((s) => s.addToast);
  const previewMutateAsync = previewMutation.mutateAsync;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    previewMutateAsync()
      .then((result) => {
        setSelectedIds(
          new Set(
            result.items
              .filter((item) => item.status === 'migrate')
              .map((item) => item.id),
          ),
        );
      })
      .catch((error: unknown) => {
        addToast({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to preview agent migration',
          type: 'error',
        });
      });
  }, [addToast, previewMutateAsync]);

  const items = previewMutation.data?.items ?? [];
  const migratableCount = items.filter(
    (item) => item.status === 'migrate',
  ).length;

  const execute = async () => {
    await executeMutation.mutateAsync({ itemIds: Array.from(selectedIds) });
    onClose();
  };

  return (
    <div className="bg-bg-0/55 fixed inset-0 z-60 flex items-center justify-center">
      <div className="border-glass-border bg-bg-0 flex h-[75svh] w-[78svw] max-w-[1100px] flex-col rounded-lg border">
        <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
          <div className="space-y-2">
            <h3 className="text-ink-0 text-base font-semibold">
              Migrate Manually Installed Agents
            </h3>
            <p className="text-ink-2 text-xs">
              Jean-Claude will copy each selected agent file into canonical
              storage, then replace the original backend file with a symlink.
            </p>
          </div>
          <Button type="button" onClick={onClose} size="sm">
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {items.map((item) => (
            <label
              key={item.id}
              className="border-glass-border bg-bg-1/30 mb-2 flex items-start gap-3 rounded-lg border p-3"
            >
              <Checkbox
                checked={selectedIds.has(item.id)}
                disabled={item.status !== 'migrate'}
                onChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  });
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-ink-0 text-sm font-medium">
                  {item.name}
                </div>
                <div className="text-ink-4 truncate font-mono text-xs">
                  {backendLabel(item.backendType)}: {item.legacyPath}
                </div>
                {item.reason && (
                  <div className="text-status-warn mt-1 text-xs">
                    {item.reason}
                  </div>
                )}
              </div>
              <Chip
                size="sm"
                color={item.status === 'migrate' ? 'green' : 'amber'}
              >
                {item.status}
              </Chip>
            </label>
          ))}
          {!previewMutation.isPending && items.length === 0 && (
            <p className="text-ink-3 py-12 text-center text-sm">
              No legacy agents found.
            </p>
          )}
        </div>
        <div className="border-glass-border flex items-center justify-between border-t px-4 py-3">
          <span className="text-ink-3 text-xs">
            {selectedIds.size} selected of {migratableCount} migratable
          </span>
          <Button
            type="button"
            onClick={execute}
            disabled={selectedIds.size === 0 || executeMutation.isPending}
            loading={executeMutation.isPending}
            variant="primary"
            size="sm"
          >
            Migrate Selected
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AgentsSettings() {
  const { data: agents = [], isLoading } = useManagedAgents();
  const { data: hasLegacyAgents } = useHasLegacyAgents();
  const enableAgent = useEnableAgent();
  const disableAgent = useDisableAgent();
  const deleteAgent = useDeleteAgent();
  const addToast = useToastStore((s) => s.addToast);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);

  const { managedAgents, legacyAgents } = useMemo(
    () => ({
      managedAgents: agents.filter((agent) => agent.managed),
      legacyAgents: agents.filter((agent) => !agent.managed),
    }),
    [agents],
  );

  const firstAgentPath = useMemo(
    () => [...managedAgents, ...legacyAgents][0]?.agentPath ?? null,
    [managedAgents, legacyAgents],
  );
  const effectiveSelectedPath = selectedPath ?? firstAgentPath;
  const selectedAgent = agents.find(
    (agent) => agent.agentPath === effectiveSelectedPath,
  );

  if (isLoading) return <p className="text-ink-3">Loading...</p>;

  if (editingPath) {
    return (
      <AgentEditor
        agent={
          editingPath === 'new'
            ? undefined
            : agents.find((agent) => agent.agentPath === editingPath)
        }
        onClose={() => setEditingPath(null)}
        onSaved={() => {
          setEditingPath(null);
          setSelectedPath(null);
        }}
      />
    );
  }

  return (
    <ListDetailLayout
      list={
        <AgentRail
          managedAgents={managedAgents}
          legacyAgents={legacyAgents}
          selectedPath={effectiveSelectedPath}
          hasLegacyAgents={hasLegacyAgents}
          onSelect={setSelectedPath}
          onAdd={() => setEditingPath('new')}
          onMigrate={() => setShowMigrationDialog(true)}
        />
      }
      detail={
        selectedAgent ? (
          <AgentDetails
            key={selectedAgent.agentPath}
            agent={selectedAgent}
            onDelete={async () => {
              await deleteAgent.mutateAsync(selectedAgent.agentPath);
              setSelectedPath(null);
            }}
            onToggleEnabled={async (backendType) => {
              try {
                if (selectedAgent.enabledBackends[backendType]) {
                  await disableAgent.mutateAsync({
                    agentPath: selectedAgent.agentPath,
                    backendType,
                  });
                } else {
                  await enableAgent.mutateAsync({
                    agentPath: selectedAgent.agentPath,
                    backendType,
                  });
                }
              } catch (error) {
                addToast({
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Failed to update agent backend',
                  type: 'error',
                });
              }
            }}
          />
        ) : (
          <DetailPlaceholder
            message="No agents found. Get started by adding one."
            actions={
              <div className="flex items-center justify-center gap-2">
                {hasLegacyAgents && (
                  <Button
                    type="button"
                    onClick={() => setShowMigrationDialog(true)}
                    size="sm"
                    icon={<RefreshCw size={14} />}
                  >
                    Migrate
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => setEditingPath('new')}
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                >
                  Add Agent
                </Button>
              </div>
            }
          />
        )
      }
    >
      {hasLegacyAgents && !showMigrationDialog && (
        <div className="border-status-run/30 bg-status-run/10 absolute right-4 bottom-4 z-10 rounded-lg border p-3">
          <Button
            type="button"
            onClick={() => setShowMigrationDialog(true)}
            size="sm"
          >
            Migrate to Jean-Claude
          </Button>
        </div>
      )}

      {showMigrationDialog && (
        <AgentMigrationDialog onClose={() => setShowMigrationDialog(false)} />
      )}
    </ListDetailLayout>
  );
}
