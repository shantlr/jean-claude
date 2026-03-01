import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

import { SkillDetails } from './skill-details';
import { SkillForm } from './skill-form';
import { SkillList } from './skill-list';

const BACKENDS: { value: AgentBackendType; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
];

export function SkillsSettings() {
  const [backendType, setBackendType] =
    useState<AgentBackendType>('claude-code');
  const { data: skills, isLoading } = useManagedSkills(backendType);
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const { userSkills, pluginSkills } = useMemo(() => {
    const user = (skills ?? []).filter((s) => s.source === 'user');
    const plugin = (skills ?? []).filter((s) => s.source === 'plugin');
    return { userSkills: user, pluginSkills: plugin };
  }, [skills]);

  const handleCreate = () => {
    setSelectedPath(null);
    setIsCreating(true);
  };

  const handleSelect = (skillPath: string) => {
    setIsCreating(false);
    setSelectedPath(skillPath);
  };

  const handleDelete = async (skillPath: string) => {
    await deleteSkill.mutateAsync({ skillPath, backendType });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (skill: ManagedSkill) => {
    if (skill.enabled) {
      await disableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: skill.backendType,
      });
    } else {
      await enableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: skill.backendType,
      });
    }
  };

  const handleClose = () => {
    setSelectedPath(null);
    setIsCreating(false);
  };

  const handleSaved = () => {
    setSelectedPath(null);
    setIsCreating(false);
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: List */}
      <div className="w-80 flex-shrink-0 pb-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <button
            onClick={handleCreate}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {/* Backend selector */}
        <div className="mb-4">
          <select
            value={backendType}
            onChange={(e) => {
              setBackendType(e.target.value as AgentBackendType);
              setSelectedPath(null);
              setIsCreating(false);
            }}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          >
            {BACKENDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* User Skills */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-blue-400 uppercase">
            User Skills
          </h3>
          <SkillList
            skills={userSkills}
            selectedPath={selectedPath}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onToggleEnabled={handleToggleEnabled}
          />
        </div>

        {/* Plugin Skills */}
        {pluginSkills.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-orange-400 uppercase">
              Plugin Skills (read-only)
            </h3>
            <SkillList
              skills={pluginSkills}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onDelete={() => {}}
              onToggleEnabled={() => {}}
              isSelectable={() => true}
            />
          </div>
        )}
      </div>

      {/* Right: Form pane */}
      {(isCreating || selectedSkill) && (
        <div className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          {isCreating ? (
            <SkillForm
              backendType={backendType}
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill?.editable ? (
            <SkillForm
              skillPath={selectedSkill.skillPath}
              backendType={backendType}
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill ? (
            <SkillDetails skill={selectedSkill} onClose={handleClose} />
          ) : null}
        </div>
      )}
    </div>
  );
}
