import { Plus, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import {
  useAllManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
  useHasLegacySkills,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

import { LegacySkillMigrationDialog } from './legacy-skill-migration-dialog';
import { SkillCardGrid } from './skill-card-grid';
import { SkillDetails } from './skill-details';
import { SkillEditor } from './skill-editor';
import { SkillRegistryBrowser } from './skill-registry-browser';

export function SkillsSettings() {
  const { data: skills, isLoading } = useAllManagedSkills();
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();
  const { data: hasLegacySkills } = useHasLegacySkills();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [showRegistryBrowser, setShowRegistryBrowser] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const openBrowser = useCallback(() => {
    setShowRegistryBrowser(true);
  }, []);

  useCommands('skills-settings', [
    {
      label: 'Browse Skills Registry',
      handler: openBrowser,
      shortcut: 'cmd+shift+b',
      section: 'Skills',
      keywords: ['browse', 'registry', 'discover', 'install', 'skills.sh'],
    },
  ]);

  const { mySkills, installedSkills } = useMemo(() => {
    const my = (skills ?? []).filter((s) => s.editable);
    const installed = (skills ?? []).filter((s) => !s.editable);
    return { mySkills: my, installedSkills: installed };
  }, [skills]);

  const handleCreate = () => {
    setSelectedPath(null);
    setEditingPath('new');
  };

  const handleSelect = (skillPath: string) => {
    setSelectedPath(skillPath);
  };

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    // deleteSkill removes symlinks from all backends for JC-managed skills,
    // so the specific backendType only matters for project-scope skills.
    const backendType =
      (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ??
      'claude-code';
    await deleteSkill.mutateAsync({
      skillPath,
      backendType,
    });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => {
    const isEnabled = skill.enabledBackends[backendType];
    if (isEnabled) {
      await disableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType,
      });
    } else {
      await enableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType,
      });
    }
  };

  const handleClose = () => {
    setSelectedPath(null);
    setEditingPath(null);
  };

  const handleEditorClose = () => {
    setEditingPath(null);
  };

  const handleEditorSaved = () => {
    setEditingPath(null);
    setSelectedPath(null);
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  // Full-page editor view when editing or creating
  if (editingPath !== null) {
    const editingSkill =
      editingPath !== 'new'
        ? skills?.find((s) => s.skillPath === editingPath)
        : undefined;

    return (
      <SkillEditor
        skillPath={editingSkill?.skillPath}
        enabledBackends={
          editingSkill
            ? Object.entries(editingSkill.enabledBackends)
                .filter(([, v]) => v)
                .map(([k]) => k as AgentBackendType)
            : undefined
        }
        scope="user"
        onClose={handleEditorClose}
        onSaved={handleEditorSaved}
      />
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: Card Grid */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <div className="flex items-center gap-2">
            {hasLegacySkills && (
              <Button
                type="button"
                onClick={() => setShowMigrationDialog(true)}
                size="sm"
              >
                Migrate Manually Installed Skills
              </Button>
            )}
            <Button
              type="button"
              onClick={() => setShowRegistryBrowser(true)}
              size="sm"
              icon={<Search />}
            >
              Browse
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              size="sm"
              icon={<Plus />}
            >
              Add
            </Button>
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
                onToggleBackend={handleToggleEnabled}
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

      {/* Right: Detail pane (read-only with Edit button) */}
      {selectedSkill && (
        <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          <SkillDetails
            skill={selectedSkill}
            onClose={handleClose}
            onEdit={
              selectedSkill.editable
                ? () => setEditingPath(selectedSkill.skillPath)
                : undefined
            }
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
          />
        </div>
      )}

      {showMigrationDialog && (
        <LegacySkillMigrationDialog
          onClose={() => setShowMigrationDialog(false)}
        />
      )}

      {showRegistryBrowser && (
        <SkillRegistryBrowser onClose={() => setShowRegistryBrowser(false)} />
      )}
    </div>
  );
}
