import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react';
import { ListPlus, Loader2, Send, Square } from 'lucide-react';
import clsx from 'clsx';



import type {
  PromptFilePart,
  PromptImagePart,
  PromptPart,
} from '@shared/agent-backend-types';
import {
  PromptTextarea,
  PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { buildAttachedFilesXml } from '@/lib/file-attachment-utils';
import { Button } from '@/common/ui/button';
import type { ComponentSize } from '@/common/ui/styles';
import { expandFeatureReferencesInPrompt } from '@/lib/prompt-feature-context';
import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { IconButton } from '@/common/ui/icon-button';
import { Kbd } from '@/common/ui/kbd';
import type { PromptSnippet } from '@shared/types';
import { resolveMessageInputText } from '@/lib/resolve-message-input-text';
import type { Skill } from '@shared/skill-types';
import type { SnippetVariableContext } from '@/lib/resolve-snippet-template';
import { useCompletionSetting } from '@/hooks/use-settings';
import { useProjectFeatureMap } from '@/hooks/use-projects';



const DOUBLE_ESCAPE_THRESHOLD = 300; // ms

export function MessageInput({
  onSend,
  onQueue,
  onStop,
  disabled = false,
  forceDisabled = false,
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
  promptSnippets,
  snippetVariableContext,
  allowEmptySubmit = false,
  toolbarLeading,
  controlsAboveButtons,
  controlsBeforeButtons,
  buttonSize = 'lg',
  fillAvailableHeight = false,
  textareaClassName,
  isCompact = false,
}: {
  onSend: (parts: PromptPart[]) => void;
  onQueue?: (parts: PromptPart[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  /** Disables input even while running, bypassing queue mode. */
  forceDisabled?: boolean;
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
  /** Prompt snippets from settings */
  promptSnippets?: PromptSnippet[];
  /** Context for resolving snippet variables */
  snippetVariableContext?: SnippetVariableContext;
  /** When true, allow submitting even with empty text (e.g. when review pills are attached) */
  allowEmptySubmit?: boolean;
  /** Content rendered at the left of the bottom toolbar row (compact stacked layout only) */
  toolbarLeading?: ReactNode;
  /** Content stacked above send/stop controls in the default horizontal layout */
  controlsAboveButtons?: ReactNode;
  /** Content rendered immediately before send/stop controls. */
  controlsBeforeButtons?: ReactNode;
  /** Size for send/stop controls. Defaults to legacy large buttons. */
  buttonSize?: ComponentSize;
  /** Stretch the textarea to match available input row height. */
  fillAvailableHeight?: boolean;
  /** Optional textarea class override. */
  textareaClassName?: string;
  /** When true, use stacked layout: textarea on top, toolbar below. When false, horizontal layout. */
  isCompact?: boolean;
}) {
  const { data: completionSetting } = useCompletionSetting();
  const { data: featureMap = null } = useProjectFeatureMap(projectId ?? null);
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

  const [attachedFiles, setAttachedFiles] = useState<PromptFilePart[]>([]);

  const handleFileAttach = useCallback((file: PromptFilePart) => {
    setAttachedFiles((prev) => [...prev, file]);
  }, []);

  const handleFileRemove = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    if (forceDisabled) return;

    const trimmed = expandFeatureReferencesInPrompt({
      text: resolveMessageInputText(value, snippetVariableContext),
      featureMap,
    });
    if (
      !trimmed &&
      images.length === 0 &&
      attachedFiles.length === 0 &&
      !allowEmptySubmit
    )
      return;

    const parts: PromptPart[] = [];
    if (trimmed) parts.push({ type: 'text', text: trimmed });
    parts.push(...images);

    // Append file attachment references to prompt text
    const fileBlock = buildAttachedFilesXml(attachedFiles);
    if (fileBlock) {
      const textPartIndex = parts.findIndex((p) => p.type === 'text');
      if (textPartIndex >= 0) {
        (parts[textPartIndex] as { type: 'text'; text: string }).text +=
          fileBlock;
      } else {
        parts.unshift({ type: 'text', text: fileBlock });
      }
    }

    if (isRunning && onQueue) {
      // Queue the message if agent is running
      onQueue(parts);
    } else if (!disabled) {
      // Send normally if not running
      onSend(parts);
    }

    setValue('');
    setImages([]);
    setAttachedFiles([]);
    // Reset textarea height
    textareaRef.current?.resetHeight();
  }, [
    value,
    images,
    attachedFiles,
    disabled,
    forceDisabled,
    isRunning,
    onSend,
    onQueue,
    setValue,
    allowEmptySubmit,
    snippetVariableContext,
    featureMap,
  ]);

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

  const isSubmitDisabled =
    forceDisabled ||
    (!value.trim() &&
      images.length === 0 &&
      attachedFiles.length === 0 &&
      !allowEmptySubmit) ||
    (disabled && !isRunning);

  const sendButton = (
    <Button
      onClick={handleSubmit}
      disabled={isSubmitDisabled}
      size={buttonSize}
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
  );

  const stopButton = isRunning && onStop && (
    <IconButton
      onClick={onStop}
      disabled={isStopping}
      size={buttonSize}
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
  );

  const textarea = (
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
      featureMap={featureMap}
      images={supportsImages ? images : undefined}
      onImageAttach={supportsImages ? handleImageAttach : undefined}
      onImageRemove={supportsImages ? handleImageRemove : undefined}
      files={attachedFiles}
      onFileAttach={handleFileAttach}
      onFileRemove={handleFileRemove}
      promptSnippets={promptSnippets}
      snippetVariableContext={snippetVariableContext}
      placeholder={
        isRunning
          ? 'Type to queue a follow-up... (Esc twice to stop)'
          : placeholder
      }
      disabled={forceDisabled || (disabled && !isRunning)}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      fillAvailableHeight={fillAvailableHeight}
      className={textareaClassName}
    />
  );

  if (isCompact) {
    // Stacked layout: textarea full-width on top, toolbar row below
    return (
      <div className="flex flex-1 flex-col gap-2">
        {textarea}
        <div className="flex items-center gap-2">
          {toolbarLeading}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {controlsBeforeButtons}
            {sendButton}
            {stopButton}
          </div>
        </div>
      </div>
    );
  }

  // Default horizontal layout: selectors + textarea + buttons in one row
  return (
    <div className="relative flex flex-1 items-stretch gap-2">
      {textarea}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {controlsAboveButtons}
        <div className="flex items-center gap-2">
          {controlsBeforeButtons}
          {sendButton}
          {stopButton}
        </div>
      </div>
    </div>
  );
}
