import clsx from 'clsx';
import { Plus, Search, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import { useSnippetsRailWidth } from '@/stores/navigation';
import type { PromptSnippet } from '@shared/types';

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      className="px-4 pt-3 pb-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase"
      style={{ color: 'oklch(0.5 0.01 280)' }}
    >
      {label}
    </div>
  );
}

function SnippetRailRow({
  snippet,
  isActive,
  onClick,
}: {
  snippet: PromptSnippet;
  isActive: boolean;
  onClick: () => void;
}) {
  const enabled = snippet.autocomplete.enabled;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-[9px] text-left transition-colors"
      style={{
        background: isActive
          ? 'color-mix(in oklch, oklch(0.78 0.18 295) 18%, transparent)'
          : 'transparent',
        borderLeft: isActive
          ? '2px solid oklch(0.78 0.18 295)'
          : '2px solid transparent',
      }}
    >
      <Terminal
        size={14}
        className="shrink-0"
        style={{
          color: enabled
            ? isActive
              ? 'oklch(0.78 0.18 295)'
              : 'oklch(0.78 0.16 295)'
            : 'oklch(0.4 0.01 280)',
          opacity: enabled ? 1 : 0.6,
        }}
      />
      <span
        className="min-w-0 truncate text-sm"
        style={{
          fontWeight: isActive ? 500 : 400,
          color: isActive
            ? 'oklch(0.99 0 0)'
            : enabled
              ? 'oklch(0.88 0.008 280)'
              : 'oklch(0.5 0.01 280)',
          letterSpacing: '-0.005em',
        }}
      >
        {snippet.name || snippet.autocomplete.slugs[0] || 'Untitled'}
      </span>
      {isBuiltinSnippet(snippet.id) && (
        <span
          className="ml-auto shrink-0 rounded-full"
          style={{
            width: 5,
            height: 5,
            background: 'oklch(0.55 0.01 280)',
          }}
        />
      )}
    </button>
  );
}

export function SnippetRail({
  snippets,
  selectedId,
  onSelect,
  onAdd,
}: {
  snippets: PromptSnippet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState('');
  const { width, setWidth, minWidth, maxWidth } = useSnippetsRailWidth();
  const onWidthChange = useCallback((w: number) => setWidth(w), [setWidth]);
  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    onWidthChange,
  });

  const builtinSnippets = snippets.filter((s) => isBuiltinSnippet(s.id));
  const customSnippets = snippets.filter((s) => !isBuiltinSnippet(s.id));

  const matchesSearch = (s: PromptSnippet) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.autocomplete.slugs.some((slug) => slug.includes(q))
    );
  };

  const filteredBuiltin = builtinSnippets.filter(matchesSearch);
  const filteredCustom = customSnippets.filter(matchesSearch);

  return (
    <div
      className="relative flex min-h-0 shrink-0 flex-col"
      style={{
        width,
        borderRight: '1px solid oklch(1 0 0 / 0.05)',
        background: 'oklch(0 0 0 / 0.18)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="text-lg font-semibold"
            style={{
              color: 'oklch(0.99 0 0)',
              letterSpacing: '-0.015em',
            }}
          >
            Snippets
          </div>
          <span
            className="rounded-[5px] px-2 py-0.5 font-mono text-[11px]"
            style={{
              color: 'oklch(0.7 0.01 280)',
              background: 'oklch(1 0 0 / 0.06)',
              border: '1px solid oklch(1 0 0 / 0.06)',
            }}
          >
            {snippets.length}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onAdd}
            title="New snippet"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              color: 'oklch(0.78 0.18 295)',
              background: 'transparent',
              border: 'none',
            }}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
          style={{
            background: 'oklch(0 0 0 / 0.25)',
            border: '1px solid oklch(1 0 0 / 0.06)',
          }}
        >
          <Search size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter snippets"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
            style={{
              color: 'oklch(0.92 0.008 280)',
              letterSpacing: '-0.005em',
            }}
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto pb-3">
        {filteredBuiltin.length > 0 && (
          <>
            <GroupHeader label="Built-in" />
            {filteredBuiltin.map((s) => (
              <SnippetRailRow
                key={s.id}
                snippet={s}
                isActive={s.id === selectedId}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </>
        )}
        {filteredCustom.length > 0 && (
          <>
            <GroupHeader label="Custom" />
            {filteredCustom.map((s) => (
              <SnippetRailRow
                key={s.id}
                snippet={s}
                isActive={s.id === selectedId}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </>
        )}
        {filteredBuiltin.length === 0 && filteredCustom.length === 0 && (
          <p
            className="px-4 py-6 text-center text-xs"
            style={{ color: 'oklch(0.5 0.01 280)' }}
          >
            No snippets match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />
    </div>
  );
}
