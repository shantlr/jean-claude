import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useAllManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import type { ManagedSkill } from '@shared/skill-types';

import { LegacySkillMigrationDialog } from './legacy-skill-migration-dialog';
import { SkillCardGrid } from './skill-card-grid';
import { SkillDetails } from './skill-details';
import { SkillForm } from './skill-form';

export function SkillsSettings() {
  const { data: skills, isLoading } = useAllManagedSkills();
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const { mySkills, installedSkills } = useMemo(() => {
    const my = (skills ?? []).filter((s) => s.editable);
    const installed = (skills ?? []).filter((s) => !s.editable);
    return { mySkills: my, installedSkills: installed };
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
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    await deleteSkill.mutateAsync({
      skillPath,
      backendType: skill.backendType,
    });
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
      {/* Left: Card Grid */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMigrationDialog(true)}
              className="cursor-pointer rounded-lg border border-neutral-600 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
            >
              Migrate Legacy Skills
            </button>
            <button
              onClick={handleCreate}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {mySkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-green-400 uppercase">
                My Skills
              </h3>
              <SkillCardGrid
                skills={mySkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          )}

          {installedSkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Installed Skills
              </h3>
              <SkillCardGrid
                skills={installedSkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          )}

          {mySkills.length === 0 && installedSkills.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              No skills found. Click &quot;Add&quot; to create one.
            </p>
          )}
        </div>
      </div>

      {/* Right: Detail/Form pane */}
      {(isCreating || selectedSkill) && (
        <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          {isCreating ? (
            <SkillForm
              backendType="claude-code"
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill?.editable ? (
            <SkillForm
              skillPath={selectedSkill.skillPath}
              backendType={selectedSkill.backendType}
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill ? (
            <SkillDetails
              skill={selectedSkill}
              onClose={handleClose}
              onToggleEnabled={handleToggleEnabled}
              onDelete={handleDelete}
            />
          ) : null}
        </div>
      )}

      {showMigrationDialog && (
        <LegacySkillMigrationDialog
          onClose={() => setShowMigrationDialog(false)}
        />
      )}
    </div>
  );
}
