import { Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { useSkillContent } from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

function getSourceLabel(skill: ManagedSkill): string {
  if (skill.source === 'plugin') {
    return skill.pluginName ? `Plugin (${skill.pluginName})` : 'Plugin';
  }

  if (skill.source === 'user') {
    return 'User';
  }

  return 'Project';
}

export function SkillDetails({
  skill,
  onClose,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  skill: ManagedSkill;
  onClose: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => void;
  onDelete?: (skillPath: string) => void;
}) {
  const { data, isLoading, error } = useSkillContent(skill.skillPath);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          Skill Details
        </h3>
        <div className="flex items-center gap-1">
          {onEdit && skill.editable && (
            <button
              type="button"
              onClick={onEdit}
              className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
              title="Edit skill"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete &&
            skill.editable &&
            (confirmingDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(skill.skillPath);
                  setConfirmingDelete(false);
                }}
                onBlur={() => setConfirmingDelete(false)}
                className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-700 hover:bg-red-900/30"
                autoFocus
              >
                Delete?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                title="Delete skill"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-sm">
          <div className="text-base font-medium text-neutral-100">
            {skill.name}
          </div>
          <div className="mt-1 text-neutral-400">
            {skill.description || 'No description provided.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-neutral-700 px-2 py-1 text-neutral-300">
              {getSourceLabel(skill)}
            </span>
            {onToggleEnabled && skill.editable
              ? Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <button
                      key={backend}
                      type="button"
                      onClick={() =>
                        onToggleEnabled(skill, backend as AgentBackendType)
                      }
                      className={`cursor-pointer rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50'
                            : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                          : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </button>
                  ),
                )
              : Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <span
                      key={backend}
                      className={`rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'bg-orange-900/30 text-orange-400'
                            : 'bg-blue-900/30 text-blue-400'
                          : 'bg-neutral-700 text-neutral-400'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </span>
                  ),
                )}
          </div>
          <div className="mt-3 text-xs break-all text-neutral-500">
            {skill.skillPath}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">
            Skill Content
          </div>
          {isLoading && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3 text-sm text-neutral-400">
              Loading content...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
              Failed to load skill content.
            </div>
          )}
          {!isLoading && !error && (
            <div className="overflow-auto rounded-lg border border-neutral-700 bg-neutral-900/60 p-3 text-sm text-neutral-200">
              <MarkdownContent content={data?.content || 'No content found.'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
