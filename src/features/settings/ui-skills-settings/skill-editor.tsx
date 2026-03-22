import { ArrowLeft } from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  useCreateSkill,
  useSkillContent,
  useUpdateSkill,
} from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

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

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description);
      setContent(existing.content);
      initializedRef.current = true;
      setHasChanges(false);
    } else if (!skillPath) {
      setName('');
      setDescription('');
      setContent('');
      initializedRef.current = true;
      setHasChanges(false);
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
    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them?',
      );
      if (!confirmed) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!isEditing && formEnabledBackends.length === 0) return;
    try {
      if (isEditing && skillPath) {
        await updateSkill.mutateAsync({
          skillPath,
          backendType: enabledBackends?.[0] ?? 'claude-code',
          name,
          description,
          content,
        });
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
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save skill';
      addToast({ message, type: 'error' });
    }
  };

  const isValid =
    name.trim().length > 0 && (isEditing || formEnabledBackends.length > 0);
  const isPending = createSkill.isPending || updateSkill.isPending;

  // Defer preview rendering so typing stays responsive
  const deferredContent = useDeferredValue(content);

  // Keyboard shortcuts: Cmd+S to save, Escape to go back
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  const isValidRef = useRef(isValid);
  isValidRef.current = isValid;
  const isPendingRef = useRef(isPending);
  isPendingRef.current = isPending;

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
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <IconButton
            onClick={handleBack}
            icon={<ArrowLeft />}
            tooltip="Back"
            size="sm"
          />
          <h2 className="text-lg font-semibold text-neutral-200">
            {isEditing ? 'Edit Skill' : 'New Skill'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleBack}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isValid || isPending}
            loading={isPending}
            variant="primary"
          >
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-neutral-400">Name</label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="my-custom-skill"
            size="sm"
            className="w-48"
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="text-sm font-medium text-neutral-400">
            Description
          </label>
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
            <span className="text-sm font-medium text-neutral-400">
              Backends
            </span>
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
        className={`flex min-h-0 flex-1 ${isDragging ? 'select-none' : ''}`}
      >
        {/* Left pane: markdown textarea */}
        {leftWidth > 0 && (
          <div
            className="flex shrink-0 flex-col border-r border-neutral-700"
            style={{ width: leftWidth }}
          >
            <div className="flex shrink-0 items-center border-b border-neutral-700 px-3 py-2">
              <span className="text-xs font-medium text-neutral-400">
                Markdown
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write the skill instructions in Markdown..."
              className="flex-1 resize-none border-none bg-neutral-900/60 p-4 font-mono text-sm leading-relaxed text-neutral-200 placeholder-neutral-500 focus:outline-none"
            />
          </div>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`w-1 shrink-0 cursor-col-resize transition-colors hover:bg-blue-500/50 ${isDragging ? 'bg-blue-500/50' : ''}`}
        />

        {/* Right pane: live preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center border-b border-neutral-700 px-3 py-2">
            <span className="text-xs font-medium text-neutral-400">
              Preview
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-sm text-neutral-200">
            {deferredContent ? (
              <MarkdownContent content={deferredContent} />
            ) : (
              <p className="text-neutral-500 italic">
                Start typing to see a preview...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
