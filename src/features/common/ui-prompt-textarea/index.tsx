import clsx from 'clsx';
import { Loader2, Wand2 } from 'lucide-react';
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

import { useInlineCompletion } from '@/hooks/use-inline-completion';
import type { Skill } from '@shared/skill-types';

const COMMANDS = [
  { command: '/init', description: 'Initialize CLAUDE.md in project' },
  { command: '/compact', description: 'Compact conversation history' },
];

type DropdownItem =
  | { type: 'command'; command: string; description: string }
  | { type: 'skill'; skill: Skill };

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
  /** Custom handler for Enter key (without shift). Return true to prevent default submit behavior. */
  onEnterKey?: () => boolean | void;
  /** Whether to show commands in the dropdown (default: true) */
  showCommands?: boolean;
  /** Enable inline ghost text completion */
  enableCompletion?: boolean;
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
    className,
    onKeyDown: externalOnKeyDown,
    ...textareaProps
  },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>(
    'top',
  );
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

  // Check if we should show the dropdown
  const showDropdown = value.startsWith('/') && !dropdownDismissed;
  const searchText = value.slice(1).toLowerCase();

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

  // Determine dropdown position based on available space
  useEffect(() => {
    if (!showDropdown || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const spaceAbove = rect.top;
    const dropdownMaxHeight = 320; // max-h-80 = 20rem = 320px

    // If not enough space above, show below
    setDropdownPosition(spaceAbove < dropdownMaxHeight ? 'bottom' : 'top');
  }, [showDropdown]);

  // Filter commands and skills based on what user typed after /
  const filteredItems = useMemo((): DropdownItem[] => {
    if (!showDropdown) return [];

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
  }, [showDropdown, searchText, skills, showCommands]);

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
    if (!showDropdown || filteredItems.length === 0) return;

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
  }, [showDropdown, filteredItems.length]);

  const selectItem = useCallback(
    (item: DropdownItem) => {
      const command =
        item.type === 'command' ? item.command : `/${item.skill.name}`;
      onChange(command);
      setDropdownDismissed(true);
      textareaRef.current?.focus();
    },
    [onChange],
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
      const handled = onEnterKey?.();
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

  // Separate commands and skills for grouped display
  const commandItems = filteredItems.filter((item) => item.type === 'command');
  const skillItems = filteredItems.filter((item) => item.type === 'skill');

  // Get the flat index for an item (used for selection highlighting)
  const getItemIndex = (type: 'command' | 'skill', localIndex: number) => {
    if (type === 'command') return localIndex;
    return commandItems.length + localIndex;
  };

  return (
    <div ref={containerRef} className="relative flex flex-1 items-end">
      {/* Autocompletion dropdown */}
      {showDropdown && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className={clsx(
            'absolute right-0 left-0 max-h-80 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg',
            dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
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
        </div>
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
