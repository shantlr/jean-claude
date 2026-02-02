// src/features/command-palette/ui-command-palette-overlay/index.tsx
import clsx from 'clsx';
import Fuse from 'fuse.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCommandPalette, type Command } from '@/lib/command-palette';
import {
  useKeyboardBindings,
  Kbd,
  type BindingKey,
} from '@/lib/keyboard-bindings';

// Group commands by section
function groupBySection(commands: Command[]): Record<string, Command[]> {
  const groups: Record<string, Command[]> = {};
  for (const cmd of commands) {
    const section = cmd.section ?? 'commands';
    if (!groups[section]) groups[section] = [];
    groups[section].push(cmd);
  }
  return groups;
}

const SECTION_LABELS: Record<string, string> = {
  'current-task': 'Current Task',
  sessions: 'Sessions',
  commands: 'Commands',
};

// Section display order
const SECTION_ORDER = ['current-task', 'sessions', 'commands'];

export function CommandPaletteOverlay({ onClose }: { onClose: () => void }) {
  const { getCommands } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = getCommands();

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(commands, {
        keys: ['label', 'keywords'],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [commands],
  );

  // Filter commands using fuzzy search
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return fuse.search(query).map((r) => r.item);
  }, [commands, query, fuse]);

  // Group and sort commands by section, then flatten to get display order
  const { groupedCommands, sortedSections, displayedCommands } = useMemo(() => {
    const grouped = groupBySection(filteredCommands);
    const sections = Object.keys(grouped).sort((a, b) => {
      const aIndex = SECTION_ORDER.indexOf(a);
      const bIndex = SECTION_ORDER.indexOf(b);
      const aOrder = aIndex === -1 ? SECTION_ORDER.length : aIndex;
      const bOrder = bIndex === -1 ? SECTION_ORDER.length : bIndex;
      return aOrder - bOrder;
    });
    // Flatten in display order for consistent indexing
    const displayed = sections.flatMap((section) => grouped[section]);
    return {
      groupedCommands: grouped,
      sortedSections: sections,
      displayedCommands: displayed,
    };
  }, [filteredCommands]);

  const handleSelect = useCallback(
    (command: Command) => {
      onClose();
      command.onSelect();
    },
    [onClose],
  );

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const container = listRef.current;
    const selectedElement = container.querySelector(
      '[data-selected="true"]',
    ) as HTMLElement | null;
    if (!selectedElement) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = selectedElement.getBoundingClientRect();

    // Check if element is above visible area
    if (elementRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elementRect.top;
    }
    // Check if element is below visible area
    else if (elementRect.bottom > containerRect.bottom) {
      container.scrollTop += elementRect.bottom - containerRect.bottom;
    }
  }, [selectedIndex]);

  useKeyboardBindings('command-palette-overlay', {
    'cmd+p': () => {
      onClose();
      return true;
    },
    escape: () => {
      onClose();
      return true;
    },
    enter: () => {
      const cmd = displayedCommands[selectedIndex];
      if (cmd) handleSelect(cmd);
      return true;
    },
    up: () => {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return true;
    },
    down: () => {
      setSelectedIndex((i) => Math.min(displayedCommands.length - 1, i + 1));
      return true;
    },
    'cmd+up': () => {
      setSelectedIndex(0);
      return true;
    },
    'cmd+down': () => {
      setSelectedIndex(displayedCommands.length - 1);
      return true;
    },
  });

  // Reset selection when query changes
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  let itemIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-neutral-700 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="my-2 overflow-y-auto p-2">
          {displayedCommands.length === 0 ? (
            <div className="text-muted-foreground py-6 text-center text-sm">
              No matching commands
            </div>
          ) : (
            sortedSections.map((section) => {
              const cmds = groupedCommands[section];
              return (
                <div key={section} className="mt-4 mb-2 first:mt-0">
                  <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
                    {SECTION_LABELS[section] ?? section}
                  </div>
                  {cmds.map((cmd) => {
                    const currentIndex = itemIndex++;
                    const isSelected = currentIndex === selectedIndex;
                    return (
                      <button
                        key={cmd.id}
                        data-selected={isSelected}
                        onClick={() => handleSelect(cmd)}
                        className={clsx(
                          'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                          isSelected
                            ? 'bg-neutral-700 text-white'
                            : 'text-neutral-300 hover:bg-neutral-700/50',
                        )}
                      >
                        <span>{cmd.label}</span>
                        {cmd.shortcut && (
                          <Kbd shortcut={cmd.shortcut as BindingKey} />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
