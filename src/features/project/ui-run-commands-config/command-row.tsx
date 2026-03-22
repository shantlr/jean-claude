import { Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import type {
  ProjectCommand,
  UpdateProjectCommand,
} from '@shared/run-command-types';

import { PortChipInput } from './port-chip-input';

export function CommandRow({
  command,
  suggestions,
  onUpdate,
  onDelete,
}: {
  command: ProjectCommand;
  suggestions: string[];
  onUpdate: (data: UpdateProjectCommand) => void;
  onDelete: () => void;
}) {
  const [localCommand, setLocalCommand] = useState(command.command);
  const [localConfirmMessage, setLocalConfirmMessage] = useState(
    command.confirmMessage ?? '',
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    inputRef.current?.blur();
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
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={inputRef}
            size="md"
            value={localCommand}
            onChange={(e) => handleCommandChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={handleCommandBlur}
            placeholder="Enter command (e.g., pnpm dev)"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconButton
          variant="ghost"
          size="md"
          onClick={onDelete}
          icon={<Trash2 />}
          tooltip="Delete command"
        />
      </div>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs text-neutral-400">
          Ports to check
        </label>
        <PortChipInput ports={command.ports} onChange={handlePortsChange} />
      </div>
      <div className="mt-3">
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
  );
}
