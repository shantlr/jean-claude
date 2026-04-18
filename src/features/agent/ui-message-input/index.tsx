import clsx from 'clsx';
import { Send, Square, Loader2, ListPlus } from 'lucide-react';
import { useState, useRef, useCallback, KeyboardEvent } from 'react';

import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
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
  onFocusChange,
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
  /** Callback when textarea focus state changes */
  onFocusChange?: (focused: boolean) => void;
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
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
      />
      {/* Send/Queue button */}
      <Button
        onClick={handleSubmit}
        disabled={
          (!value.trim() && images.length === 0) || (disabled && !isRunning)
        }
        size="lg"
        variant="primary"
        icon={isRunning ? <ListPlus /> : <Send />}
        className={clsx(
          'shrink-0 transition-all duration-200',
          isRunning
            ? 'bg-status-run shadow-status-run/25 hover:shadow-status-run/40 shadow-md hover:shadow-lg hover:brightness-110'
            : 'bg-acc shadow-acc/25 hover:shadow-acc/40 shadow-md hover:scale-105 hover:shadow-lg hover:brightness-110',
        )}
        aria-label={isRunning ? 'Queue this message' : 'Send message'}
        title={
          isRunning
            ? `Queue message (${formatKeyForDisplay('cmd+enter')})`
            : `Send message (${formatKeyForDisplay('cmd+enter')})`
        }
      >
        {isRunning ? 'Queue' : 'Send'}
        <Kbd
          shortcut="cmd+enter"
          className="border-glass-border bg-glass-light text-ink-0"
        />
      </Button>
      {isRunning && onStop && (
        <IconButton
          onClick={onStop}
          disabled={isStopping}
          size="lg"
          variant="danger"
          icon={isStopping ? <Loader2 className="animate-spin" /> : <Square />}
          className="bg-status-fail text-bg-0 shadow-status-fail/25 hover:shadow-status-fail/40 shrink-0 shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg hover:brightness-110"
          aria-label={isStopping ? 'Stopping agent' : 'Stop agent'}
          tooltip={
            isStopping
              ? 'Stopping agent...'
              : `Stop agent (${formatKeyForDisplay('escape')} twice)`
          }
        />
      )}
    </div>
  );
}
