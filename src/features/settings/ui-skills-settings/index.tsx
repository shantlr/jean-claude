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
import type { ManagedSkill, RegistrySkill } from '@shared/skill-types';

import { CreateWithAgentDialog } from './create-with-agent-dialog';
import { LegacySkillMigrationDialog } from './legacy-skill-migration-dialog';
import { RegistrySkillDetails } from './registry-skill-details';
import { SkillDetails } from './skill-details';
import { SkillEditor } from './skill-editor';
import { type RailMode, SkillRail } from './skill-rail';

export function SkillsSettings() {
  const { data: skills, isLoading } = useAllManagedSkills();
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();
  const { data: hasLegacySkills } = useHasLegacySkills();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [railMode, setRailMode] = useState<RailMode>('installed');
  const [selectedRegistrySkill, setSelectedRegistrySkill] =
    useState<RegistrySkill | null>(null);
  const isAgentDialogOpen = useCreateSkillDraftStore((s) => s.isOpen);
  const openAgentDialog = useCreateSkillDraftStore((s) => s.open);
  const closeAgentDialog = useCreateSkillDraftStore((s) => s.close);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const toggleBrowse = useCallback(() => {
    setRailMode((m) => (m === 'browse' ? 'installed' : 'browse'));
  }, []);

  useCommands('skills-settings', [
    {
      label: 'Browse Skills Registry',
      handler: toggleBrowse,
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

  // Auto-select first skill when skills load and nothing is selected
  const firstSkillPath = useMemo(() => {
    const all = [...builtinSkills, ...mySkills, ...installedSkills];
    return all[0]?.skillPath ?? null;
  }, [builtinSkills, mySkills, installedSkills]);

  // If no selection, auto-select the first skill
  const effectiveSelectedPath = selectedPath ?? firstSkillPath;
  const effectiveSelectedSkill =
    selectedSkill ?? skills?.find((s) => s.skillPath === effectiveSelectedPath);

  // Installed names for registry "Installed" badges
  const installedNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of skills ?? []) {
      names.add(s.name);
    }
    return names;
  }, [skills]);

  const handleCreate = () => {
    setSelectedPath(null);
    setEditingPath('new');
  };

  const handleSelect = (skillPath: string) => {
    setSelectedPath(skillPath);
    setSelectedRegistrySkill(null);
  };

  const handleSelectRegistrySkill = (skill: RegistrySkill) => {
    setSelectedRegistrySkill(skill);
    setSelectedPath(null);
  };

  const handleModeChange = (newMode: RailMode) => {
    setRailMode(newMode);
    if (newMode === 'installed') {
      setSelectedRegistrySkill(null);
    } else {
      setSelectedPath(null);
    }
  };

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
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

  // Full-page editor view when creating a new skill
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

  // Determine what to show in the detail pane
  const showRegistryDetail = railMode === 'browse' && selectedRegistrySkill;
  const showInstalledDetail =
    railMode === 'installed' && effectiveSelectedSkill;

  return (
    <div className="border-line-soft relative flex min-h-0 flex-1 border-t">
      {/* ── Skill Rail ── */}
      <SkillRail
        builtinSkills={builtinSkills}
        mySkills={mySkills}
        installedSkills={installedSkills}
        selectedPath={effectiveSelectedPath}
        onSelect={handleSelect}
        onAdd={handleCreate}
        onCreateWithAgent={() => openAgentDialog({ mode: 'create' })}
        mode={railMode}
        onModeChange={handleModeChange}
        selectedRegistrySkillId={selectedRegistrySkill?.id ?? null}
        onSelectRegistrySkill={handleSelectRegistrySkill}
        installedNames={installedNames}
      />

      {/* ── Detail Pane ── */}
      {showRegistryDetail ? (
        <RegistrySkillDetails
          key={selectedRegistrySkill.id}
          skill={selectedRegistrySkill}
          installedNames={installedNames}
          onInstalled={() => {
            setRailMode('installed');
            setSelectedRegistrySkill(null);
          }}
        />
      ) : showInstalledDetail ? (
        <SkillDetails
          key={effectiveSelectedSkill.skillPath}
          skill={effectiveSelectedSkill}
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
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-black/[0.18]">
          <div className="text-center">
            <p className="text-ink-3 mb-4 text-sm">
              {railMode === 'browse'
                ? 'Search and select a skill to preview it.'
                : 'No skills found. Get started by adding one.'}
            </p>
            {railMode === 'installed' && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => handleModeChange('browse')}
                  size="sm"
                  icon={<Search size={14} />}
                >
                  Browse
                </Button>
                <Button
                  type="button"
                  onClick={() => openAgentDialog({ mode: 'create' })}
                  size="sm"
                  icon={<Bot size={14} />}
                >
                  Create with Agent
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                >
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Legacy migration banner ── */}
      {hasLegacySkills && !showMigrationDialog && (
        <div className="border-status-run/30 bg-status-run/10 absolute right-4 bottom-4 z-10 rounded-lg border p-3">
          <Button
            type="button"
            onClick={() => setShowMigrationDialog(true)}
            size="sm"
          >
            Migrate Manually Installed Skills
          </Button>
        </div>
      )}

      {/* ── Dialogs ── */}
      {showMigrationDialog && (
        <LegacySkillMigrationDialog
          onClose={() => setShowMigrationDialog(false)}
        />
      )}

      {isAgentDialogOpen && (
        <CreateWithAgentDialog onClose={closeAgentDialog} />
      )}
    </div>
  );
}
