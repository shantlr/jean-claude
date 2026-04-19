import { Bot, Plus, Search } from 'lucide-react';
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
import { useCreateSkillDraftStore } from '@/stores/create-skill-draft';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

import { CreateWithAgentDialog } from './create-with-agent-dialog';
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
  const isAgentDialogOpen = useCreateSkillDraftStore((s) => s.isOpen);
  const openAgentDialog = useCreateSkillDraftStore((s) => s.open);
  const closeAgentDialog = useCreateSkillDraftStore((s) => s.close);

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

  const { builtinSkills, mySkills, installedSkills } = useMemo(() => {
    const builtin = (skills ?? []).filter((s) => s.source === 'builtin');
    const my = (skills ?? []).filter((s) => s.editable);
    const installed = (skills ?? []).filter(
      (s) => !s.editable && s.source !== 'builtin',
    );
    return { builtinSkills: builtin, mySkills: my, installedSkills: installed };
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
    return <p className="text-ink-3">Loading...</p>;
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
          <h2 className="text-ink-1 text-lg font-semibold">Skills</h2>
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
              onClick={() => openAgentDialog({ mode: 'create' })}
              className="text-ink-1 bg-acc hover:bg-acc flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              <Bot className="h-4 w-4" />
              Create with Agent
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
          {builtinSkills.length > 0 && (
            <div>
              <h3 className="text-ink-3 mb-2 text-xs font-medium tracking-wide uppercase">
                Builtin
              </h3>
              <SkillCardGrid
                skills={builtinSkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          )}

          {mySkills.length > 0 && (
            <div>
              <h3 className="text-status-done mb-2 text-xs font-medium tracking-wide uppercase">
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
              <h3 className="text-ink-3 mb-2 text-xs font-medium tracking-wide uppercase">
                Installed Skills
              </h3>
              <SkillCardGrid
                skills={installedSkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          )}

          {builtinSkills.length === 0 &&
            mySkills.length === 0 &&
            installedSkills.length === 0 && (
              <p className="text-ink-3 py-8 text-center text-sm">
                No skills found. Click &quot;Add&quot; to create one.
              </p>
            )}
        </div>
      </div>

      {/* Right: Detail pane (read-only with Edit button) */}
      {selectedSkill && (
        <div className="border-glass-border bg-bg-1/50 w-96 flex-shrink-0 rounded-lg border p-6">
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
            onImproveWithAgent={(skillPath, skillName) =>
              openAgentDialog({
                mode: 'improve',
                sourceSkillPath: skillPath,
                sourceSkillName: skillName,
              })
            }
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

      {isAgentDialogOpen && (
        <CreateWithAgentDialog onClose={closeAgentDialog} />
      )}
    </div>
  );
}
