import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { SkillDetails } from '@/features/settings/ui-skills-settings/skill-details';
import { SkillEditor } from '@/features/settings/ui-skills-settings/skill-editor';
import {
  GroupHeader,
  SkillRow,
} from '@/features/settings/ui-skills-settings/skill-row';
import {
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
  useManagedSkills,
} from '@/hooks/use-managed-skills';
import { useProject } from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

export function ProjectSkillsSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: backendsSetting } = useBackendsSetting();

  const backendType: AgentBackendType =
    project?.defaultAgentBackend ??
    backendsSetting?.defaultBackend ??
    'claude-code';

  const { data: skills, isLoading } = useManagedSkills(
    backendType,
    project?.path,
  );
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    const bt =
      (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ??
      'claude-code';
    await deleteSkill.mutateAsync({
      skillPath,
      backendType: bt,
    });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (
    skill: ManagedSkill,
    bt: AgentBackendType,
  ) => {
    const isEnabled = skill.enabledBackends[bt];
    if (isEnabled) {
      await disableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: bt,
      });
    } else {
      await enableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: bt,
      });
    }
  };

  const { projectSkills, inheritedSkills } = useMemo(() => {
    const proj = (skills ?? []).filter((s) => s.source === 'project');
    const inherited = (skills ?? []).filter((s) => s.source !== 'project');
    return { projectSkills: proj, inheritedSkills: inherited };
  }, [skills]);

  const totalCount = projectSkills.length + inheritedSkills.length;

  // Auto-select first skill
  const firstSkillPath = useMemo(() => {
    const all = [...projectSkills, ...inheritedSkills];
    return all[0]?.skillPath ?? null;
  }, [projectSkills, inheritedSkills]);

  const effectiveSelectedPath = selectedPath ?? firstSkillPath;
  const effectiveSelectedSkill =
    selectedSkill ?? skills?.find((s) => s.skillPath === effectiveSelectedPath);

  if (isLoading || !project) {
    return <p className="text-ink-3 text-sm">Loading...</p>;
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
            : [backendType]
        }
        scope="project"
        projectPath={project.path}
        onClose={() => setEditingPath(null)}
        onSaved={() => {
          setEditingPath(null);
          setSelectedPath(null);
        }}
      />
    );
  }

  return (
    <div className="border-line-soft flex min-h-0 flex-1 border-t">
      {/* ── Skill Rail ── */}
      <div className="bg-bg-0 flex w-[220px] shrink-0 flex-col">
        {/* Header */}
        <div className="border-line flex shrink-0 items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-ink-0 text-sm font-medium">Skills</span>
            <span className="bg-bg-2 text-ink-3 rounded px-1.5 py-0.5 font-mono text-[10px]">
              {totalCount}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPath(null);
              setEditingPath('new');
            }}
            className="text-acc hover:bg-acc-soft rounded p-1 transition-colors"
            title="Add project skill"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto py-1">
          {projectSkills.length > 0 && (
            <div>
              <GroupHeader label="Project Skills" accent />
              {projectSkills.map((skill) => (
                <SkillRow
                  key={skill.skillPath}
                  label={skill.name}
                  isActive={effectiveSelectedPath === skill.skillPath}
                  isEnabled={Object.values(skill.enabledBackends).some(Boolean)}
                  onClick={() => setSelectedPath(skill.skillPath)}
                />
              ))}
            </div>
          )}

          {inheritedSkills.length > 0 && (
            <div>
              <GroupHeader label="Inherited" />
              {inheritedSkills.map((skill) => (
                <SkillRow
                  key={skill.skillPath}
                  label={skill.name}
                  isActive={effectiveSelectedPath === skill.skillPath}
                  isEnabled={Object.values(skill.enabledBackends).some(Boolean)}
                  onClick={() => setSelectedPath(skill.skillPath)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Pane ── */}
      {effectiveSelectedSkill ? (
        <SkillDetails
          key={effectiveSelectedSkill.skillPath}
          skill={effectiveSelectedSkill}
          onToggleEnabled={handleToggleEnabled}
          onDelete={handleDelete}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-black/[0.18]">
          <div className="text-center">
            <p className="text-ink-3 mb-4 text-sm">No project skills yet.</p>
            <Button
              type="button"
              onClick={() => {
                setSelectedPath(null);
                setEditingPath('new');
              }}
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
            >
              Add Project Skill
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
