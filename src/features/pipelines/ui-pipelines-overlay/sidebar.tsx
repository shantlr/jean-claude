import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Hammer,
  Play,
  Rocket,
} from 'lucide-react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { CSS } from '@dnd-kit/utilities';
import type React from 'react';



import {
  useReorderTrackedPipelines,
  useToggleTrackedPipelineVisible,
  useTrackedPipelines,
} from '@/hooks/use-tracked-pipelines';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import type { Project } from '@shared/types';
import { Separator } from '@/common/ui/separator';
import type { TrackedPipeline } from '@shared/pipeline-types';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';



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
    for (const pipeline of pipelines) {
      if (pipeline.visible) {
        visible.push(pipeline);
      } else {
        hidden.push(pipeline);
      }
    }
    return { pipelines, visible, hidden };
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

  useRegisterOverlay({
    id: `pipeline-ctx-menu-${id}`,
    refs: [menuRef],
    onClose,
  });

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pipeline.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(isDragging && 'opacity-0')}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => onContextMenu(e, pipeline)}
    >
      <PipelineRowContent
        pipeline={pipeline}
        project={project}
        filter={filter}
        onFilterChange={onFilterChange}
        onTriggerRun={onTriggerRun}
        dimmed={dimmed}
      />
    </div>
  );
}

function PipelineRowContent({
  pipeline,
  project,
  filter,
  onFilterChange,
  onTriggerRun,
  dimmed,
  overlay = false,
}: {
  pipeline: TrackedPipeline;
  project: Project;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
  dimmed?: boolean;
  overlay?: boolean;
}) {
  const isSelected =
    filter.type === 'definition' &&
    filter.projectId === project.id &&
    filter.pipeline.id === pipeline.id;

  return (
    <div
      className={clsx(
        'group flex items-center gap-0.5',
        dimmed && 'opacity-50',
        overlay &&
          'border-glass-border bg-bg-0/95 rounded-md border px-1 py-0.5 shadow-lg',
      )}
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
          isSelected
            ? 'bg-acc/8 text-ink-0 ring-acc/30 font-medium ring-1'
            : 'text-ink-2',
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
        className={clsx(
          'shrink-0',
          overlay ? 'opacity-0' : 'opacity-0 group-hover:opacity-100',
        )}
      />
    </div>
  );
}

