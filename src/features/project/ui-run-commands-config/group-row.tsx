import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GitBranch, GripVertical, Trash2 } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(true);

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
      className={`border-acc-line/70 from-acc-soft/45 bg-glass-subtle relative overflow-hidden rounded-xl border bg-gradient-to-b to-transparent ${isDragging ? 'z-50 opacity-50' : ''}`}
    >
      <div className="from-acc to-status-azure absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b" />
      <div className="flex items-center gap-2 px-3 py-2 pl-4">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label="Reorder group"
          className="text-ink-4 hover:text-ink-2 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="text-ink-3 hover:bg-glass-light rounded p-1"
          aria-label={isOpen ? 'Collapse group' : 'Expand group'}
          aria-expanded={isOpen}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
        </button>
        <div className="border-acc-line bg-acc-soft flex h-6 w-6 shrink-0 items-center justify-center rounded-md border">
          <GitBranch className="text-acc-ink h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            size="md"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Group name"
            className="border-0 bg-transparent px-0 font-semibold"
          />
        </div>
        <span className="border-status-azure/30 bg-status-azure-soft text-status-azure flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
          <GitBranch className="h-3 w-3" />
          parallel
        </span>
        <span
          className="text-ink-3 font-mono text-[11px]"
          aria-label={`${selectedCount} commands selected`}
        >
          {selectedCount} cmd{selectedCount === 1 ? '' : 's'}
        </span>
        <IconButton
          variant="ghost"
          size="md"
          onClick={onDelete}
          icon={<Trash2 />}
          tooltip="Delete group"
        />
      </div>

      {isOpen && (
        <div className="px-3 pb-3 pl-8">
          <div className="text-ink-3 mb-2 flex items-center gap-2 font-mono text-[10px] tracking-wide uppercase">
            Runs simultaneously
          </div>
          {commands.length === 0 ? (
            <div className="border-glass-border bg-bg-0/30 text-ink-3 rounded-lg border border-dashed px-3 py-2 text-sm">
              Add a command first, then include it in this group.
            </div>
          ) : (
            <div className="border-l-acc-line space-y-1.5 border-l pl-3">
              {commands.map((command) => (
                <div key={command.id} className="relative">
                  <span className="bg-status-azure absolute top-3 -left-[15px] h-1.5 w-1.5 rounded-full shadow-[0_0_8px_var(--color-status-azure)]" />
                  <div className="border-glass-border bg-bg-0/20 rounded-lg border px-3 py-2">
                    <Checkbox
                      size="sm"
                      checked={group.commandIds.includes(command.id)}
                      onChange={(checked) =>
                        handleToggleCommand(command.id, checked)
                      }
                      label={getRunCommandDisplayName(command)}
                      description={command.name ? command.command : undefined}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
