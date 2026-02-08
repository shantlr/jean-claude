import clsx from 'clsx';
import {
  X,
  Shield,
  Wand2,
  Loader2,
  ChevronRight,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  Copy,
  Check,
  Bug,
} from 'lucide-react';
import { useState } from 'react';

import { useSkills } from '@/hooks/use-skills';
import type { Skill } from '@shared/skill-types';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';

function SkillItem({ skill }: { skill: Skill }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="cursor-pointer rounded px-2 py-1 hover:bg-neutral-800"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-1.5">
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
        )}
        <Wand2 className="h-3 w-3 shrink-0 text-purple-400" />
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">
          {skill.name}
        </span>
      </div>
      {isExpanded && (
        <p className="mt-1 mr-2 ml-[30px] text-[11px] leading-relaxed text-neutral-500">
          {skill.description || 'No description available.'}
        </p>
      )}
    </div>
  );
}

interface SkillGroup {
  key: string;
  label: string;
  className: string;
  skills: Skill[];
}

function groupSkills(skills: Skill[]): SkillGroup[] {
  const groups: SkillGroup[] = [];

  // Group by source, with plugins further grouped by pluginName
  const projectSkills = skills.filter((s) => s.source === 'project');
  const userSkills = skills.filter((s) => s.source === 'user');
  const pluginSkills = skills.filter((s) => s.source === 'plugin');

  // Group plugin skills by pluginName
  const pluginsByName = new Map<string, Skill[]>();
  for (const skill of pluginSkills) {
    const name = skill.pluginName ?? 'plugin';
    const existing = pluginsByName.get(name) ?? [];
    existing.push(skill);
    pluginsByName.set(name, existing);
  }

  // Add groups in priority order: project > user > plugins
  if (projectSkills.length > 0) {
    groups.push({
      key: 'project',
      label: 'Project',
      className: 'text-green-400',
      skills: projectSkills,
    });
  }

  if (userSkills.length > 0) {
    groups.push({
      key: 'user',
      label: 'User',
      className: 'text-blue-400',
      skills: userSkills,
    });
  }

  for (const [pluginName, skills] of pluginsByName) {
    groups.push({
      key: `plugin-${pluginName}`,
      label: pluginName,
      className: 'text-orange-400',
      skills,
    });
  }

  return groups;
}

function SkillGroupSection({ group }: { group: SkillGroup }) {
  return (
    <div>
      <div className="mb-1 px-2">
        <span
          className={`text-[10px] font-medium uppercase ${group.className}`}
        >
          {group.label}
        </span>
      </div>
      <div className="space-y-0.5">
        {group.skills.map((skill) => (
          <SkillItem key={`${skill.source}-${skill.name}`} skill={skill} />
        ))}
      </div>
    </div>
  );
}

function SkillsList({ taskId }: { taskId: string }) {
  const { data: skills, isLoading, error } = useSkills(taskId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-400">Failed to load skills</p>;
  }

  if (!skills || skills.length === 0) {
    return <p className="text-xs text-neutral-600">No skills available.</p>;
  }

  const groups = groupSkills(skills);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <SkillGroupSection key={group.key} group={group} />
      ))}
    </div>
  );
}

export function TaskSettingsPane({
  sessionAllowedTools,
  sourceBranch,
  sourceCommit,
  taskId,
  onRemoveTool,
  onClose,
  onOpenDebugMessages,
}: {
  sessionAllowedTools: string[];
  sourceBranch: string | null;
  sourceCommit: string | null;
  taskId: string;
  onRemoveTool: (toolName: string) => void;
  onClose: () => void;
  onOpenDebugMessages: () => void;
}) {
  const [copiedCommit, setCopiedCommit] = useState(false);

  const handleCopyCommit = async () => {
    if (sourceCommit) {
      await navigator.clipboard.writeText(sourceCommit);
      setCopiedCommit(true);
      setTimeout(() => setCopiedCommit(false), 2000);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div
        className={clsx(
          'flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-sm font-medium text-neutral-200">Task Settings</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6 overflow-auto p-4">
        {/* Source Info Section */}
        {(sourceBranch || sourceCommit) && (
          <section>
            <h4 className="mb-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Source
            </h4>
            <div className="space-y-2">
              {sourceBranch && (
                <div className="flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2.5">
                  <GitBranch className="h-4 w-4 text-neutral-500" />
                  <span className="text-sm text-neutral-200">
                    {sourceBranch}
                  </span>
                </div>
              )}
              {sourceCommit && (
                <div className="flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2.5">
                  <GitCommitHorizontal className="h-4 w-4 text-neutral-500" />
                  <span className="flex-1 truncate font-mono text-sm text-neutral-200">
                    {sourceCommit.slice(0, 8)}
                  </span>
                  <button
                    onClick={handleCopyCommit}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                    title="Copy full commit hash"
                  >
                    {copiedCommit ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Session Allowed Tools Section */}
        <section>
          <h4 className="mb-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Session Allowed Tools
          </h4>
          {sessionAllowedTools.length === 0 ? (
            <p className="text-xs text-neutral-600">
              No tools are currently allowed for this session. Tools will appear
              here when you use &quot;Allow for Session&quot; on a permission
              request.
            </p>
          ) : (
            <div className="space-y-1">
              {sessionAllowedTools.map((tool) => (
                <div
                  key={tool}
                  className="flex items-center justify-between rounded-md bg-neutral-800 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="truncate text-sm text-neutral-200">
                      {tool}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveTool(tool)}
                    className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                    title={`Remove ${tool}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Skills Section */}
        <section>
          <h4 className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Available Skills
          </h4>
          <SkillsList taskId={taskId} />
        </section>

        {/* Debug Section */}
        <section>
          <h4 className="mb-3 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Debug
          </h4>
          <button
            onClick={onOpenDebugMessages}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md bg-neutral-800 px-3 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
          >
            <Bug className="h-4 w-4 shrink-0 text-yellow-500" />
            Raw Messages
          </button>
        </section>
      </div>
    </div>
  );
}
