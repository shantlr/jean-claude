import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-ink-1 text-lg font-semibold">Skills</h2>
          <p className="text-ink-3 text-xs">
            Manage skills for this project&apos;s {backendType} backend
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSelectedPath(null);
            setEditingPath('new');
          }}
          icon={<Plus />}
        >
          Add Project Skill
        </Button>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="text-status-done mb-2 text-xs font-medium tracking-wide uppercase">
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
              <h3 className="text-ink-3 mb-2 text-xs font-medium tracking-wide uppercase">
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
          <div className="border-glass-border bg-bg-1/50 w-96 flex-shrink-0 rounded-lg border p-6">
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
