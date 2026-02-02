import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus } from 'lucide-react';
import { useState, useRef, useCallback, KeyboardEvent } from 'react';

import {
  PromptTextarea,
  PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { formatKeyForDisplay } from '@/lib/keyboard-bindings';

import type { Skill } from '../../../../shared/skill-types';

const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

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
  const textareaRef = useRef<PromptTextareaRef>(null);
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
    textareaRef.current?.resetHeight();
  }, [value, disabled, isRunning, onSend, onQueue]);

  const handleEnterKey = useCallback(() => {
    handleSubmit();
    return true; // Prevent default
  }, [handleSubmit]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Double-escape to stop agent
    if (e.key === 'Escape' && isRunning && onStop) {
      const now = Date.now();

      if (value) {
        // First: clear the input field
        setValue('');
        textareaRef.current?.resetHeight();
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

  return (
    <div className="relative flex flex-1 items-end gap-2">
      <PromptTextarea
        ref={textareaRef}
        value={value}
        onChange={setValue}
        skills={skills}
        onEnterKey={handleEnterKey}
        onKeyDown={handleKeyDown}
        placeholder={
          isRunning
            ? 'Type to queue a follow-up... (Esc twice to stop)'
            : placeholder
        }
        disabled={disabled && !isRunning}
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
        aria-label={isRunning ? 'Queue this message' : 'Send message'}
        title={
          isRunning
            ? `Queue message (${formatKeyForDisplay('enter')})`
            : `Send message (${formatKeyForDisplay('enter')})`
        }
      >
        {isRunning ? (
          <>
            <ListPlus className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Queue</span>
          </>
        ) : (
          <Send className="h-5 w-5" aria-hidden />
        )}
      </button>
      {isRunning && onStop && (
        <button
          onClick={onStop}
          disabled={isStopping}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
          aria-label={isStopping ? 'Stopping agent' : 'Stop agent'}
          title={
            isStopping
              ? 'Stopping agent...'
              : `Stop agent (${formatKeyForDisplay('escape')} twice)`
          }
        >
          {isStopping ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Square className="h-5 w-5" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
