import clsx from 'clsx';
import { Wand2 } from 'lucide-react';
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { KeyboardEvent, ChangeEvent, TextareaHTMLAttributes } from 'react';

import type { Skill } from '../../../../shared/skill-types';

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

export interface PromptTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  skills?: Skill[];
  maxHeight?: number;
  /** Custom handler for Enter key (without shift). Return true to prevent default submit behavior. */
  onEnterKey?: () => boolean | void;
  /** Whether to show commands in the dropdown (default: true) */
  showCommands?: boolean;
}

export const PromptTextarea = forwardRef<PromptTextareaRef, PromptTextareaProps>(
  function PromptTextarea(
    {
      value,
      onChange,
      skills = [],
      maxHeight = 200,
      onEnterKey,
      showCommands = true,
      className,
      onKeyDown: externalOnKeyDown,
      ...textareaProps
    },
    ref,
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dropdownDismissed, setDropdownDismissed] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
          items.push({ type: 'command', command: cmd.command, description: cmd.description });
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
        const command = item.type === 'command' ? item.command : `/${item.skill.name}`;
        onChange(command);
        setDropdownDismissed(true);
        textareaRef.current?.focus();
      },
      [onChange],
    );

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

    const handleInput = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        // Set height to scrollHeight, capped at max height
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      }
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      handleInput();
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
      <div ref={containerRef} className="relative flex-1">
        {/* Autocompletion dropdown */}
        {showDropdown && filteredItems.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full left-0 right-0 mb-1 max-h-80 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg"
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
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          className={clsx(
            'min-h-[40px] w-full resize-none rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...textareaProps}
        />
      </div>
    );
  },
);
