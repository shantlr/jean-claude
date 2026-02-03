import clsx from 'clsx';
import Fuse from 'fuse.js';
import { groupBy, map } from 'lodash-es';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCommands, useCommandSources } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';

export function CommandPaletteOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cmdCources = useCommandSources();

  const allCmds = cmdCources
    .flatMap(
      (source) =>
        source.commands.current?.map((cmd, idx) => ({
          ...cmd,
          id: `${source.id}_${idx}`,
          shortcuts: Array.isArray(cmd.shortcut)
            ? cmd.shortcut
            : cmd.shortcut
              ? [cmd.shortcut]
              : [],
        })) ?? [],
    )
    .filter((cmd) => !cmd.hideInCommandPalette);

  const fuse = new Fuse(allCmds, {
    keys: ['label', 'keywords'],
    threshold: 0.4,
    ignoreLocation: true,
  });

  const filteredCmds = query ? fuse.search(query).map((r) => r.item) : allCmds;
  const bySection = groupBy(filteredCmds, (cmd) => cmd.section ?? '');

  const handleSelect = useCallback(
    (command: (typeof allCmds)[number]) => {
      onClose();
      command.handler();
    },
    [onClose],
  );

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  // useEffect(() => {
  //   if (!listRef.current) return;
  //   const container = listRef.current;
  //   const selectedElement = container.querySelector(
  //     '[data-selected="true"]',
  //   ) as HTMLElement | null;
  //   if (!selectedElement) return;

  //   const containerRect = container.getBoundingClientRect();
  //   const elementRect = selectedElement.getBoundingClientRect();

  //   // Check if element is above visible area
  //   if (elementRect.top < containerRect.top) {
  //     container.scrollTop -= containerRect.top - elementRect.top;
  //   }
  //   // Check if element is below visible area
  //   else if (elementRect.bottom > containerRect.bottom) {
  //     container.scrollTop += elementRect.bottom - containerRect.bottom;
  //   }
  // }, [selectedIndex]);

  useCommands('command-palette-overlay', [
    {
      label: 'Close Command Palette',
      shortcut: ['escape', 'cmd+p'],
      handler: () => {
        onClose();
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Execute Selected Command',
      shortcut: 'enter',
      handler: () => {
        const cmd = filteredCmds[selectedIndex];
        if (cmd) handleSelect(cmd);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Select Previous Command',
      shortcut: 'up',
      handler: () => {
        setSelectedIndex((i) => Math.max(0, i - 1));
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Select Next Command',
      shortcut: 'down',
      handler: () => {
        setSelectedIndex((i) => Math.min(filteredCmds.length - 1, i + 1));
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Select First Command',
      shortcut: 'cmd+up',
      handler: () => {
        setSelectedIndex(0);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Select Last Command',
      shortcut: 'cmd+down',
      handler: () => {
        setSelectedIndex(filteredCmds.length - 1);
      },
      hideInCommandPalette: true,
    },
  ]);

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
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="my-2 overflow-y-auto p-2">
          {filteredCmds.length === 0 ? (
            <div className="text-muted-foreground py-6 text-center text-sm">
              No matching commands
            </div>
          ) : (
            map(bySection, (sectionCmds, sectionName) => {
              // const cmds = groupedCommands[section];
              return (
                <div key={sectionName} className="mt-4 mb-2 first:mt-0">
                  <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
                    {sectionName}
                    {/* {SECTION_LABELS[section] ?? section} */}
                  </div>
                  {sectionCmds.map((cmd) => {
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
                        {cmd.shortcuts.map((shortcut, i) => (
                          <Kbd key={i} shortcut={shortcut} />
                        ))}
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
