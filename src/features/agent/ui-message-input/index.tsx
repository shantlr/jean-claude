import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus } from 'lucide-react';
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  KeyboardEvent,
} from 'react';

const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

const COMMANDS = [
  { command: '/init', description: 'Initialize CLAUDE.md in project' },
  { command: '/compact', description: 'Compact conversation history' },
];

export function MessageInput({
  onSend,
  onQueue,
  onStop,
  disabled = false,
  placeholder = 'Type a message... (Shift+Enter for new line)',
  isRunning = false,
  isStopping = false,
}: {
  onSend: (message: string) => void;
  onQueue?: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  isRunning?: boolean;
  isStopping?: boolean;
}) {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEscapeRef = useRef<number>(0);

  // Check if we should show the command dropdown
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const showCommandDropdown = value.startsWith('/') && !dropdownDismissed;
  const searchText = value.slice(1).toLowerCase();

  // Filter commands based on what user typed after /
  const filteredCommands = useMemo(() => {
    if (!showCommandDropdown) return [];
    return COMMANDS.filter((cmd) =>
      cmd.command.toLowerCase().slice(1).startsWith(searchText),
    );
  }, [showCommandDropdown, searchText]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

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
    if (!showCommandDropdown || filteredCommands.length === 0) return;

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
  }, [showCommandDropdown, filteredCommands.length]);

  const selectCommand = useCallback((command: string) => {
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
    if (showCommandDropdown && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev,
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
        selectCommand(filteredCommands[selectedIndex].command);
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

  return (
    <div ref={containerRef} className="relative flex flex-1 items-end gap-2">
      {/* Command completion dropdown */}
      {showCommandDropdown && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg">
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.command}
              type="button"
              onClick={() => selectCommand(cmd.command)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={clsx(
                'w-full px-3 py-2 text-left',
                index === selectedIndex ? 'bg-neutral-700' : 'hover:bg-neutral-700',
              )}
            >
              <div className="text-sm font-medium text-neutral-200">
                {cmd.command}
              </div>
              <div className="text-xs text-neutral-400">{cmd.description}</div>
            </button>
          ))}
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
