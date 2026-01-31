import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus, Wand2 } from 'lucide-react';
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  KeyboardEvent,
} from 'react';

import type { Skill } from '../../../../shared/skill-types';

const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

const COMMANDS = [
  { command: '/init', description: 'Initialize CLAUDE.md in project' },
  { command: '/compact', description: 'Compact conversation history' },
];

type DropdownItem =
  | { type: 'command'; command: string; description: string }
  | { type: 'skill'; skill: Skill };

export function MessageInput({
  onSend,
  onQueue,
  onStop,
  disabled = false,
  placeholder = 'Type a message... (Shift+Enter for new line)',
  isRunning = false,
  isStopping = false,
  skills = [],
}: {
  onSend: (message: string) => void;
  onQueue?: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  isRunning?: boolean;
  isStopping?: boolean;
  skills?: Skill[];
}) {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastEscapeRef = useRef<number>(0);

  // Check if we should show the command dropdown
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const showCommandDropdown = value.startsWith('/') && !dropdownDismissed;
  const searchText = value.slice(1).toLowerCase();

  // Filter commands and skills based on what user typed after /
  const filteredItems = useMemo((): DropdownItem[] => {
    if (!showCommandDropdown) return [];

    const items: DropdownItem[] = [];

    // Filter built-in commands
    const filteredCommands = COMMANDS.filter((cmd) =>
      cmd.command.toLowerCase().slice(1).startsWith(searchText),
    );
    for (const cmd of filteredCommands) {
      items.push({ type: 'command', command: cmd.command, description: cmd.description });
    }

    // Filter skills
    const filteredSkills = skills.filter((skill) =>
      skill.name.toLowerCase().startsWith(searchText),
    );
    for (const skill of filteredSkills) {
      items.push({ type: 'skill', skill });
    }

    return items;
  }, [showCommandDropdown, searchText, skills]);

  // Reset selected index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  // Auto-scroll to selected item in dropdown
  useEffect(() => {
    if (!dropdownRef.current) return;
    const selectedElement = dropdownRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Track previous value to detect backspace
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (dropdownDismissed && value.startsWith('/')) {
      // Re-show dropdown when user deletes characters (backspace)
      if (value.length < prevValueRef.current.length) {
        setDropdownDismissed(false);
      }
      // Keep dismissed while adding characters after selection
    } else {
      setDropdownDismissed(false);
    }
    prevValueRef.current = value;
  }, [value, dropdownDismissed]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showCommandDropdown || filteredItems.length === 0) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDropdownDismissed(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCommandDropdown, filteredItems.length]);

  const selectItem = useCallback((item: DropdownItem) => {
    const command = item.type === 'command' ? item.command : `/${item.skill.name}`;
    setValue(command);
    setDropdownDismissed(true);
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (isRunning && onQueue) {
      // Queue the message if agent is running
      onQueue(trimmed);
    } else if (!disabled) {
      // Send normally if not running
      onSend(trimmed);
    }

    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, isRunning, onSend, onQueue]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle command dropdown navigation
    if (showCommandDropdown && filteredItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectItem(filteredItems[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }

    // Double-escape to stop agent
    if (e.key === 'Escape' && isRunning && onStop) {
      const now = Date.now();

      if (value) {
        // First: clear the input field
        setValue('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        lastEscapeRef.current = now;
      } else if (now - lastEscapeRef.current < DOUBLE_ESCAPE_THRESHOLD) {
        // Double-escape with empty input: interrupt task
        onStop();
        lastEscapeRef.current = 0;
      } else {
        // Single escape with empty input: track for potential double
        lastEscapeRef.current = now;
      }
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, capped at max height
      const maxHeight = 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  };

  // Separate commands and skills for grouped display
  const commandItems = filteredItems.filter((item) => item.type === 'command');
  const skillItems = filteredItems.filter((item) => item.type === 'skill');

  // Get the flat index for an item (used for selection highlighting)
  const getItemIndex = (type: 'command' | 'skill', localIndex: number) => {
    if (type === 'command') return localIndex;
    return commandItems.length + localIndex;
  };

  return (
    <div ref={containerRef} className="relative flex flex-1 items-end gap-2">
      {/* Command completion dropdown */}
      {showCommandDropdown && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-12 mb-1 max-h-80 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg"
        >
          {/* Commands section */}
          {commandItems.map((item, localIndex) => {
            if (item.type !== 'command') return null;
            const index = getItemIndex('command', localIndex);
            return (
              <button
                key={item.command}
                type="button"
                data-index={index}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={clsx(
                  'w-full px-3 py-1.5 text-left',
                  index === selectedIndex ? 'bg-neutral-700' : 'hover:bg-neutral-700',
                )}
              >
                <div className="text-xs font-medium text-neutral-200">
                  {item.command}
                </div>
                <div className="text-xs text-neutral-400">{item.description}</div>
              </button>
            );
          })}

          {/* Divider between commands and skills */}
          {commandItems.length > 0 && skillItems.length > 0 && (
            <div className="my-1 border-t border-neutral-700" />
          )}

          {/* Skills section header */}
          {skillItems.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-500">
              <Wand2 className="h-3 w-3" />
              Skills
            </div>
          )}

          {/* Skills */}
          {skillItems.map((item, localIndex) => {
            if (item.type !== 'skill') return null;
            const index = getItemIndex('skill', localIndex);
            const { skill } = item;
            return (
              <button
                key={skill.name}
                type="button"
                data-index={index}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={clsx(
                  'w-full px-3 py-1.5 text-left',
                  index === selectedIndex ? 'bg-neutral-700' : 'hover:bg-neutral-700',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-neutral-200">
                    /{skill.name}
                  </span>
                  {skill.source !== 'user' && (
                    <span className="rounded bg-neutral-700 px-1 py-0.5 text-xs text-neutral-400">
                      {skill.pluginName ?? skill.source}
                    </span>
                  )}
                </div>
                {skill.description && (
                  <div className="text-xs text-neutral-400 line-clamp-2">
                    {skill.description}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          isRunning
            ? 'Type to queue a follow-up... (Esc twice to stop)'
            : placeholder
        }
        disabled={disabled && !isRunning}
        rows={1}
        className="min-h-[40px] flex-1 resize-none rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {/* Send/Queue button */}
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || (disabled && !isRunning)}
        className={clsx(
          'flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-white disabled:cursor-not-allowed disabled:opacity-50',
          isRunning
            ? 'bg-amber-600 hover:bg-amber-500'
            : 'bg-blue-600 hover:bg-blue-500',
        )}
        title={isRunning ? 'Queue this message' : 'Send message'}
      >
        {isRunning ? (
          <>
            <ListPlus className="h-4 w-4" />
            <span className="text-sm font-medium">Queue</span>
          </>
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
      {isRunning && onStop && (
        <button
          onClick={onStop}
          disabled={isStopping}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
          title="Stop agent"
        >
          {isStopping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>
      )}
    </div>
  );
}
