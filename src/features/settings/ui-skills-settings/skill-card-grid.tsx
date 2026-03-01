import { Wand2 } from 'lucide-react';

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

function BackendBadge({ backendType }: { backendType: string }) {
  const isClaude = backendType === 'claude-code';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        isClaude
          ? 'bg-orange-900/30 text-orange-400'
          : 'bg-blue-900/30 text-blue-400'
      }`}
    >
      {backendLabel(backendType)}
    </span>
  );
}

function SourceBadge({ skill }: { skill: ManagedSkill }) {
  if (skill.source === 'plugin') {
    return (
      <span className="rounded bg-purple-900/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
        {skill.pluginName ?? 'Plugin'}
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
      {skill.source === 'user' ? 'User' : 'Project'}
    </span>
  );
}

export function SkillCardGrid({
  skills,
  selectedPath,
  onSelect,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
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

        return (
          <button
            key={skill.skillPath}
            type="button"
            onClick={() => onSelect(skill.skillPath)}
            className={`flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
              isSelected
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'
            } ${!skill.enabled ? 'opacity-60' : ''}`}
          >
            <div className="flex w-full items-center gap-2">
              <Wand2
                className={`h-4 w-4 shrink-0 ${skill.enabled ? 'text-purple-400' : 'text-neutral-600'}`}
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
              <BackendBadge backendType={skill.backendType} />
              <SourceBadge skill={skill} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
