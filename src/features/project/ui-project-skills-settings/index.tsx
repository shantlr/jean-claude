import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SkillCardGrid } from '@/features/settings/ui-skills-settings/skill-card-grid';
import { SkillDetails } from '@/features/settings/ui-skills-settings/skill-details';
import { SkillEditor } from '@/features/settings/ui-skills-settings/skill-editor';
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
    // deleteSkill removes symlinks from all backends for JC-managed skills,
    // so the specific backendType only matters for project-scope skills.
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

  if (isLoading || !project) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <p className="text-xs text-neutral-500">
            Manage skills for this project&apos;s {backendType} backend
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedPath(null);
            setEditingPath('new');
          }}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          <Plus className="h-4 w-4" />
          Add Project Skill
        </button>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-green-400 uppercase">
              Project Skills
            </h3>
            <SkillCardGrid
              skills={projectSkills}
              selectedPath={selectedPath}
              onSelect={(p) => {
                setSelectedPath(p);
              }}
            />
          </div>

          {inheritedSkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Inherited (user &amp; plugins)
              </h3>
              <SkillCardGrid
                skills={inheritedSkills}
                selectedPath={selectedPath}
                onSelect={(p) => {
                  setSelectedPath(p);
                }}
                onToggleBackend={handleToggleEnabled}
              />
            </div>
          )}
        </div>

        {selectedSkill && (
          <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
            <SkillDetails
              skill={selectedSkill}
              onClose={() => {
                setSelectedPath(null);
              }}
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
      </div>
    </div>
  );
}
