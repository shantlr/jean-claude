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
import { IconButton } from '@/common/ui/icon-button';
import { Separator } from '@/common/ui/separator';
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
      className="border-glass-border bg-bg-1 fixed z-50 min-w-[160px] rounded-md border py-1 shadow-lg"
      style={{ top: pos.y, left: pos.x }}
      role="menu"
      aria-label="Pipeline actions"
    >
      <button
        role="menuitem"
        tabIndex={-1}
        onClick={handleToggleVisible}
        className="text-ink-1 hover:bg-glass-medium focus:bg-glass-medium flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors focus:outline-none"
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
        variant="ghost"
        size="sm"
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
        icon={pipeline.kind === 'build' ? <Hammer /> : <Rocket />}
        className={clsx(
          'flex-1 justify-start truncate',
          isSelected ? 'text-ink-0 bg-glass-medium font-medium' : 'text-ink-2',
        )}
      >
        <span className="truncate">{pipeline.name}</span>
      </Button>
      <IconButton
        variant="ghost"
        size="sm"
        onClick={() => onTriggerRun(project, pipeline)}
        icon={<Play />}
        tooltip={`Trigger ${pipeline.name}`}
        className="shrink-0 opacity-0 group-hover:opacity-100"
      />
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
        variant="ghost"
        size="sm"
        data-nav-id={getNavId({ type: 'project', projectId: project.id })}
        onClick={() => {
          onFilterChange({ type: 'project', projectId: project.id });
          onToggleExpanded();
        }}
        icon={expanded ? <ChevronDown /> : <ChevronRight />}
        className={clsx(
          'w-full justify-start',
          isProjectSelected
            ? 'text-ink-0 bg-glass-medium font-medium'
            : 'text-ink-2',
        )}
      >
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
                variant="ghost"
                size="sm"
                onClick={() => setShowHidden((prev) => !prev)}
                icon={<EyeOff />}
              >
                {showHidden ? 'Hide' : 'Show'} {hidden.length} hidden
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
    <div className="flex w-56 shrink-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          data-nav-id="nav-all"
          onClick={() => onFilterChange({ type: 'all' })}
          className={clsx(
            'w-full justify-start',
            filter.type === 'all'
              ? 'text-ink-0 bg-glass-medium font-medium'
              : 'text-ink-2',
          )}
        >
          All Projects
        </Button>

        <Separator className="my-1" />

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
