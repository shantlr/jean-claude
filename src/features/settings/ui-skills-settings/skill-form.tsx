import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useSkillContent,
  useCreateSkill,
  useUpdateSkill,
} from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

export function SkillForm({
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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [formEnabledBackends, setFormEnabledBackends] = useState<
    AgentBackendType[]
  >(enabledBackends ?? ['claude-code', 'opencode']);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description);
      setContent(existing.content);
    } else if (!skillPath) {
      setName('');
      setDescription('');
      setContent('');
    }
  }, [existing, skillPath]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          {isEditing ? 'Edit Skill' : 'Add Skill'}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., my-custom-skill"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Used as the skill directory name (kebab-case recommended)
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of what this skill does"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {!isEditing && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-400">
              Backends
            </label>
            <div className="flex gap-3">
              {(['claude-code', 'opencode'] as AgentBackendType[]).map(
                (backend) => (
                  <label
                    key={backend}
                    className="flex items-center gap-2 text-sm text-neutral-200"
                  >
                    <input
                      type="checkbox"
                      checked={formEnabledBackends.includes(backend)}
                      onChange={(e) => {
                        setFormEnabledBackends((prev) =>
                          e.target.checked
                            ? [...prev, backend]
                            : prev.filter((b) => b !== backend),
                        );
                      }}
                      className="rounded border-neutral-600 bg-neutral-800"
                    />
                    {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}
                  </label>
                ),
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Which agent backends this skill will be available to
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Skill Content (Markdown)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the skill instructions in Markdown..."
            rows={16}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            This becomes the body of the SKILL.md file that the agent reads when
            it invokes this skill.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-neutral-700 pt-4">
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isPending}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
