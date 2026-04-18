import { Bot, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
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
  onImproveWithAgent,
}: {
  skill: ManagedSkill;
  onClose: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => void;
  onDelete?: (skillPath: string) => void;
  onImproveWithAgent?: (skillPath: string, skillName: string) => void;
}) {
  const { data, isLoading, error } = useSkillContent(skill.skillPath);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-ink-1 text-lg font-semibold">Skill Details</h3>
        <div className="flex items-center gap-1">
          {onEdit && skill.editable && (
            <IconButton
              onClick={onEdit}
              icon={<Pencil />}
              tooltip="Edit skill"
              size="sm"
            />
          )}
          {onImproveWithAgent && skill.editable && (
            <Button
              type="button"
              onClick={() => onImproveWithAgent(skill.skillPath, skill.name)}
              className="text-ink-3 hover:bg-glass-medium hover:text-acc-ink cursor-pointer rounded p-1"
              title="Improve with Agent"
            >
              <Bot className="h-4 w-4" />
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
              <IconButton
                onClick={() => setConfirmingDelete(true)}
                icon={<Trash2 />}
                tooltip="Delete skill"
                size="sm"
              />
            ))}
          <IconButton
            onClick={onClose}
            icon={<X />}
            tooltip="Close"
            size="sm"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        <div className="border-glass-border bg-bg-1/50 rounded-lg border p-3 text-sm">
          <div className="text-ink-0 text-base font-medium">{skill.name}</div>
          <div className="text-ink-2 mt-1">
            {skill.description || 'No description provided.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="bg-glass-medium text-ink-1 rounded px-2 py-1">
              {getSourceLabel(skill)}
            </span>
            {onToggleEnabled && skill.editable
              ? Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <Button
                      key={backend}
                      type="button"
                      onClick={() =>
                        onToggleEnabled(skill, backend as AgentBackendType)
                      }
                      className={`cursor-pointer rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'text-status-run bg-status-run/30 hover:bg-status-run/50'
                            : 'text-acc-ink bg-acc/30 hover:bg-acc/50'
                          : 'bg-glass-medium text-ink-2 hover:bg-bg-3'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </Button>
                  ),
                )
              : Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <span
                      key={backend}
                      className={`rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'text-status-run bg-status-run/30'
                            : 'text-acc-ink bg-acc/30'
                          : 'bg-glass-medium text-ink-2'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </span>
                  ),
                )}
          </div>
          <div className="text-ink-3 mt-3 text-xs break-all">
            {skill.skillPath}
          </div>
        </div>

        <div>
          <div className="text-ink-2 mb-2 text-xs font-medium tracking-wide uppercase">
            Skill Content
          </div>
          {isLoading && (
            <div className="border-glass-border bg-bg-1/30 text-ink-2 rounded-lg border p-3 text-sm">
              Loading content...
            </div>
          )}
          {error && (
            <div className="border-status-fail/60 bg-status-fail/20 text-status-fail rounded-lg border p-3 text-sm">
              Failed to load skill content.
            </div>
          )}
          {!isLoading && !error && (
            <div className="border-glass-border bg-bg-0/60 text-ink-1 overflow-auto rounded-lg border p-3 text-sm">
              <MarkdownContent content={data?.content || 'No content found.'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
