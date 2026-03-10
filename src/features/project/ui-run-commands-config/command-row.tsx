import { Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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

  const handleConfirmToggle = () => {
    onUpdate({ confirmBeforeRun: !command.confirmBeforeRun });
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
      <div className="flex items-start gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={localCommand}
            onChange={(e) => handleCommandChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={handleCommandBlur}
            placeholder="Enter command (e.g., pnpm dev)"
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-blue-500"
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
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-2 text-neutral-400 hover:bg-neutral-700 hover:text-red-400"
          title="Delete command"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs text-neutral-400">
          Ports to check
        </label>
        <PortChipInput ports={command.ports} onChange={handlePortsChange} />
      </div>
      <div className="mt-3">
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={command.confirmBeforeRun}
            onChange={handleConfirmToggle}
            className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
          />
          Confirm before running
        </label>
        {command.confirmBeforeRun && (
          <input
            type="text"
            value={localConfirmMessage}
            onChange={(e) => setLocalConfirmMessage(e.target.value)}
            onBlur={handleConfirmMessageBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Custom confirmation message (optional)"
            className="mt-2 w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-blue-500"
          />
        )}
      </div>
    </div>
  );
}
