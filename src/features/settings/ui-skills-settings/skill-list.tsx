import { ToggleLeft, ToggleRight, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';

import type { ManagedSkill } from '@shared/skill-types';

/** Inline two-step confirmation: first click shows "Delete?", second confirms. */
function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
        onBlur={() => setConfirming(false)}
        className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-700 hover:bg-red-900/30"
        autoFocus
      >
        Delete?
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className="cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-700 hover:text-red-400"
      title="Delete skill"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function SkillList({
  skills,
  selectedPath,
  onSelect,
  onDelete,
  onToggleEnabled,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
  onDelete: (skillPath: string) => void;
  onToggleEnabled: (skill: ManagedSkill) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-500">
        No skills found.
        <br />
        Click &quot;Add&quot; to create one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <div
          key={skill.skillPath}
          onClick={() => skill.editable && onSelect(skill.skillPath)}
          className={`group flex items-center justify-between rounded-lg border p-3 transition-colors ${
            selectedPath === skill.skillPath
              ? 'border-blue-500 bg-blue-500/10'
              : skill.editable
                ? 'cursor-pointer border-neutral-700 bg-neutral-800 hover:border-neutral-600'
                : 'border-neutral-700/50 bg-neutral-800/50'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Wand2
              className={`h-4 w-4 shrink-0 ${skill.enabled ? 'text-purple-400' : 'text-neutral-600'}`}
            />
            <div className="min-w-0">
              <div
                className={`truncate text-sm font-medium ${skill.enabled ? 'text-neutral-200' : 'text-neutral-500'}`}
              >
                {skill.name}
              </div>
              {skill.description && (
                <div className="truncate text-xs text-neutral-500">
                  {skill.description}
                </div>
              )}
              {skill.pluginName && (
                <span className="mt-0.5 inline-block rounded bg-orange-900/30 px-1.5 py-0.5 text-[10px] text-orange-400">
                  {skill.pluginName}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {skill.editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleEnabled(skill);
                }}
                className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                title={skill.enabled ? 'Disable skill' : 'Enable skill'}
              >
                {skill.enabled ? (
                  <ToggleRight className="h-5 w-5 text-green-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-neutral-600" />
                )}
              </button>
            )}

            {skill.editable && (
              <DeleteButton onConfirm={() => onDelete(skill.skillPath)} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
