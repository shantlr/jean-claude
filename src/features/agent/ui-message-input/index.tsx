import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus } from 'lucide-react';
import { useState, useRef, useCallback, KeyboardEvent } from 'react';

interface MessageInputProps {
  onSend: (message: string) => void;
  onQueue?: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  isRunning?: boolean;
  isStopping?: boolean;
}

const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

export function MessageInput({
  onSend,
  onQueue,
  onStop,
  disabled = false,
  placeholder = 'Type a message... (Shift+Enter for new line)',
  isRunning = false,
  isStopping = false,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastEscapeRef = useRef<number>(0);

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
    <div className="flex flex-1 items-end gap-2">
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
