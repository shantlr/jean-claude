import { useCallback, useState } from 'react';

import {
  usePromptSnippetsSetting,
  useUpdatePromptSnippetsSetting,
} from '@/hooks/use-settings';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import type { PromptSnippet } from '@shared/types';

import { SnippetDetail } from './snippet-detail';
import { SnippetRail } from './snippet-rail';

function generateId(): string {
  return crypto.randomUUID();
}

export function PromptSnippetsSettings() {
  const { data: snippets = [] } = usePromptSnippetsSetting();
  const updateSnippets = useUpdatePromptSnippetsSetting();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first snippet
  const effectiveSelectedId = selectedId ?? snippets[0]?.id ?? null;
  const selectedSnippet = snippets.find((s) => s.id === effectiveSelectedId);

  const handleCreate = useCallback(() => {
    const newSnippet: PromptSnippet = {
      id: generateId(),
      name: '',
      description: '',
      template: '',
      enabled: true,
      contexts: { newTask: true, newTaskStep: true },
      autocomplete: { enabled: true, slugs: [] },
    };
    updateSnippets.mutate([...snippets, newSnippet], {
      onSuccess: () => setSelectedId(newSnippet.id),
    });
  }, [snippets, updateSnippets]);

  const handleUpdate = useCallback(
    (id: string, updates: Partial<Omit<PromptSnippet, 'id'>>) => {
      if (isBuiltinSnippet(id)) return;
      const updated = snippets.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      );
      updateSnippets.mutate(updated);
    },
    [snippets, updateSnippets],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (isBuiltinSnippet(id)) return;
      const snippet = snippets.find((s) => s.id === id);
      const label =
        snippet?.name || snippet?.autocomplete.slugs[0] || 'this snippet';
      if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
      const remaining = snippets.filter((s) => s.id !== id);
      updateSnippets.mutate(remaining);
      if (effectiveSelectedId === id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [snippets, updateSnippets, effectiveSelectedId],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const source = snippets.find((s) => s.id === id);
      if (!source) return;
      const dup: PromptSnippet = {
        ...source,
        id: generateId(),
        name: `${source.name} (copy)`,
        autocomplete: {
          ...source.autocomplete,
          slugs: source.autocomplete.slugs.map((s) => `${s}-copy`),
        },
      };
      updateSnippets.mutate([...snippets, dup], {
        onSuccess: () => setSelectedId(dup.id),
      });
    },
    [snippets, updateSnippets],
  );

  return (
    <div
      className="flex min-h-0 flex-1 border-t"
      style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}
    >
      <SnippetRail
        snippets={snippets}
        selectedId={effectiveSelectedId}
        onSelect={setSelectedId}
        onAdd={handleCreate}
      />

      {selectedSnippet ? (
        <SnippetDetail
          key={selectedSnippet.id}
          snippet={selectedSnippet}
          onUpdate={(updates) => handleUpdate(selectedSnippet.id, updates)}
          onDelete={() => handleDelete(selectedSnippet.id)}
          onDuplicate={() => handleDuplicate(selectedSnippet.id)}
        />
      ) : (
        <div
          className="flex min-w-0 flex-1 items-center justify-center"
          style={{ background: 'oklch(0 0 0 / 0.18)' }}
        >
          <p className="text-sm" style={{ color: 'oklch(0.55 0.01 280)' }}>
            {snippets.length === 0
              ? 'No snippets yet. Click + to create one.'
              : 'Select a snippet to edit'}
          </p>
        </div>
      )}
    </div>
  );
}
