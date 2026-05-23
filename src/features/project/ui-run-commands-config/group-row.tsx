import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import type {
  ProjectCommand,
  ProjectCommandGroup,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';
import { getRunCommandDisplayName } from '@shared/run-command-types';

export function GroupRow({
  sortableId,
  group,
  commands,
  onUpdate,
  onDelete,
}: {
  sortableId: string;
  group: ProjectCommandGroup;
  commands: ProjectCommand[];
  onUpdate: (data: UpdateProjectCommandGroup) => void;
  onDelete: () => void;
}) {
  const [localName, setLocalName] = useState(group.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    setLocalName(group.name);
  }, [group.name]);

  const selectedCount = useMemo(
    () =>
      group.commandIds.filter((id) => commands.some((cmd) => cmd.id === id))
        .length,
    [commands, group.commandIds],
  );

  const handleNameBlur = () => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== group.name) {
      onUpdate({ name: trimmed });
    }
    setLocalName(trimmed || group.name);
  };

  const handleToggleCommand = (commandId: string, checked: boolean) => {
    const nextCommandIds = checked
      ? [...group.commandIds, commandId]
      : group.commandIds.filter((id) => id !== commandId);
    onUpdate({ commandIds: nextCommandIds });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-glass-border bg-bg-1/50 rounded-lg border p-3 ${isDragging ? 'z-50 opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label="Reorder group"
          className="text-ink-3 hover:text-ink-1 mt-1.5 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            size="md"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Group name"
          />
          <p className="text-ink-3 text-xs">
            {selectedCount} commands selected
          </p>
        </div>
        <IconButton
          variant="ghost"
          size="md"
          onClick={onDelete}
          icon={<Trash2 />}
          tooltip="Delete group"
        />
      </div>

      <div className="mt-3 space-y-2 pl-6">
        <label className="text-ink-2 block text-xs">Commands in group</label>
        <div className="space-y-2">
          {commands.map((command) => (
            <Checkbox
              key={command.id}
              size="sm"
              checked={group.commandIds.includes(command.id)}
              onChange={(checked) => handleToggleCommand(command.id, checked)}
              label={getRunCommandDisplayName(command)}
              description={command.name ? command.command : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
