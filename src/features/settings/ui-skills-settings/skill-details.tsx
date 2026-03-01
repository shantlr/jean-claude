import { X } from 'lucide-react';

import { useSkillContent } from '@/hooks/use-managed-skills';
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
}: {
  skill: ManagedSkill;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useSkillContent(skill.skillPath);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          Skill Details
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto pb-2">
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
            <span className="rounded bg-neutral-700 px-2 py-1 text-neutral-300">
              {skill.enabled ? 'Enabled' : 'Disabled'}
            </span>
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
            <pre className="max-h-[52svh] overflow-auto rounded-lg border border-neutral-700 bg-neutral-900/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-200">
              {data?.content || 'No content found.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
