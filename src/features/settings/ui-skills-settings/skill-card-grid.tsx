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
      <Chip size="xs" color={color} className={!enabled ? 'text-ink-4' : ''}>
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
      className={!enabled ? 'text-ink-4' : ''}
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
      <div className="border-glass-border text-ink-3 rounded-lg border border-dashed p-8 text-center text-sm">
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
                ? 'border-acc bg-acc/10'
                : 'border-glass-border bg-bg-1 hover:border-glass-border-strong',
              !anyEnabled && 'opacity-60',
            )}
          >
            <div className="flex w-full items-center gap-2">
              <Wand2
                className={clsx(
                  'h-4 w-4 shrink-0',
                  anyEnabled ? 'text-acc-ink' : 'text-ink-4',
                )}
              />
              <span className="text-ink-1 truncate text-sm font-medium">
                {skill.name}
              </span>
            </div>

            {skill.description && (
              <p className="text-ink-3 line-clamp-2 text-xs leading-relaxed">
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
