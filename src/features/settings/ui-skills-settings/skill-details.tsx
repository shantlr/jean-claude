import clsx from 'clsx';
import { BookOpen, Pencil, Save, Trash2, Undo2, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { Switch } from '@/common/ui/switch';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { useSkillContent, useUpdateSkill } from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

type DetailMode = 'read' | 'edit';

function getSourceLabel(skill: ManagedSkill): string {
  if (skill.source === 'plugin') {
    return skill.pluginName ? `Plugin (${skill.pluginName})` : 'Plugin';
  }
  return skill.source === 'user' ? 'User' : 'Project';
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

  // Load content into editor when data arrives
  useEffect(() => {
    if (data?.content) {
      setEditedContent(data.content);
      initializedRef.current = true;
      setHasChanges(false);
    }
  }, [data?.content]);

  const handleContentChange = useCallback((value: string) => {
    setEditedContent(value);
    if (initializedRef.current) setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!skill.editable) return;
    try {
      const backendType =
        (Object.keys(skill.enabledBackends).find(
          (k) => skill.enabledBackends[k as AgentBackendType],
        ) as AgentBackendType) ?? 'claude-code';
      await updateSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType,
        name: data?.name ?? skill.name,
        description: data?.description ?? skill.description,
        content: editedContent,
      });
      setHasChanges(false);
      addToast({ message: 'Skill saved', type: 'success' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save skill';
      addToast({ message, type: 'error' });
    }
  }, [skill, data, editedContent, updateSkill, addToast]);

  const handleDiscard = useCallback(() => {
    if (data?.content) {
      setEditedContent(data.content);
      setHasChanges(false);
    }
  }, [data?.content]);

  // Keyboard shortcuts
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

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
          const isClaude = backendType === 'claude-code';
          const label = isClaude ? 'Claude Code' : 'OpenCode';
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
                  onClick={handleSave}
                  disabled={!hasChanges || updateSkill.isPending}
                  loading={updateSkill.isPending}
                  variant="primary"
                  size="sm"
                  icon={<Save size={13} />}
                >
                  Save changes
                </Button>
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
