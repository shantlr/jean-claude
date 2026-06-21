import { Plus, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  ListGroupHeader,
  ListItemButton,
  ListPane,
  ListSearchInput,
} from '@/common/ui/list-detail-layout';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import type { PromptSnippet } from '@shared/types';
import { useSnippetsRailWidth } from '@/stores/navigation';



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
    <ListItemButton
      label={snippet.name || snippet.autocomplete.slugs[0] || 'Untitled'}
      isActive={isActive}
      isDimmed={!enabled}
      size="compact"
      onClick={onClick}
      renderIcon={({ isActive: active, isDimmed }) => (
        <Terminal
          size={14}
          className="shrink-0"
          style={{
            color: isDimmed
              ? 'oklch(0.4 0.01 280)'
              : active
                ? 'oklch(0.78 0.18 295)'
                : 'oklch(0.78 0.16 295)',
            opacity: isDimmed ? 0.6 : 1,
          }}
        />
      )}
      suffix={
        isBuiltinSnippet(snippet.id) ? (
          <span
            className="ml-auto shrink-0 rounded-full"
            style={{
              width: 5,
              height: 5,
              background: 'oklch(0.55 0.01 280)',
            }}
          />
        ) : undefined
      }
    />
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
    <ListPane
      width={width}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onWidthChange={onWidthChange}
      headerContent={
        <div className="min-w-0 flex-1 overflow-hidden">
          <ListSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter..."
            ariaLabel="Filter snippets"
          />
        </div>
      }
      headerActions={
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
      }
    >
      {filteredBuiltin.length > 0 && (
        <>
          <ListGroupHeader label={`Built-in (${filteredBuiltin.length})`} />
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
          <ListGroupHeader label={`Custom (${filteredCustom.length})`} />
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
    </ListPane>
  );
}
