import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus } from 'lucide-react';
import { useState, useRef, useCallback, KeyboardEvent } from 'react';

import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { Kbd } from '@/common/ui/kbd';
import {
  PromptTextarea,
  PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { useCompletionSetting } from '@/hooks/use-settings';
import type { PromptPart, PromptImagePart } from '@shared/agent-backend-types';
import type { Skill } from '@shared/skill-types';

const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

export function MessageInput({
  onSend,
  onQueue,
  onStop,
  disabled = false,
  placeholder = 'Type a message... (Cmd+Enter to send)',
  isRunning = false,
  isStopping = false,
  skills = [],
  projectRoot = null,
  value: externalValue,
  onValueChange,
  supportsImages = true,
  projectId,
  getCompletionContextBeforePrompt,
}: {
  onSend: (parts: PromptPart[]) => void;
  onQueue?: (parts: PromptPart[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  isRunning?: boolean;
  isStopping?: boolean;
  skills?: Skill[];
  projectRoot?: string | null;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Whether the current backend supports image attachments (default: true) */
  supportsImages?: boolean;
  /** Project ID for FIM completion context */
  projectId?: string;
  /** Returns recent context to prepend before prompt completion when needed */
  getCompletionContextBeforePrompt?: () => string;
}) {
  const { data: completionSetting } = useCompletionSetting();
  const [internalValue, setInternalValue] = useState('');
  const isControlled = externalValue !== undefined;
  const value = isControlled ? externalValue : internalValue;
  const setValue = useCallback(
    (newValue: string) => {
      if (!isControlled) setInternalValue(newValue);
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange],
  );
  const textareaRef = useRef<PromptTextareaRef>(null);
  const lastEscapeRef = useRef<number>(0);

  const [images, setImages] = useState<PromptImagePart[]>([]);

  const handleImageAttach = useCallback((image: PromptImagePart) => {
    setImages((prev) => [...prev, image]);
  }, []);

  const handleImageRemove = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;

    const parts: PromptPart[] = [];
    if (trimmed) parts.push({ type: 'text', text: trimmed });
    parts.push(...images);

    if (isRunning && onQueue) {
      // Queue the message if agent is running
      onQueue(parts);
    } else if (!disabled) {
      // Send normally if not running
      onSend(parts);
    }

    setValue('');
    setImages([]);
    // Reset textarea height
    textareaRef.current?.resetHeight();
  }, [value, images, disabled, isRunning, onSend, onQueue, setValue]);

  const handleEnterKey = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!event.metaKey && !event.ctrlKey) {
        return false;
      }

      handleSubmit();
      return true; // Prevent default
    },
    [handleSubmit],
  );

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
        enableCompletion={completionSetting?.enabled ?? false}
        projectId={projectId}
        getCompletionContextBeforePrompt={getCompletionContextBeforePrompt}
        projectRoot={projectRoot}
        enableFilePathAutocomplete
        images={supportsImages ? images : undefined}
        onImageAttach={supportsImages ? handleImageAttach : undefined}
        onImageRemove={supportsImages ? handleImageRemove : undefined}
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
        disabled={
          (!value.trim() && images.length === 0) || (disabled && !isRunning)
        }
        className={clsx(
          'flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-white disabled:cursor-not-allowed disabled:opacity-50',
          isRunning
            ? 'bg-amber-600 hover:bg-amber-500'
            : 'bg-blue-600 hover:bg-blue-500',
        )}
        aria-label={isRunning ? 'Queue this message' : 'Send message'}
        title={
          isRunning
            ? `Queue message (${formatKeyForDisplay('cmd+enter')})`
            : `Send message (${formatKeyForDisplay('cmd+enter')})`
        }
      >
        {isRunning ? (
          <>
            <ListPlus className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Queue</span>
            <Kbd
              shortcut="cmd+enter"
              className="border-white/25 bg-white/10 text-white/90"
            />
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden />
            <span className="text-sm font-medium">Send</span>
            <Kbd
              shortcut="cmd+enter"
              className="border-white/25 bg-white/10 text-white/90"
            />
          </>
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
