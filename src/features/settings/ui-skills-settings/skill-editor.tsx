import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ArrowLeft } from 'lucide-react';


import {
  useCreateSkill,
  useSkillContent,
  useUpdateSkill,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import type { SkillScope } from '@shared/skill-types';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useToastStore } from '@/stores/toasts';



export function SkillEditor({
  skillPath,
  enabledBackends,
  scope,
  projectPath,
  onClose,
  onSaved,
}: {
  skillPath?: string;
  enabledBackends?: AgentBackendType[];
  scope: SkillScope;
  projectPath?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!skillPath;
  const { data: existing } = useSkillContent(skillPath ?? null);
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [formEnabledBackends, setFormEnabledBackends] = useState<
    AgentBackendType[]
  >(enabledBackends ?? ['claude-code', 'opencode']);

  // Track whether user has made changes (for unsaved confirmation)
  const [hasChanges, setHasChanges] = useState(false);
  const initializedRef = useRef(false);
  const currentDraftRef = useRef({ name, description, content });
  const savingSkillRef = useRef(false);
  const pendingSkillSaveRef = useRef<{
    name: string;
    description: string;
    content: string;
  } | null>(null);

  useEffect(() => {
    currentDraftRef.current = { name, description, content };
  }, [content, description, name]);

  useEffect(() => {
    if (existing) {
      startTransition(() => setName(existing.name));
      startTransition(() => setDescription(existing.description));
      startTransition(() => setContent(existing.content));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    } else if (!skillPath) {
      startTransition(() => setName(''));
      startTransition(() => setDescription(''));
      startTransition(() => setContent(''));
      initializedRef.current = true;
      startTransition(() => setHasChanges(false));
    }
  }, [existing, skillPath]);

  // Resizable split state
  const [leftWidth, setLeftWidth] = useState(0);
  const containerMeasuredRef = useRef(false);

  const onWidthChange = useCallback((w: number) => setLeftWidth(w), []);
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: leftWidth,
    minWidth: 300,
    maxWidthFraction: 0.7,
    onWidthChange,
  });

  // Initialize left width to 50% of container on mount
  useEffect(() => {
    if (containerMeasuredRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && !containerMeasuredRef.current) {
          containerMeasuredRef.current = true;
          setLeftWidth(Math.floor(entry.contentRect.width * 0.5));
          observer.disconnect();
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const markChanged = useCallback(() => {
    if (initializedRef.current) setHasChanges(true);
  }, []);

  const handleNameChange = (v: string) => {
    setName(v);
    markChanged();
  };
  const handleDescriptionChange = (v: string) => {
    setDescription(v);
    markChanged();
  };
  const handleContentChange = (v: string) => {
    setContent(v);
    markChanged();
  };

  const handleBack = () => {
    if (isEditing) {
      if (hasChanges && isValid && !isPending) void handleSave(false);
      onClose();
      return;
    }

    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them?',
      );
      if (!confirmed) return;
    }
    onClose();
  };

  const handleSave = useCallback(
    async (closeAfterSave = true) => {
      if (!isEditing && formEnabledBackends.length === 0) return;
      if (isEditing && skillPath) {
        pendingSkillSaveRef.current = { name, description, content };
        if (savingSkillRef.current) return;
        savingSkillRef.current = true;
      }

      try {
        if (isEditing && skillPath) {
          while (pendingSkillSaveRef.current !== null) {
            const draftToSave = pendingSkillSaveRef.current;
            pendingSkillSaveRef.current = null;
            await updateSkill.mutateAsync({
              skillPath,
              backendType: enabledBackends?.[0] ?? 'claude-code',
              name: draftToSave.name,
              description: draftToSave.description,
              content: draftToSave.content,
            });
            if (
              JSON.stringify(currentDraftRef.current) ===
              JSON.stringify(draftToSave)
            ) {
              setHasChanges(false);
            }
          }
        } else {
          await createSkill.mutateAsync({
            enabledBackends: formEnabledBackends,
            scope,
            projectPath,
            name,
            description,
            content,
          });
        }
        if (closeAfterSave) onSaved();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save skill';
        addToast({ message, type: 'error' });
      } finally {
        if (isEditing && skillPath) savingSkillRef.current = false;
      }
    },
    [
      addToast,
      content,
      createSkill,
      description,
      enabledBackends,
      formEnabledBackends,
      isEditing,
      name,
      onSaved,
      projectPath,
      scope,
      skillPath,
      updateSkill,
    ],
  );

  const isValid =
    name.trim().length > 0 && (isEditing || formEnabledBackends.length > 0);
  const isPending = createSkill.isPending || updateSkill.isPending;

  useEffect(() => {
    if (!isEditing || !hasChanges || !isValid || isPending) return;

    const saveTimeout = window.setTimeout(() => {
      void handleSave(false);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [handleSave, hasChanges, isEditing, isPending, isValid]);

  // Defer preview rendering so typing stays responsive
  const deferredContent = useDeferredValue(content);

  // Keyboard shortcuts: Cmd+S to save, Escape to go back
  const handleSaveRef = useLatestRef(handleSave);
  const handleBackRef = useLatestRef(handleBack);
  const isValidRef = useLatestRef(isValid);
  const isPendingRef = useLatestRef(isPending);

  useRegisterKeyboardBindings('skill-editor', {
    'cmd+s': () => {
      if (isValidRef.current && !isPendingRef.current) {
        handleSaveRef.current();
      }
      return true;
    },
    escape: () => {
      handleBackRef.current();
      return true;
    },
  });

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="border-glass-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <IconButton
            onClick={handleBack}
            icon={<ArrowLeft />}
            tooltip="Back"
            size="sm"
          />
          <h2 className="text-ink-1 text-lg font-semibold">
            {isEditing ? 'Edit Skill' : 'New Skill'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleBack}>
            {isEditing ? 'Close' : 'Cancel'}
          </Button>
          {isEditing ? (
            (hasChanges || isPending) && (
              <span className="text-ink-3 text-xs">
                {isPending ? 'Saving...' : 'Changes save automatically'}
              </span>
            )
          ) : (
            <Button
              type="button"
              onClick={() => handleSave()}
              disabled={!isValid || isPending}
              loading={isPending}
              variant="primary"
            >
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Metadata row */}
      <div className="border-glass-border flex shrink-0 flex-wrap items-center gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-ink-2 text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="my-custom-skill"
            size="sm"
            className="w-48"
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="text-ink-2 text-sm font-medium">Description</label>
          <Input
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder="A brief description"
            size="sm"
            className="min-w-0 flex-1"
          />
        </div>
        {!isEditing && (
          <div className="flex items-center gap-3">
            <span className="text-ink-2 text-sm font-medium">Backends</span>
            {(['claude-code', 'opencode'] as AgentBackendType[]).map(
              (backend) => (
                <Checkbox
                  key={backend}
                  checked={formEnabledBackends.includes(backend)}
                  onChange={(checked) => {
                    setFormEnabledBackends((prev) =>
                      checked
                        ? [...prev, backend]
                        : prev.filter((b) => b !== backend),
                    );
                    markChanged();
                  }}
                  label={backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}
                  size="sm"
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Resizable split: markdown editor + live preview */}
      <div
        ref={containerRef}
        className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${isDragging ? 'select-none' : ''}`}
      >
        {/* Left pane: markdown textarea */}
        {leftWidth > 0 && (
          <div
            className="border-glass-border flex shrink-0 flex-col border-r"
            style={{ width: leftWidth }}
          >
            <div className="border-glass-border flex shrink-0 items-center border-b px-3 py-2">
              <span className="text-ink-2 text-xs font-medium">Markdown</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write the skill instructions in Markdown..."
              className="bg-bg-0/60 text-ink-1 placeholder-ink-3 flex-1 resize-none border-none p-4 font-mono text-sm leading-relaxed focus:outline-none"
            />
          </div>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`hover:bg-acc/50 w-1 shrink-0 cursor-col-resize transition-colors ${isDragging ? 'bg-acc/50' : ''}`}
        />

        {/* Right pane: live preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-glass-border flex shrink-0 items-center border-b px-3 py-2">
            <span className="text-ink-2 text-xs font-medium">Preview</span>
          </div>
          <div className="text-ink-1 flex-1 overflow-auto p-4 text-sm break-words">
            {deferredContent ? (
              <MarkdownContent content={deferredContent} />
            ) : (
              <p className="text-ink-3 italic">
                Start typing to see a preview...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