function ProjectRowContent({
  project,
  expanded,
  filter,
  onFilterChange,
  onToggleExpanded,
  overlay = false,
}: {
  project: Project;
  expanded: boolean;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onToggleExpanded: () => void;
  overlay?: boolean;
}) {
  const isProjectSelected =
    filter.type === 'project' && filter.projectId === project.id;

  return (
    <div
      className={clsx(
        'flex items-center gap-0.5',
        overlay &&
          'border-glass-border bg-bg-0/95 rounded-md border px-1 py-0.5 shadow-lg',
      )}
    >
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
  const { pipelines, visible, hidden } = usePipelineGroups(project.id);
  const reorderTrackedPipelines = useReorderTrackedPipelines(project.id);
  const [showHidden, setShowHidden] = useState(false);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [activePipelineWidth, setActivePipelineWidth] = useState<number | null>(
    null,
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const visiblePipelineIds = useMemo(
    () => visible.map((pipeline) => pipeline.id),
    [visible],
  );
  const pipelineIds = useMemo(
    () => pipelines.map((pipeline) => pipeline.id),
    [pipelines],
  );
  const firstHiddenIndex = useMemo(
    () => pipelines.findIndex((pipeline) => !pipeline.visible),
    [pipelines],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pipeline: TrackedPipeline) => {
      onPipelineContextMenu(e, pipeline, project.id);
    },
    [onPipelineContextMenu, project.id],
  );

  const handlePipelineDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActivePipelineId(null);
      setActivePipelineWidth(null);
      if (!over || active.id === over.id) return;

      if (showHidden) {
        const oldIndex = pipelineIds.indexOf(active.id as string);
        const newIndex = pipelineIds.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return;

        reorderTrackedPipelines.mutate(
          arrayMove(pipelineIds, oldIndex, newIndex),
        );
        return;
      }

      const activeVisibleIndex = visiblePipelineIds.indexOf(
        active.id as string,
      );
      const overVisibleIndex = visiblePipelineIds.indexOf(over.id as string);

      if (activeVisibleIndex !== -1 && overVisibleIndex !== -1) {
        const reorderedVisibleIds = arrayMove(
          visiblePipelineIds,
          activeVisibleIndex,
          overVisibleIndex,
        );
        let nextVisibleIndex = 0;
        const nextPipelineIds = pipelines.map((pipeline) => {
          if (!pipeline.visible) return pipeline.id;

          const nextPipelineId =
            reorderedVisibleIds[nextVisibleIndex] ?? pipeline.id;
          nextVisibleIndex += 1;
          return nextPipelineId;
        });

        reorderTrackedPipelines.mutate(nextPipelineIds);
      }
    },
    [
      pipelineIds,
      pipelines,
      reorderTrackedPipelines,
      showHidden,
      visiblePipelineIds,
    ],
  );

  const activePipeline = useMemo(
    () =>
      pipelines.find((pipeline) => pipeline.id === activePipelineId) ?? null,
    [activePipelineId, pipelines],
  );

  const handlePipelineDragStart = useCallback((event: DragStartEvent) => {
    setActivePipelineId(event.active.id as string);
    setActivePipelineWidth(event.active.rect.current.initial?.width ?? null);
  }, []);

  const handlePipelineDragFinish = useCallback(() => {
    setActivePipelineId(null);
    setActivePipelineWidth(null);
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(isDragging && 'opacity-0')}
      {...attributes}
      {...listeners}
    >
      <ProjectRowContent
        project={project}
        expanded={expanded}
        filter={filter}
        onFilterChange={onFilterChange}
        onToggleExpanded={onToggleExpanded}
      />

      {expanded && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handlePipelineDragStart}
          onDragEnd={handlePipelineDragEnd}
          onDragCancel={handlePipelineDragFinish}
        >
          <div className="mt-0.5 ml-2.5 flex flex-col gap-px">
            <SortableContext
              items={showHidden ? pipelineIds : visiblePipelineIds}
              strategy={verticalListSortingStrategy}
            >
              {showHidden
                ? pipelines.map((pipeline, index) => {
                    return (
                      <Fragment key={pipeline.id}>
                        {hidden.length > 0 && index === firstHiddenIndex && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowHidden(false)}
                            icon={<EyeOff />}
                            className="mb-0.5"
                          >
                            Hide {hidden.length} hidden
                          </Button>
                        )}
                        <PipelineItem
                          pipeline={pipeline}
                          project={project}
                          filter={filter}
                          onFilterChange={onFilterChange}
                          onTriggerRun={onTriggerRun}
                          onContextMenu={handleContextMenu}
                          dimmed={!pipeline.visible}
                        />
                      </Fragment>
                    );
                  })
                : visible.map((pipeline) => (
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
            </SortableContext>

            <DragOverlay>
              {activePipeline ? (
                <div style={{ width: activePipelineWidth ?? undefined }}>
                  <PipelineRowContent
                    pipeline={activePipeline}
                    project={project}
                    filter={filter}
                    onFilterChange={onFilterChange}
                    onTriggerRun={onTriggerRun}
                    dimmed={!activePipeline.visible}
                    overlay
                  />
                </div>
              ) : null}
            </DragOverlay>

            {!showHidden && hidden.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHidden(true)}
                icon={<EyeOff />}
              >
                Show {hidden.length} hidden
              </Button>
            )}
          </div>
        </DndContext>
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
  onReorderProjects,
  onTriggerRun,
}: {
  projects: Project[];
  filter: SidebarFilter;
  expandedProjects: Set<string>;
  onToggleExpanded: (projectId: string) => void;
  onFilterChange: (filter: SidebarFilter) => void;
  onReorderProjects: (orderedProjectIds: string[]) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectWidth, setActiveProjectWidth] = useState<number | null>(
    null,
  );
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handlePipelineContextMenu = useCallback(
    (e: React.MouseEvent, pipeline: TrackedPipeline, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, pipeline, projectId });
    },
    [],
  );

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveProjectId(null);
      setActiveProjectWidth(null);
      if (!over || active.id === over.id) return;

      const oldIndex = projectIds.indexOf(active.id as string);
      const newIndex = projectIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      onReorderProjects(arrayMove(projectIds, oldIndex, newIndex));
    },
    [onReorderProjects, projectIds],
  );

  const handleProjectDragStart = useCallback((event: DragStartEvent) => {
    setActiveProjectId(event.active.id as string);
    setActiveProjectWidth(event.active.rect.current.initial?.width ?? null);
  }, []);

  const handleProjectDragCancel = useCallback(() => {
    setActiveProjectId(null);
    setActiveProjectWidth(null);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="flex w-56 shrink-0 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleProjectDragStart}
        onDragEnd={handleProjectDragEnd}
        onDragCancel={handleProjectDragCancel}
      >
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

          <SortableContext
            items={projectIds}
            strategy={verticalListSortingStrategy}
          >
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
          </SortableContext>
        </div>

        <DragOverlay>
          {activeProject ? (
            <div style={{ width: activeProjectWidth ?? undefined }}>
              <ProjectRowContent
                project={activeProject}
                expanded={expandedProjects.has(activeProject.id)}
                filter={filter}
                onFilterChange={onFilterChange}
                onToggleExpanded={() => {}}
                overlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {contextMenu && (
        <PipelineContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}
