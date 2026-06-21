import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { GitBranch, Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';



import type {
  ProjectCommand,
  ProjectCommandGroup,
  RunCommandConfigItem,
  UpdateProjectCommand,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';
import {
  useCreateProjectCommand,
  useDeleteProjectCommand,
  useProjectCommands,
  useUpdateProjectCommand,
} from '@/hooks/use-project-commands';
import {
  useCreateProjectCommandGroup,
  useDeleteProjectCommandGroup,
  useProjectCommandGroups,
  useUpdateProjectCommandGroup,
} from '@/hooks/use-project-command-groups';
import { usePackageScripts } from '@/hooks/use-package-scripts';
import { useReorderProjectRunConfig } from '@/hooks/use-project-run-config';



import { CommandRow } from './command-row';
import { GroupRow } from './group-row';

export function RunCommandsConfig({
  projectId,
  projectPath,
}: {
  projectId: string;
  projectPath: string;
}) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const { data: groups = [] } = useProjectCommandGroups(projectId);
  const { data: scriptsData } = usePackageScripts(projectPath);
  const createCommand = useCreateProjectCommand();
  const updateCommand = useUpdateProjectCommand();
  const deleteCommand = useDeleteProjectCommand();
  const createGroup = useCreateProjectCommandGroup();
  const updateGroup = useUpdateProjectCommandGroup();
  const deleteGroup = useDeleteProjectCommandGroup();
  const reorderRunConfig = useReorderProjectRunConfig();

  const items = useMemo(
    () =>
      [
        ...commands.map((item) => ({ type: 'command' as const, item })),
        ...groups.map((item) => ({ type: 'group' as const, item })),
      ].sort(
        (a, b) =>
          a.item.sortOrder - b.item.sortOrder ||
          a.item.createdAt.localeCompare(b.item.createdAt),
      ),
    [commands, groups],
  );
  const itemIds = useMemo(
    () => items.map((item) => `${item.type}:${item.item.id}`),
    [items],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const workspaceScripts =
    scriptsData?.workspacePackages?.flatMap((p) => p.scripts) ?? [];
  const suggestions = [...(scriptsData?.scripts ?? []), ...workspaceScripts];

  const handleAddCommand = () => {
    createCommand.mutate({
      projectId,
      name: null,
      command: '',
      ports: [],
      envVars: [],
      confirmBeforeRun: false,
      confirmMessage: null,
    });
  };

  const handleUpdateCommand = (id: string, data: UpdateProjectCommand) => {
    updateCommand.mutate({ id, data });
  };

  const handleDeleteCommand = (id: string) => {
    deleteCommand.mutate(id);
  };

  const handleAddGroup = () => {
    createGroup.mutate({
      projectId,
      name: `Group ${groups.length + 1}`,
      commandIds: [],
    });
  };

  const handleUpdateGroup = (id: string, data: UpdateProjectCommandGroup) => {
    updateGroup.mutate({ id, data });
  };

  const handleDeleteGroup = (id: string) => {
    deleteGroup.mutate(id);
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = itemIds.indexOf(active.id as string);
      const newIndex = itemIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(
        items,
        oldIndex,
        newIndex,
      ).map<RunCommandConfigItem>((item, index) => ({
        type: item.type,
        id: item.item.id,
        sortOrder: index,
      }));
      reorderRunConfig.mutate({ projectId, items: newOrder });
    },
    [itemIds, items, projectId, reorderRunConfig],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-ink-0 text-lg font-semibold tracking-tight">
            Run Commands
          </h2>
          <span className="text-ink-3 font-mono text-[11px]">
            {commands.length} command{commands.length === 1 ? '' : 's'} /{' '}
            {groups.length} group{groups.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-ink-2 mt-1 max-w-2xl text-sm leading-6">
          Save commands you run often from tasks. Bundle commands into groups to
          launch them together in parallel.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) =>
              item.type === 'command' ? (
                <CommandRow
                  key={`command:${item.item.id}`}
                  sortableId={`command:${item.item.id}`}
                  command={item.item as ProjectCommand}
                  suggestions={suggestions}
                  onUpdate={(data) => handleUpdateCommand(item.item.id, data)}
                  onDelete={() => handleDeleteCommand(item.item.id)}
                />
              ) : (
                <GroupRow
                  key={`group:${item.item.id}`}
                  sortableId={`group:${item.item.id}`}
                  group={item.item as ProjectCommandGroup}
                  commands={commands}
                  onUpdate={(data) => handleUpdateGroup(item.item.id, data)}
                  onDelete={() => handleDeleteGroup(item.item.id)}
                />
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="border-glass-border bg-bg-1/20 mt-4 flex items-center gap-2 rounded-lg border border-dashed p-2">
        <button
          type="button"
          onClick={handleAddCommand}
          disabled={createCommand.isPending}
          className="bg-acc text-bg-0 hover:bg-acc/90 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add command
        </button>
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={createGroup.isPending}
          className="border-glass-border text-ink-2 hover:border-glass-border-strong hover:text-ink-1 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <GitBranch className="h-4 w-4" />
          Add group
        </button>
        <div className="flex-1" />
        <p className="text-ink-3 hidden text-xs sm:block">
          Drag items to reorder. Groups run selected commands in parallel.
        </p>
      </div>
    </div>
  );
}
