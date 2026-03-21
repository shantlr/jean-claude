import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Hammer,
  Play,
  Rocket,
} from 'lucide-react';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';
import { Button } from '@/common/ui/button';
import {
  useToggleTrackedPipelineVisible,
  useTrackedPipelines,
} from '@/hooks/use-tracked-pipelines';
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

type ContextMenuState = {
  x: number;
  y: number;
  pipeline: TrackedPipeline;
  projectId: string;
} | null;

function useClampedPosition(x: number, y: number) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  return { menuRef, pos };
}

function PipelineContextMenu({
  state,
  onClose,
}: {
  state: NonNullable<ContextMenuState>;
  onClose: () => void;
}) {
  const id = useId();
  const { menuRef, pos } = useClampedPosition(state.x, state.y);
  const toggleVisible = useToggleTrackedPipelineVisible(state.projectId);

  // Use the app's keyboard binding system so Escape is consumed
  // before reaching the parent overlay's handler (LIFO priority)
  useRegisterKeyboardBindings(`pipeline-ctx-menu-${id}`, {
    escape: () => {
      onClose();
      return true;
    },
    enter: () => {
      handleToggleVisible();
      return true;
    },
  });

  // Use the app's overlay system for click-outside detection
  useRegisterOverlay({
    id: `pipeline-ctx-menu-${id}`,
    refs: [menuRef],
    onClose,
  });

  // Auto-focus the first menu item on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const item =
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      item?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [menuRef]);

  const handleToggleVisible = useCallback(() => {
    toggleVisible.mutate({
      id: state.pipeline.id,
      visible: !state.pipeline.visible,
    });
    onClose();
  }, [toggleVisible, state.pipeline, onClose]);

  const isHidden = !state.pipeline.visible;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
      style={{ top: pos.y, left: pos.x }}
      role="menu"
      aria-label="Pipeline actions"
    >
      <button
        role="menuitem"
        tabIndex={-1}
        onClick={handleToggleVisible}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none"
      >
        {isHidden ? (
          <Eye className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
        )}
        {isHidden ? 'Show pipeline' : 'Hide pipeline'}
      </button>
    </div>,
    document.body,
  );
}

function PipelineItem({
  pipeline,
  project,
  filter,
  onFilterChange,
  onTriggerRun,
  onContextMenu,
  dimmed,
}: {
  pipeline: TrackedPipeline;
  project: Project;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
  onContextMenu: (e: React.MouseEvent, pipeline: TrackedPipeline) => void;
  dimmed?: boolean;
}) {
  const isSelected =
    filter.type === 'definition' &&
    filter.projectId === project.id &&
    filter.pipeline.id === pipeline.id;

  return (
    <div
      className={clsx('group flex items-center', dimmed && 'opacity-50')}
      onContextMenu={(e) => onContextMenu(e, pipeline)}
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
  onPipelineContextMenu,
}: {
  project: Project;
  expanded: boolean;
  onToggleExpanded: () => void;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
  onPipelineContextMenu: (
    e: React.MouseEvent,
    pipeline: TrackedPipeline,
    projectId: string,
  ) => void;
}) {
  const { visible, hidden } = usePipelineGroups(project.id);
  const [showHidden, setShowHidden] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pipeline: TrackedPipeline) => {
      onPipelineContextMenu(e, pipeline, project.id);
    },
    [onPipelineContextMenu, project.id],
  );

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
              onContextMenu={handleContextMenu}
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
                    onContextMenu={handleContextMenu}
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const handlePipelineContextMenu = useCallback(
    (e: React.MouseEvent, pipeline: TrackedPipeline, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, pipeline, projectId });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-neutral-700">
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
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
            onPipelineContextMenu={handlePipelineContextMenu}
          />
        ))}
      </div>

      {contextMenu && (
        <PipelineContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}
