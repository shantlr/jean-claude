import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useMemo, useCallback } from 'react';

import { usePackageScripts } from '@/hooks/use-package-scripts';
import {
  useCreateProjectCommandGroup,
  useDeleteProjectCommandGroup,
  useProjectCommandGroups,
  useUpdateProjectCommandGroup,
} from '@/hooks/use-project-command-groups';
import {
  useProjectCommands,
  useCreateProjectCommand,
  useUpdateProjectCommand,
  useDeleteProjectCommand,
} from '@/hooks/use-project-commands';
import { useReorderProjectRunConfig } from '@/hooks/use-project-run-config';
import type {
  ProjectCommand,
  ProjectCommandGroup,
  RunCommandConfigItem,
  UpdateProjectCommand,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';

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
    <div>
      <h2 className="text-ink-0 mb-4 text-lg font-semibold">Run Commands</h2>
      <p className="text-ink-2 mb-4 text-sm">
        Configure commands to run from the task page. Each command can have
        ports that will be checked before starting.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
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

      <button
        type="button"
        onClick={handleAddCommand}
        disabled={createCommand.isPending}
        className="border-glass-border text-ink-2 hover:border-glass-border-strong hover:text-ink-1 mt-4 flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Command
      </button>

      <div className="mt-8 flex items-start gap-3">
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={createGroup.isPending}
          className="border-glass-border text-ink-2 hover:border-glass-border-strong hover:text-ink-1 flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Group
        </button>
        <p className="text-ink-3 pt-2 text-sm">
          Drag commands and groups together to fully customize ordering.
        </p>
      </div>
    </div>
  );
}
