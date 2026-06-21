import { BookOpen, Pencil, Trash2, Undo2, Wand2 } from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useSkillContent, useUpdateSkill } from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import clsx from 'clsx';
import type { ManagedSkill } from '@shared/skill-types';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import type { ReactNode } from 'react';
import { Switch } from '@/common/ui/switch';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useToastStore } from '@/stores/toasts';

type DetailMode = 'read' | 'edit';

function getSourceLabel(skill: ManagedSkill): string {
  if (skill.source === 'plugin') {
    return skill.pluginName ? `Plugin (${skill.pluginName})` : 'Plugin';
  }
  return skill.source === 'user' ? 'User' : 'Project';
}

function getSourceProvenanceLabel(skill: ManagedSkill): string | undefined {
  const provenance = skill.sourceProvenance;
  if (!provenance) return undefined;
  return `Source: ${provenance.owner}/${provenance.repo} @ ${provenance.commit.slice(0, 6)}`;
}

function ModeTab({
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

export function SkillDetails({
  skill,
  onToggleEnabled,
  onDelete,
  onImproveWithAgent,
}: {
  skill: ManagedSkill;
  onToggleEnabled?: (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => void;
  onDelete?: (skillPath: string) => void;
  onImproveWithAgent?: (skillPath: string, skillName: string) => void;
}) {
  const { data, isLoading, error } = useSkillContent(skill.skillPath);
  const updateSkill = useUpdateSkill();
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

  // Load content into editor when data arrives
  useEffect(() => {
    if (data?.content) {
      startTransition(() => setEditedContent(data.content));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    }
  }, [data]);

  const handleContentChange = useCallback((value: string) => {
    setEditedContent(value);
    if (initializedRef.current) setHasChanges(true);
  }, []);

  const handleSave = useCallback(
    async (showToast = true) => {
      if (!skill.editable) return;
      pendingContentSaveRef.current = editedContent;
      if (savingContentRef.current) return;

      savingContentRef.current = true;
      try {
        const backendType =
          (Object.keys(skill.enabledBackends).find(
            (k) => skill.enabledBackends[k as AgentBackendType],
          ) as AgentBackendType) ?? 'claude-code';
        while (pendingContentSaveRef.current !== null) {
          const contentToSave = pendingContentSaveRef.current;
          pendingContentSaveRef.current = null;
          await updateSkill.mutateAsync({
            skillPath: skill.skillPath,
            backendType,
            name: data?.name ?? skill.name,
            description: data?.description ?? skill.description,
            content: contentToSave,
          });
          if (currentEditedContentRef.current === contentToSave) {
            setHasChanges(false);
          }
        }
        if (showToast) addToast({ message: 'Skill saved', type: 'success' });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save skill';
        addToast({ message, type: 'error' });
      } finally {
        savingContentRef.current = false;
      }
    },
    [skill, data, editedContent, updateSkill, addToast],
  );

  useEffect(() => {
    if (!mode || mode !== 'edit' || !hasChanges || !skill.editable) return;

    const saveTimeout = window.setTimeout(() => {
      void handleSave(false);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [handleSave, hasChanges, mode, skill.editable]);

  const handleDiscard = useCallback(() => {
    if (data?.content) {
      setEditedContent(data.content);
      setHasChanges(false);
    }
  }, [data]);

  // Keyboard shortcuts
  const handleSaveRef = useLatestRef(handleSave);

  useRegisterKeyboardBindings('skill-detail', {
    'cmd+s': () => {
      if (mode === 'edit' && hasChanges && skill.editable) {
        handleSaveRef.current();
      }
      return true;
    },
    'cmd+e': () => {
      if (skill.editable) {
        setMode((m) => (m === 'edit' ? 'read' : 'edit'));
      }
      return true;
    },
  });

  const lineCount = editedContent.split('\n').length;
  const charCount = editedContent.length;
  const sourceProvenanceLabel = getSourceProvenanceLabel(skill);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/[0.18]">
      {/* ── Detail header ── */}
      <div className="border-line-soft flex shrink-0 items-center gap-3 border-b px-5 py-3">
        {/* Skill identity */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Wand2 size={16} className="text-acc-ink shrink-0" />
          <div className="text-ink-0 min-w-0 truncate text-sm font-semibold tracking-tight">
            {skill.name}
          </div>
        </div>

        {/* Mode segmented control */}
        <div className="bg-bg-0 border-glass-border flex shrink-0 gap-0.5 rounded-md border p-0.5">
          <ModeTab
            mode="read"
            activeMode={mode}
            icon={<BookOpen size={12} />}
            label="Read"
            onClick={setMode}
          />
          {skill.editable && (
            <ModeTab
              mode="edit"
              activeMode={mode}
              icon={<Pencil size={12} />}
              label="Edit"
              onClick={setMode}
            />
          )}
        </div>

        {/* Actions */}
        {onImproveWithAgent && skill.editable && (
          <Button
            type="button"
            onClick={() => onImproveWithAgent(skill.skillPath, skill.name)}
            size="sm"
            variant="ghost"
            title="Improve with Agent"
          >
            <Wand2 size={13} />
          </Button>
        )}
        {onDelete &&
          skill.editable &&
          (confirmingDelete ? (
            <Button
              type="button"
              onClick={() => {
                onDelete(skill.skillPath);
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
              title="Delete skill"
            >
              <Trash2 size={14} />
            </button>
          ))}
      </div>

      {/* ── Backend toggles & metadata strip ── */}
      <div className="border-line-soft flex shrink-0 flex-wrap items-center gap-3 border-b bg-black/[0.12] px-5 py-2.5">
        <span className="text-ink-4 font-mono text-[10px] tracking-wider uppercase">
          Enabled in
        </span>
        {Object.entries(skill.enabledBackends).map(([backend, enabled]) => {
          const backendType = backend as AgentBackendType;
          const label =
            backendType === 'claude-code'
              ? 'Claude Code'
              : backendType === 'opencode'
                ? 'OpenCode'
                : 'Codex';
          return (
            <Switch
              key={backend}
              checked={!!enabled}
              onChange={() => onToggleEnabled?.(skill, backendType)}
              label={label}
              disabled={!skill.editable || !onToggleEnabled}
            />
          );
        })}
        <div className="flex-1" />
        {sourceProvenanceLabel && (
          <span className="text-ink-4 font-mono text-[10px] tracking-wider">
            {sourceProvenanceLabel}
          </span>
        )}
        <Chip size="xs" color="neutral">
          {getSourceLabel(skill)}
        </Chip>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Main content pane */}
        <div className="flex min-w-0 flex-1 flex-col overflow-auto p-5">
          {isLoading && (
            <p className="text-ink-3 py-8 text-center text-sm">
              Loading content...
            </p>
          )}
          {error && (
            <p className="text-status-fail py-8 text-center text-sm">
              Failed to load skill content.
            </p>
          )}

          {!isLoading && !error && mode === 'read' && (
            <div className="mx-auto w-full max-w-2xl text-xs leading-relaxed">
              <MarkdownContent content={data?.content || 'No content found.'} />
            </div>
          )}

          {!isLoading && !error && mode === 'edit' && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Editor chrome */}
              <div className="border-glass-border flex items-center gap-2 rounded-t-lg border border-b-0 bg-black/20 px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase">
                <Pencil size={11} className="text-ink-3" />
                <span className="text-ink-3">SKILL.md</span>
                <div className="flex-1" />
                {hasChanges && <span className="text-acc-ink">● modified</span>}
              </div>
              <textarea
                value={editedContent}
                onChange={(e) => handleContentChange(e.target.value)}
                spellCheck={false}
                className="border-glass-border bg-bg-0/60 text-ink-1 caret-acc min-h-0 flex-1 resize-none rounded-b-lg border p-4 font-mono text-sm leading-relaxed focus:outline-none"
              />
              {/* Save bar */}
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
                {(hasChanges || updateSkill.isPending) && (
                  <span className="text-ink-4 font-mono text-[11px]">
                    {updateSkill.isPending
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
