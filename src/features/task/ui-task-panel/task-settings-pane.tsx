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

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Separator } from '@/common/ui/separator';
import { useSkills } from '@/hooks/use-skills';
import type { PermissionScope } from '@shared/permission-types';
import type { Skill } from '@shared/skill-types';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';

function SkillItem({ skill }: { skill: Skill }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="hover:bg-glass-light cursor-pointer rounded px-2 py-1"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-1.5">
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-3 w-3 shrink-0" />
        )}
        <Wand2 className="text-acc-ink h-3 w-3 shrink-0" />
        <span className="text-ink-1 min-w-0 flex-1 truncate text-xs">
          {skill.name}
        </span>
      </div>
      {isExpanded && (
        <p className="text-ink-3 mt-1 mr-2 ml-[30px] text-[11px] leading-relaxed">
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
      className: 'text-status-done',
      skills: projectSkills,
    });
  }

  if (userSkills.length > 0) {
    groups.push({
      key: 'user',
      label: 'User',
      className: 'text-acc-ink',
      skills: userSkills,
    });
  }

  for (const [pluginName, skills] of pluginsByName) {
    groups.push({
      key: `plugin-${pluginName}`,
      label: pluginName,
      className: 'text-status-run',
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

function SkillsList({ taskId, stepId }: { taskId: string; stepId?: string }) {
  const { data: skills, isLoading, error } = useSkills({ taskId, stepId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 className="text-ink-3 h-3 w-3 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-status-fail text-xs">Failed to load skills</p>;
  }

  if (!skills || skills.length === 0) {
    return <p className="text-ink-4 text-xs">No skills available.</p>;
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
  sessionRules,
  sourceBranch,
  sourceCommit,
  taskId,
  stepId,
  onRemoveTool,
  onClose,
  onOpenDebugMessages,
}: {
  sessionRules: PermissionScope;
  sourceBranch: string | null;
  sourceCommit: string | null;
  taskId: string;
  stepId?: string;
  onRemoveTool: ({
    toolName,
    pattern,
  }: {
    toolName: string;
    pattern?: string;
  }) => void;
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
    <div className="panel-edge-shadow bg-bg-0 flex h-full w-80 flex-col">
      {/* Header */}
      <div
        className={clsx(
          'flex shrink-0 items-center justify-between px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-ink-1 text-sm font-medium">Task Settings</h3>
        <IconButton onClick={onClose} size="sm" icon={<X />} tooltip="Close" />
      </div>
      <Separator />

      {/* Content */}
      <div className="flex-1 space-y-6 overflow-auto p-4">
        {/* Source Info Section */}
        {(sourceBranch || sourceCommit) && (
          <section>
            <h4 className="text-ink-3 mb-3 text-xs font-medium tracking-wide uppercase">
              Source
            </h4>
            <div className="space-y-2">
              {sourceBranch && (
                <div className="bg-bg-1 flex items-center gap-2 rounded-md px-3 py-2.5">
                  <GitBranch className="text-ink-3 h-4 w-4" />
                  <span className="text-ink-1 text-sm">{sourceBranch}</span>
                </div>
              )}
              {sourceCommit && (
                <div className="bg-bg-1 flex items-center gap-2 rounded-md px-3 py-2.5">
                  <GitCommitHorizontal className="text-ink-3 h-4 w-4" />
                  <span className="text-ink-1 flex-1 truncate font-mono text-sm">
                    {sourceCommit.slice(0, 8)}
                  </span>
                  <IconButton
                    onClick={handleCopyCommit}
                    size="sm"
                    icon={
                      copiedCommit ? (
                        <Check className="text-status-done" />
                      ) : (
                        <Copy />
                      )
                    }
                    tooltip="Copy full commit hash"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Session Allowed Tools Section */}
        <section>
          <h4 className="text-ink-3 mb-3 text-xs font-medium tracking-wide uppercase">
            Session Allowed Tools
          </h4>
          {Object.keys(sessionRules).length === 0 ? (
            <p className="text-ink-4 text-xs">
              No tools are currently allowed for this session. Tools will appear
              here when you use &quot;Allow for Session&quot; on a permission
              request.
            </p>
          ) : (
            <div className="space-y-1">
              {Object.entries(sessionRules).map(([tool, config]) => {
                const patterns =
                  typeof config === 'object' && config !== null
                    ? Object.keys(config as Record<string, string>)
                    : null;
                const entries = patterns
                  ? patterns.map((p) => ({
                      label: `${tool}: ${p}`,
                      tool,
                      pattern: p,
                    }))
                  : [{ label: tool, tool, pattern: undefined }];
                return entries.map(({ label, tool: toolKey, pattern }) => (
                  <div
                    key={label}
                    className="bg-bg-1 flex items-center justify-between rounded-md px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Shield className="text-acc-ink h-3.5 w-3.5 shrink-0" />
                      <span className="text-ink-1 truncate text-sm">
                        {label}
                      </span>
                    </div>
                    <IconButton
                      onClick={() =>
                        onRemoveTool({ toolName: toolKey, pattern })
                      }
                      size="sm"
                      icon={<X />}
                      tooltip={`Remove ${label}`}
                    />
                  </div>
                ));
              })}
            </div>
          )}
        </section>

        {/* Skills Section */}
        <section>
          <h4 className="text-ink-3 mb-2 text-xs font-medium tracking-wide uppercase">
            Available Skills
          </h4>
          <SkillsList taskId={taskId} stepId={stepId} />
        </section>

        {/* Debug Section */}
        <section>
          <h4 className="text-ink-3 mb-3 text-xs font-medium tracking-wide uppercase">
            Debug
          </h4>
          <Button
            onClick={onOpenDebugMessages}
            variant="secondary"
            size="md"
            icon={<Bug className="text-status-run" />}
            className="w-full justify-start"
          >
            Raw Messages
          </Button>
        </section>
      </div>
    </div>
  );
}
