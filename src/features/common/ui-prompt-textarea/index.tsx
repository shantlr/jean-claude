import clsx from 'clsx';
import { File, Loader2, Wand2 } from 'lucide-react';
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
  /** Project root for @file path suggestions */
  projectRoot?: string | null;
  /** Enable @file path suggestions */
  enableFilePathAutocomplete?: boolean;
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
    projectRoot = null,
    enableFilePathAutocomplete = false,
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
    cursorPosition,
    enabled: enableCompletion && !showDropdown,
  });

  // Filter slash commands/skills or @file path suggestions
  const filteredItems = useMemo((): DropdownItem[] => {
    if (showMentionDropdown) {
      return fileSuggestions.map((filePath) => ({ type: 'file', filePath }));
    }

    if (!showSlashDropdown) return [];

    const items: DropdownItem[] = [];

    // Filter built-in commands
    if (showCommands) {
      const filteredCommands = COMMANDS.filter((cmd) =>
        cmd.command.toLowerCase().slice(1).startsWith(searchText),
      );
      for (const cmd of filteredCommands) {
        items.push({
          type: 'command',
          command: cmd.command,
          description: cmd.description,
        });
      }
    }

    // Filter skills
    const filteredSkills = skills.filter((skill) =>
      skill.name.toLowerCase().startsWith(searchText),
    );
    for (const skill of filteredSkills) {
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
          const before = value.slice(0, cursorPosition);
          const after = value.slice(cursorPosition);
          const newValue = before + completionText + after;
          onChange(newValue);
          // Move cursor to end of inserted completion
          const newCursorPos = cursorPosition + completionText.length;
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

    // Handle Enter key for submit
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // Separate item types for grouped display
  const fileItems = filteredItems.filter((item) => item.type === 'file');
  const commandItems = filteredItems.filter((item) => item.type === 'command');
  const skillItems = filteredItems.filter((item) => item.type === 'skill');

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
    <div ref={containerRef} className="relative flex flex-1 items-end">
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
              'fixed z-50 max-h-80 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg',
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
                      ? 'bg-neutral-700'
                      : 'hover:bg-neutral-700',
                  )}
                >
                  <File className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span className="truncate text-xs text-neutral-200">
                    {item.filePath}
                  </span>
                </button>
              );
            })}

            {showMentionDropdown &&
              isLoadingFilePaths &&
              fileItems.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400">
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
                      ? 'bg-neutral-700'
                      : 'hover:bg-neutral-700',
                  )}
                >
                  <div className="text-xs font-medium text-neutral-200">
                    {item.command}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {item.description}
                  </div>
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
                      ? 'bg-neutral-700'
                      : 'hover:bg-neutral-700',
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
                    <div className="line-clamp-2 text-xs text-neutral-400">
                      {skill.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        rows={1}
        autoComplete="off"
        className={clsx(
          'min-h-[40px] w-full resize-none rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm leading-[20px] text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...textareaProps}
      />
      {/* Ghost text overlay — matches textarea border+padding so text aligns */}
      {completion && (
        <div
          ref={ghostRef}
          className="pointer-events-none absolute inset-0 overflow-hidden border border-transparent px-3 py-2 text-sm leading-[20px] break-words whitespace-pre-wrap"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          <span className="invisible">{value.slice(0, cursorPosition)}</span>
          <span className="text-neutral-500">{completion}</span>
        </div>
      )}
      {/* Completion loading indicator */}
      {isCompletionLoading && !completion && (
        <div className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />
        </div>
      )}
    </div>
  );
});
