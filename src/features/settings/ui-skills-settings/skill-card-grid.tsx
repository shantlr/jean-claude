import clsx from 'clsx';
import { Wand2 } from 'lucide-react';
import type { MouseEvent } from 'react';

import { Chip } from '@/common/ui/chip';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

function backendLabel(backendType: string): string {
  switch (backendType) {
    case 'claude-code':
      return 'Claude Code';
    case 'opencode':
      return 'OpenCode';
    default:
      return backendType;
  }
}

function isEnabledForAnyBackend(
  enabledBackends: Partial<Record<string, boolean>>,
): boolean {
  return Object.values(enabledBackends).some(Boolean);
}

function BackendToggleChip({
  backendType,
  enabled,
  editable,
  onClick,
}: {
  backendType: AgentBackendType;
  enabled: boolean;
  editable: boolean;
  onClick?: () => void;
}) {
  const handleClick = onClick
    ? (e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;
  const isClaude = backendType === 'claude-code';
  const label = isClaude ? 'CC' : 'OC';
  const activeColor = isClaude ? 'orange' : 'blue';
  const color = enabled ? activeColor : 'neutral';

  if (!editable || !onClick) {
    return (
      <Chip
        size="xs"
        color={color}
        className={!enabled ? 'text-neutral-600' : ''}
      >
        {label}
      </Chip>
    );
  }

  return (
    <Chip
      size="xs"
      color={color}
      onClick={handleClick}
      title={`${enabled ? 'Disable' : 'Enable'} for ${backendLabel(backendType)}`}
      className={!enabled ? 'text-neutral-600' : ''}
    >
      {label}
    </Chip>
  );
}

function SourceBadge({ skill }: { skill: ManagedSkill }) {
  if (skill.source === 'plugin') {
    return (
      <Chip size="xs" color="purple">
        {skill.pluginName ?? 'Plugin'}
      </Chip>
    );
  }
  return (
    <Chip size="xs" color="neutral">
      {skill.source === 'user' ? 'User' : 'Project'}
    </Chip>
  );
}

export function SkillCardGrid({
  skills,
  selectedPath,
  onSelect,
  onToggleBackend,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
  onToggleBackend?: (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
        No skills found.
        <br />
        Click &quot;Add&quot; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {skills.map((skill) => {
        const isSelected = selectedPath === skill.skillPath;
        const anyEnabled = isEnabledForAnyBackend(skill.enabledBackends);

        return (
          <button
            key={skill.skillPath}
            type="button"
            onClick={() => onSelect(skill.skillPath)}
            className={clsx(
              'flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
              isSelected
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600',
              !anyEnabled && 'opacity-60',
            )}
          >
            <div className="flex w-full items-center gap-2">
              <Wand2
                className={clsx(
                  'h-4 w-4 shrink-0',
                  anyEnabled ? 'text-purple-400' : 'text-neutral-600',
                )}
              />
              <span className="truncate text-sm font-medium text-neutral-200">
                {skill.name}
              </span>
            </div>

            {skill.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-neutral-500">
                {skill.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(skill.enabledBackends).map(
                ([backend, enabled]) => (
                  <BackendToggleChip
                    key={backend}
                    backendType={backend as AgentBackendType}
                    enabled={!!enabled}
                    editable={skill.editable}
                    onClick={
                      skill.editable && onToggleBackend
                        ? () =>
                            onToggleBackend(skill, backend as AgentBackendType)
                        : undefined
                    }
                  />
                ),
              )}
              <SourceBadge skill={skill} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
