import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Hammer,
  Play,
  Rocket,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { useTrackedPipelines } from '@/hooks/use-tracked-pipelines';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

import type { SidebarFilter } from './index';

export function getNavId(item: SidebarFilter): string {
  if (item.type === 'all') return 'nav-all';
  if (item.type === 'project') return `nav-project-${item.projectId}`;
  return `nav-def-${item.projectId}-${item.pipeline.id}`;
}

function usePipelineGroups(projectId: string) {
  const { data: pipelines = [] } = useTrackedPipelines(projectId);
  return useMemo(() => {
    const visible: TrackedPipeline[] = [];
    const hidden: TrackedPipeline[] = [];
    for (const p of pipelines) {
      if (p.visible) {
        visible.push(p);
      } else {
        hidden.push(p);
      }
    }
    return { visible, hidden };
  }, [pipelines]);
}

function PipelineItem({
  pipeline,
  project,
  filter,
  onFilterChange,
  onTriggerRun,
  dimmed,
}: {
  pipeline: TrackedPipeline;
  project: Project;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
  dimmed?: boolean;
}) {
  const isSelected =
    filter.type === 'definition' &&
    filter.projectId === project.id &&
    filter.pipeline.id === pipeline.id;

  return (
    <div
      key={pipeline.id}
      className={clsx('group flex items-center', dimmed && 'opacity-50')}
    >
      <Button
        data-nav-id={getNavId({
          type: 'definition',
          projectId: project.id,
          pipeline,
        })}
        onClick={() =>
          onFilterChange({
            type: 'definition',
            projectId: project.id,
            pipeline,
          })
        }
        className={clsx(
          'flex flex-1 items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs transition-colors',
          isSelected
            ? 'bg-neutral-700 font-medium text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
        )}
      >
        {pipeline.kind === 'build' ? (
          <Hammer className="h-2.5 w-2.5 shrink-0" />
        ) : (
          <Rocket className="h-2.5 w-2.5 shrink-0" />
        )}
        <span className="truncate">{pipeline.name}</span>
      </Button>
      <Button
        onClick={() => onTriggerRun(project, pipeline)}
        className="shrink-0 rounded p-1 text-neutral-500 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 hover:text-neutral-300"
        aria-label={`Trigger ${pipeline.name}`}
      >
        <Play className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ProjectGroup({
  project,
  expanded,
  onToggleExpanded,
  filter,
  onFilterChange,
  onTriggerRun,
}: {
  project: Project;
  expanded: boolean;
  onToggleExpanded: () => void;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
}) {
  const { visible, hidden } = usePipelineGroups(project.id);
  const [showHidden, setShowHidden] = useState(false);

  const isProjectSelected =
    filter.type === 'project' && filter.projectId === project.id;

  if (visible.length === 0 && hidden.length === 0) return null;

  return (
    <div>
      <Button
        data-nav-id={getNavId({ type: 'project', projectId: project.id })}
        onClick={() => {
          onFilterChange({ type: 'project', projectId: project.id });
          onToggleExpanded();
        }}
        className={clsx(
          'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
          isProjectSelected
            ? 'bg-neutral-700 font-medium text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{project.name}</span>
      </Button>

      {expanded && (
        <div className="mt-0.5 ml-3 flex flex-col gap-0.5">
          {visible.map((pipeline) => (
            <PipelineItem
              key={pipeline.id}
              pipeline={pipeline}
              project={project}
              filter={filter}
              onFilterChange={onFilterChange}
              onTriggerRun={onTriggerRun}
            />
          ))}

          {hidden.length > 0 && (
            <>
              <Button
                onClick={() => setShowHidden((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 text-left text-[11px] text-neutral-500 hover:text-neutral-400"
              >
                <EyeOff className="h-3 w-3 shrink-0" />
                <span>
                  {showHidden ? 'Hide' : 'Show'} {hidden.length} hidden
                </span>
              </Button>
              {showHidden &&
                hidden.map((pipeline) => (
                  <PipelineItem
                    key={pipeline.id}
                    pipeline={pipeline}
                    project={project}
                    filter={filter}
                    onFilterChange={onFilterChange}
                    onTriggerRun={onTriggerRun}
                    dimmed
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  projects,
  filter,
  expandedProjects,
  onToggleExpanded,
  onFilterChange,
  onTriggerRun,
}: {
  projects: Project[];
  filter: SidebarFilter;
  expandedProjects: Set<string>;
  onToggleExpanded: (projectId: string) => void;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-neutral-700 p-3">
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <Button
          data-nav-id="nav-all"
          onClick={() => onFilterChange({ type: 'all' })}
          className={clsx(
            'rounded px-2 py-1.5 text-left text-sm transition-colors',
            filter.type === 'all'
              ? 'bg-neutral-700 font-medium text-neutral-100'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
          )}
        >
          All Projects
        </Button>

        <div className="my-1 border-t border-neutral-800" />

        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            expanded={expandedProjects.has(project.id)}
            onToggleExpanded={() => onToggleExpanded(project.id)}
            filter={filter}
            onFilterChange={onFilterChange}
            onTriggerRun={onTriggerRun}
          />
        ))}
      </div>
    </div>
  );
}
