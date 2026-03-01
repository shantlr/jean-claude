import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SkillCardGrid } from '@/features/settings/ui-skills-settings/skill-card-grid';
import { SkillDetails } from '@/features/settings/ui-skills-settings/skill-details';
import { SkillForm } from '@/features/settings/ui-skills-settings/skill-form';
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
  const [isCreating, setIsCreating] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

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

  const { projectSkills, inheritedSkills } = useMemo(() => {
    const proj = (skills ?? []).filter((s) => s.source === 'project');
    const inherited = (skills ?? []).filter((s) => s.source !== 'project');
    return { projectSkills: proj, inheritedSkills: inherited };
  }, [skills]);

  if (isLoading || !project) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
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
            setIsCreating(true);
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
                setIsCreating(false);
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
                  setIsCreating(false);
                  setSelectedPath(p);
                }}
              />
            </div>
          )}
        </div>

        {(isCreating || selectedSkill) && (
          <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
            {isCreating || selectedSkill?.editable ? (
              <SkillForm
                skillPath={selectedSkill?.skillPath}
                backendType={backendType}
                scope="project"
                projectPath={project.path}
                onClose={() => {
                  setSelectedPath(null);
                  setIsCreating(false);
                }}
                onSaved={() => {
                  setSelectedPath(null);
                  setIsCreating(false);
                }}
              />
            ) : selectedSkill ? (
              <SkillDetails
                skill={selectedSkill}
                onClose={() => {
                  setSelectedPath(null);
                  setIsCreating(false);
                }}
                onToggleEnabled={handleToggleEnabled}
                onDelete={handleDelete}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
