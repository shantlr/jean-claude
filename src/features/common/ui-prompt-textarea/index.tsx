import clsx from 'clsx';
import Fuse from 'fuse.js';
import {
  ChevronLeft,
  ChevronRight,
  File,
  ImageIcon,
  Loader2,
  Wand2,
  X,
} from 'lucide-react';
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type {
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  SyntheticEvent,
  TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useInlineCompletion } from '@/hooks/use-inline-completion';
import {
  getFilePathSuggestions,
  useProjectFilePaths,
} from '@/hooks/use-project-file-paths';
import { compressImage } from '@/lib/image-compression';
import { useToastStore } from '@/stores/toasts';
import type { PromptImagePart } from '@shared/agent-backend-types';
import type { Skill } from '@shared/skill-types';

const COMMANDS = [
  { command: '/init', description: 'Initialize CLAUDE.md in project' },
  { command: '/compact', description: 'Compact conversation history' },
];

const FILE_SUGGESTION_LIMIT = 8;

function getActiveMentionToken({
  text,
  cursorPosition,
}: {
  text: string;
  cursorPosition: number;
}): MentionToken | null {
  if (cursorPosition < 0 || cursorPosition > text.length) return null;

  const beforeCursor = text.slice(0, cursorPosition);
  const mentionStart = beforeCursor.lastIndexOf('@');
  if (mentionStart < 0) return null;

  const characterBeforeMention =
    mentionStart > 0 ? text[mentionStart - 1] : undefined;
  if (characterBeforeMention && !/\s|[([{'"`]/.test(characterBeforeMention)) {
    return null;
  }

  let mentionEnd = text.length;
  for (let index = mentionStart + 1; index < text.length; index++) {
    if (/\s/.test(text[index])) {
      mentionEnd = index;
      break;
    }
  }

  if (cursorPosition < mentionStart + 1 || cursorPosition > mentionEnd) {
    return null;
  }

  const query = text.slice(mentionStart + 1, cursorPosition);
  if (/[@\s]/.test(query)) return null;

  return {
    start: mentionStart,
    end: mentionEnd,
    query,
  };
}

type DropdownItem =
  | { type: 'command'; command: string; description: string }
  | { type: 'skill'; skill: Skill }
  | { type: 'file'; filePath: string };

type MentionToken = {
  start: number;
  end: number;
  query: string;
};

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];

async function processImageFile(
  file: File,
  onAttach: (image: PromptImagePart) => void,
  onError?: (message: string) => void,
): Promise<void> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    onError?.(`Unsupported image type: ${file.type}`);
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    onError?.(
      `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
    );
    return;
  }
  const { agent, storage } = await compressImage(file);
  onAttach({
    type: 'image',
    data: agent.data,
    mimeType: agent.mimeType,
    filename: file.name,
    storageData: storage.data,
    storageMimeType: storage.mimeType,
  });
}

export interface PromptTextareaRef {
  focus: () => void;
  blur: () => void;
  resetHeight: () => void;
}

export interface PromptTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (value: string) => void;
  skills?: Skill[];
  maxHeight?: number;
  /** Custom handler for Enter key (without shift). Return true to prevent default behavior. */
  onEnterKey?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  /** Whether to show commands in the dropdown (default: true) */
  showCommands?: boolean;
  /** Enable inline ghost text completion */
  enableCompletion?: boolean;
  /** Project ID for FIM completion context */
  projectId?: string;
  /** Returns recent context to prepend before the prompt when needed */
  getCompletionContextBeforePrompt?: () => string;
  /** Project root for @file path suggestions */
  projectRoot?: string | null;
  /** Enable @file path suggestions */
  enableFilePathAutocomplete?: boolean;
  /** Attached images */
  images?: PromptImagePart[];
  /** Called when user attaches an image (paste, drop, or file picker) */
  onImageAttach?: (image: PromptImagePart) => void;
  /** Called when user removes an attached image */
  onImageRemove?: (index: number) => void;
}

export const PromptTextarea = forwardRef<
  PromptTextareaRef,
  PromptTextareaProps
>(function PromptTextarea(
  {
    value,
    onChange,
    skills = [],
    maxHeight = 200,
    onEnterKey,
    showCommands = true,
    enableCompletion = false,
    projectId,
    getCompletionContextBeforePrompt,
    projectRoot = null,
    enableFilePathAutocomplete = false,
    images,
    onImageAttach,
    onImageRemove,
    className,
    onKeyDown: externalOnKeyDown,
    ...textareaProps
  },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
    resetHeight: () => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
  }));

  const activeMentionToken = useMemo(
    () =>
      enableFilePathAutocomplete
        ? getActiveMentionToken({ text: value, cursorPosition })
        : null,
    [enableFilePathAutocomplete, value, cursorPosition],
  );

  const showMentionDropdown = !!activeMentionToken && !dropdownDismissed;
  const showSlashDropdown =
    value.startsWith('/') && !showMentionDropdown && !dropdownDismissed;
  const showDropdown = showMentionDropdown || showSlashDropdown;
  const dropdownPosition = useDropdownPosition({
    isOpen: showDropdown,
    triggerRef: containerRef,
    side: 'top',
    align: 'left',
  });
  const searchText = value.slice(1).toLowerCase();

  const { filePaths, isLoading: isLoadingFilePaths } = useProjectFilePaths({
    projectRoot,
    enabled:
      enableFilePathAutocomplete && !!projectRoot && !!activeMentionToken,
  });

  const fileSuggestions = useMemo(() => {
    if (!showMentionDropdown || !activeMentionToken) return [];

    return getFilePathSuggestions({
      filePaths,
      query: activeMentionToken.query,
      limit: FILE_SUGGESTION_LIMIT,
    });
  }, [showMentionDropdown, activeMentionToken, filePaths]);

  // Inline completion hook — paused when slash dropdown is open
  const {
    completion,
    isLoading: isCompletionLoading,
    accept,
    dismiss,
  } = useInlineCompletion({
    text: value,
    enabled: enableCompletion && !showDropdown,
    projectId,
    getContextBeforePrompt: getCompletionContextBeforePrompt,
  });

  // Filter slash commands/skills or @file path suggestions
  const filteredItems = useMemo((): DropdownItem[] => {
    if (showMentionDropdown) {
      return fileSuggestions.map((filePath) => ({ type: 'file', filePath }));
    }

    if (!showSlashDropdown) return [];

    const items: DropdownItem[] = [];

    // Fuzzy filter built-in commands
    if (showCommands) {
      const matchedCommands = searchText
        ? new Fuse(COMMANDS, {
            keys: ['command'],
            threshold: 0.4,
            ignoreLocation: true,
          })
            .search(searchText)
            .map((r) => r.item)
        : COMMANDS;
      for (const cmd of matchedCommands) {
        items.push({
          type: 'command',
          command: cmd.command,
          description: cmd.description,
        });
      }
    }

    // Fuzzy filter skills
    const matchedSkills = searchText
      ? new Fuse(skills, {
          keys: ['name'],
          threshold: 0.4,
          ignoreLocation: true,
        })
          .search(searchText)
          .map((r) => r.item)
      : skills;
    for (const skill of matchedSkills) {
      items.push({ type: 'skill', skill });
    }

    return items;
  }, [
    showMentionDropdown,
    showSlashDropdown,
    fileSuggestions,
    searchText,
    skills,
    showCommands,
  ]);

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
    const hasDropdownTrigger = !!activeMentionToken || value.startsWith('/');

    if (dropdownDismissed && hasDropdownTrigger) {
      // Re-show dropdown when user deletes characters (backspace)
      if (value.length < prevValueRef.current.length) {
        setDropdownDismissed(false);
      }
      // Keep dismissed while adding characters after selection
    } else {
      setDropdownDismissed(false);
    }
    prevValueRef.current = value;
  }, [value, dropdownDismissed, activeMentionToken]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideContainer = !!containerRef.current?.contains(target);
      const clickedInsideDropdown = !!dropdownRef.current?.contains(target);
      if (!clickedInsideContainer && !clickedInsideDropdown) {
        setDropdownDismissed(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const selectItem = useCallback(
    (item: DropdownItem) => {
      if (item.type === 'file') {
        if (!activeMentionToken) return;

        const mentionValue = `@${item.filePath}`;
        const before = value.slice(0, activeMentionToken.start);
        const after = value.slice(activeMentionToken.end);
        const needsSpace = after.length === 0 || !/^\s/.test(after);
        const insertion = needsSpace ? `${mentionValue} ` : mentionValue;
        const nextValue = `${before}${insertion}${after}`;
        onChange(nextValue);

        const nextCursorPosition = before.length + insertion.length;
        setCursorPosition(nextCursorPosition);
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.selectionStart = nextCursorPosition;
          textareaRef.current.selectionEnd = nextCursorPosition;
        });
      } else {
        const command =
          item.type === 'command' ? item.command : `/${item.skill.name}`;
        onChange(command);
      }

      setDropdownDismissed(true);
      textareaRef.current?.focus();
    },
    [activeMentionToken, onChange, value],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle completion keyboard shortcuts
    if (completion) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const completionText = accept();
        if (completionText) {
          // Always append completion at the end of text
          const newValue = value + completionText;
          onChange(newValue);
          // Move cursor to end of text
          const newCursorPos = newValue.length;
          setCursorPosition(newCursorPos);
          // Set cursor position in textarea after React re-renders
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newCursorPos;
              textareaRef.current.selectionEnd = newCursorPos;
            }
          });
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      // Any other key: dismiss current completion (debounce will re-trigger)
      dismiss();
    }

    // Handle dropdown navigation
    if (showDropdown && filteredItems.length > 0) {
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
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
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

    // Option+Enter inserts a newline (same as Shift+Enter)
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.slice(0, start) + '\n' + value.slice(end);
        onChange(newValue);
        const newCursorPos = start + 1;
        setCursorPosition(newCursorPos);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursorPos;
            textareaRef.current.selectionEnd = newCursorPos;
          }
          adjustHeight();
        });
      }
      return;
    }

    // Handle Enter key for submit
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      const handled = onEnterKey?.(e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    // Call external keydown handler
    externalOnKeyDown?.(e);
  };

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Use the greater of textarea content height and ghost overlay height
    // so multiline completions expand the textarea
    const ghostHeight = ghostRef.current?.scrollHeight ?? 0;
    const neededHeight = Math.max(textarea.scrollHeight, ghostHeight);
    textarea.style.height = `${Math.min(neededHeight, maxHeight)}px`;
  }, [maxHeight]);

  // Re-adjust height when completion appears/disappears (multiline ghost text)
  // useLayoutEffect avoids a visual flash where the textarea is too short before expanding
  useLayoutEffect(() => {
    adjustHeight();
  }, [completion, adjustHeight]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart);
    adjustHeight();
  };

  const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition(e.currentTarget.selectionStart);
  };

  // --- Image attachment handlers ---
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const showImageError = useCallback(
    (message: string) => addToast({ message, type: 'error' }),
    [addToast],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onImageAttach) return;

      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));

      if (imageItems.length > 0) {
        const currentCount = images?.length ?? 0;
        const allowed = MAX_IMAGES - currentCount;
        if (allowed <= 0) return;

        e.preventDefault();
        for (const item of imageItems.slice(0, allowed)) {
          const file = item.getAsFile();
          if (file) {
            void processImageFile(file, onImageAttach, showImageError).catch(
              (err) => {
                showImageError('Failed to process image');
                console.error('Failed to process pasted image:', err);
              },
            );
          }
        }
      }
      // If no images, default text paste proceeds
    },
    [onImageAttach, images, showImageError],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onImageAttach) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    [onImageAttach],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear drag state when actually leaving the container,
    // not when entering a child element (e.g. the textarea).
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!onImageAttach) return;

      const currentCount = images?.length ?? 0;
      const allowed = MAX_IMAGES - currentCount;
      if (allowed <= 0) return;

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, onImageAttach, showImageError).catch(
          (err) => {
            showImageError('Failed to process image');
            console.error('Failed to process dropped image:', err);
          },
        );
      }
    },
    [onImageAttach, images, showImageError],
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!onImageAttach || !e.target.files) return;

      const currentCount = images?.length ?? 0;
      const allowed = MAX_IMAGES - currentCount;
      if (allowed <= 0) return;

      const files = Array.from(e.target.files);
      for (const file of files.slice(0, allowed)) {
        void processImageFile(file, onImageAttach, showImageError).catch(
          (err) => {
            showImageError('Failed to process image');
            console.error('Failed to process selected image:', err);
          },
        );
      }
      // Reset input so the same file can be selected again
      e.target.value = '';
    },
    [onImageAttach, images, showImageError],
  );

  // Prevent the textarea's native file-drop behavior (inserting filename as text).
  // The actual drop handling is on the parent container.
  const handleTextareaDragOver = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (!onImageAttach) return;
      const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
      if (hasFiles) {
        e.preventDefault();
      }
    },
    [onImageAttach],
  );

  // Separate item types for grouped display
  const fileItems = filteredItems.filter((item) => item.type === 'file');
  const commandItems = filteredItems.filter((item) => item.type === 'command');
  const skillItems = filteredItems.filter((item) => item.type === 'skill');
  const needsTrailingPadding = !!onImageAttach;

  // Get the flat index for an item (used for selection highlighting)
  const getItemIndex = (
    type: 'file' | 'command' | 'skill',
    localIndex: number,
  ) => {
    if (type === 'file') return localIndex;
    if (type === 'command') return fileItems.length + localIndex;
    return fileItems.length + commandItems.length + localIndex;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Autocompletion dropdown */}
      {showDropdown &&
        dropdownPosition &&
        ((showMentionDropdown &&
          (filteredItems.length > 0 || isLoadingFilePaths)) ||
          (!showMentionDropdown && filteredItems.length > 0)) &&
        createPortal(
          <div
            ref={dropdownRef}
            className={clsx(
              'border-glass-border bg-bg-1 fixed z-50 max-h-80 overflow-y-auto rounded-md border py-1 shadow-lg',
            )}
            style={{
              top:
                dropdownPosition.actualSide === 'bottom'
                  ? dropdownPosition.top
                  : undefined,
              bottom:
                dropdownPosition.actualSide === 'top'
                  ? window.innerHeight - dropdownPosition.top
                  : undefined,
              left: dropdownPosition.left,
              width: containerRef.current?.getBoundingClientRect().width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            {/* File paths */}
            {fileItems.map((item, localIndex) => {
              if (item.type !== 'file') return null;
              const index = getItemIndex('file', localIndex);

              return (
                <button
                  key={item.filePath}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <File className="text-ink-2 h-3.5 w-3.5 shrink-0" />
                  <span className="text-ink-1 truncate text-xs">
                    {item.filePath}
                  </span>
                </button>
              );
            })}

            {showMentionDropdown &&
              isLoadingFilePaths &&
              fileItems.length === 0 && (
                <div className="text-ink-2 flex items-center gap-2 px-3 py-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading files...
                </div>
              )}

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
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="text-ink-1 text-xs font-medium">
                    {item.command}
                  </div>
                  <div className="text-ink-2 text-xs">{item.description}</div>
                </button>
              );
            })}

            {/* Divider between commands and skills */}
            {commandItems.length > 0 && skillItems.length > 0 && (
              <div className="border-glass-border my-1 border-t" />
            )}

            {/* Skills section header */}
            {skillItems.length > 0 && (
              <div className="text-ink-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
                <Wand2 className="h-3 w-3" aria-hidden />
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
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ink-1 text-xs font-medium">
                      /{skill.name}
                    </span>
                    {skill.source !== 'user' && (
                      <span className="bg-glass-medium text-ink-2 rounded px-1 py-0.5 text-xs">
                        {skill.pluginName ?? skill.source}
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <div className="text-ink-2 line-clamp-2 text-xs">
                      {skill.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      {/* Textarea wrapper — relative for ghost overlay + absolute elements */}
      <div className="relative flex items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onPaste={handlePaste}
          onDragOver={handleTextareaDragOver}
          rows={1}
          autoComplete="off"
          className={clsx(
            // Structural classes (always applied)
            'text-ink-1 placeholder-ink-3 min-h-[40px] w-full resize-none text-sm leading-[20px] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            // Chrome classes (border, bg, padding, rounding) — replaced when className is provided
            className ??
              'border-glass-border bg-glass-light focus:border-glass-border-strong focus:ring-acc/10 rounded-lg border px-3 py-2 focus:ring-1',
            needsTrailingPadding && 'pr-11',
            isDragOver && 'border-acc bg-acc-soft',
          )}
          {...textareaProps}
        />
        {/* Ghost text overlay — matches textarea border+padding so text aligns */}
        {completion && (
          <div
            ref={ghostRef}
            className={clsx(
              'pointer-events-none absolute inset-0 overflow-hidden text-sm leading-[20px] break-words whitespace-pre-wrap',
              className ? className : 'border border-transparent px-3 py-2',
              needsTrailingPadding && 'pr-11',
            )}
            style={{ maxHeight: `${maxHeight}px` }}
          >
            <span className="invisible">{value}</span>
            <span className="text-ink-3">{completion}</span>
          </div>
        )}
        {/* Completion loader + file picker button */}
        {(onImageAttach || (isCompletionLoading && !completion)) && (
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {isCompletionLoading && !completion && (
              <div className="pointer-events-none">
                <Loader2 className="text-ink-3 h-3.5 w-3.5 animate-spin" />
              </div>
            )}
            {onImageAttach && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Attach image"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Drag overlay */}
        {isDragOver && (
          <div className="border-acc bg-acc-soft absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed">
            <span className="text-acc-ink text-sm">Drop image here</span>
          </div>
        )}
      </div>

      {/* Image previews — below the textarea in normal flow */}
      {images && images.length > 0 && (
        <ImageThumbnails images={images} onImageRemove={onImageRemove} />
      )}
    </div>
  );
});

function ImageThumbnails({
  images,
  onImageRemove,
}: {
  images: PromptImagePart[];
  onImageRemove?: (index: number) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((img, index) => (
          <div
            key={`${img.filename ?? 'img'}-${index}`}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => setPreviewIndex(index)}
              className="border-glass-border hover:border-glass-border-strong block cursor-pointer overflow-hidden rounded border"
            >
              <img
                src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                alt={img.filename || 'Attached image'}
                className="h-16 w-16 object-cover"
              />
            </button>
            <button
              type="button"
              onClick={() => onImageRemove?.(index)}
              className="bg-glass-medium text-ink-1 hover:bg-status-fail absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full text-xs group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {previewIndex !== null && (
        <ImagePreviewDialog
          images={images}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
}

function ImagePreviewDialog({
  images,
  initialIndex,
  onClose,
}: {
  images: PromptImagePart[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const img = images[currentIndex];

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((i) => Math.min(images.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [images.length]);

  if (!img) return null;

  return createPortal(
    <div
      className="bg-bg-0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute top-4 right-4 rounded-full p-2"
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((i) => i - 1);
          }}
          className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute left-4 rounded-full p-2"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <img
        src={`data:${img.mimeType};base64,${img.data}`}
        alt={img.filename || 'Image preview'}
        className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && currentIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((i) => i + 1);
          }}
          className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute right-4 rounded-full p-2"
          aria-label="Next image"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {images.length > 1 && (
        <div className="text-ink-2 absolute bottom-4 text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body,
  );
}
