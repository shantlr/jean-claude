import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Settings, Terminal, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import type {
  ProjectCommand,
  UpdateProjectCommand,
} from '@shared/run-command-types';

import { PortChipInput } from './port-chip-input';

export function CommandRow({
  sortableId,
  command,
  suggestions,
  onUpdate,
  onDelete,
}: {
  sortableId: string;
  command: ProjectCommand;
  suggestions: string[];
  onUpdate: (data: UpdateProjectCommand) => void;
  onDelete: () => void;
}) {
  const [localName, setLocalName] = useState(command.name ?? '');
  const [localCommand, setLocalCommand] = useState(command.command);
  const [localConfirmMessage, setLocalConfirmMessage] = useState(
    command.confirmMessage ?? '',
  );
  const [isOpen, setIsOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
    setLocalName(command.name ?? '');
  }, [command.name]);

  useEffect(() => {
    setLocalCommand(command.command);
  }, [command.command]);

  useEffect(() => {
    setLocalConfirmMessage(command.confirmMessage ?? '');
  }, [command.confirmMessage]);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(localCommand.toLowerCase()) &&
      s !== localCommand,
  );

  const handleNameBlur = () => {
    const trimmed = localName.trim();
    const newValue = trimmed || null;
    if (newValue !== (command.name ?? null)) {
      onUpdate({ name: newValue });
    }
  };

  const handleCommandChange = (value: string) => {
    setLocalCommand(value);
    setShowSuggestions(true);
  };

  const handleCommandBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
    if (localCommand !== command.command) {
      onUpdate({ command: localCommand });
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setLocalCommand(suggestion);
    setShowSuggestions(false);
    onUpdate({ command: suggestion });
  };

  const handlePortsChange = (ports: number[]) => {
    onUpdate({ ports });
  };

  const handleConfirmToggle = (checked: boolean) => {
    onUpdate({ confirmBeforeRun: checked });
  };

  const handleConfirmMessageBlur = () => {
    const trimmed = localConfirmMessage.trim();
    const newValue = trimmed || null;
    if (newValue !== (command.confirmMessage ?? null)) {
      onUpdate({ confirmMessage: newValue });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-glass-border bg-glass-subtle overflow-visible rounded-lg border ${isDragging ? 'z-50 opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label="Reorder command"
          className="text-ink-4 hover:text-ink-2 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="border-glass-border w-28 shrink-0 border-r pr-2">
          <Input
            size="sm"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Optional display name"
            className="border-0 bg-transparent px-1"
          />
        </div>
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <Terminal className="text-acc h-3.5 w-3.5 shrink-0" />
          <div className="relative min-w-0 flex-1">
            <Input
              size="md"
              value={localCommand}
              onChange={(e) => handleCommandChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={handleCommandBlur}
              placeholder="Enter command (e.g., pnpm dev)"
              className="border-0 bg-transparent px-0 font-mono"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="border-glass-border bg-bg-1 absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border py-1 shadow-lg">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                    className="text-ink-1 hover:bg-glass-medium w-full px-3 py-1.5 text-left text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {!isOpen &&
          command.ports.slice(0, 2).map((port) => (
            <span
              key={port}
              className="bg-glass-light text-ink-3 rounded px-1.5 py-0.5 font-mono text-[10px]"
            >
              :{port}
            </span>
          ))}
        {!isOpen && command.ports.length > 2 && (
          <span className="bg-glass-light text-ink-3 rounded px-1.5 py-0.5 font-mono text-[10px]">
            +{command.ports.length - 2}
          </span>
        )}
        {!isOpen && command.confirmBeforeRun && (
          <Check
            className="text-ink-3 h-3.5 w-3.5"
            aria-label="Requires confirmation"
          />
        )}
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className={`hover:bg-glass-light rounded-md p-1.5 ${isOpen ? 'bg-acc-soft text-acc-ink' : 'text-ink-3'}`}
          aria-label="Ports and options"
          aria-expanded={isOpen}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <IconButton
          variant="ghost"
          size="md"
          onClick={onDelete}
          icon={<Trash2 />}
          tooltip="Delete command"
        />
      </div>
      {isOpen && (
        <div className="bg-bg-0/30 border-glass-border flex flex-wrap items-start gap-4 border-t px-9 py-3">
          <div className="min-w-56 flex-1">
            <label className="text-ink-3 mb-1.5 block text-xs">
              Ports to check
            </label>
            <PortChipInput ports={command.ports} onChange={handlePortsChange} />
          </div>
          <div className="min-w-60 pt-5">
            <Checkbox
              size="sm"
              checked={command.confirmBeforeRun}
              onChange={handleConfirmToggle}
              label="Confirm before running"
            />
            {command.confirmBeforeRun && (
              <Input
                size="sm"
                value={localConfirmMessage}
                onChange={(e) => setLocalConfirmMessage(e.target.value)}
                onBlur={handleConfirmMessageBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                placeholder="Custom confirmation message (optional)"
                className="mt-2"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
