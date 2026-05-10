import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import {
  usePromptSnippetsSetting,
  useUpdatePromptSnippetsSetting,
} from '@/hooks/use-settings';
import type { PromptSnippet } from '@shared/types';

const AVAILABLE_VARIABLES = [
  '{task.worktree.path}',
  '{task.name}',
  '{task.note}',
  '{task.sourceBranch}',
  '{task.branch.name}',
  '{project.name}',
  '{project.path}',
];

function generateId(): string {
  return crypto.randomUUID();
}

export function PromptSnippetsSettings() {
  const { data: snippets = [] } = usePromptSnippetsSetting();
  const updateSnippets = useUpdatePromptSnippetsSetting();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = () => {
    const newSnippet: PromptSnippet = {
      id: generateId(),
      name: '',
      trigger: '',
      template: '',
      enabled: true,
      builtin: false,
    };
    updateSnippets.mutate([...snippets, newSnippet], {
      onSuccess: () => setEditingId(newSnippet.id),
    });
  };

  const handleUpdate = useCallback(
    (id: string, updates: Partial<Omit<PromptSnippet, 'id' | 'builtin'>>) => {
      const updated = snippets.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      );
      updateSnippets.mutate(updated);
    },
    [snippets, updateSnippets],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const snippet = snippets.find((s) => s.id === id);
      if (snippet?.builtin) return;
      updateSnippets.mutate(snippets.filter((s) => s.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [snippets, updateSnippets, editingId],
  );

  const handleToggle = useCallback(
    (id: string) => {
      const updated = snippets.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      updateSnippets.mutate(updated);
    },
    [snippets, updateSnippets],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ink-1 text-sm font-medium">Prompt Snippets</h3>
          <p className="text-ink-3 text-xs">
            Create reusable prompt templates triggered by / in the input
          </p>
        </div>
        <Button onClick={handleCreate} size="sm" icon={<Plus />}>
          Add Snippet
        </Button>
      </div>

      {snippets.length === 0 && (
        <p className="text-ink-3 py-8 text-center text-sm">
          No prompt snippets yet. Click &ldquo;Add Snippet&rdquo; to create one.
        </p>
      )}

      <div className="space-y-2">
        {snippets.map((snippet) => (
          <div
            key={snippet.id}
            className="border-glass-border rounded-lg border p-3"
          >
            {editingId === snippet.id ? (
              <SnippetForm
                snippet={snippet}
                onUpdate={(updates) => handleUpdate(snippet.id, updates)}
                onDelete={() => handleDelete(snippet.id)}
                onDone={() => {
                  // Remove snippet if trigger is empty (incomplete creation)
                  if (!snippet.trigger.trim()) {
                    handleDelete(snippet.id);
                  }
                  setEditingId(null);
                }}
              />
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setEditingId(snippet.id)}
                >
                  <span className="text-ink-1 text-sm font-medium">
                    /{snippet.trigger || '...'}
                  </span>
                  <span className="text-ink-3 ml-2 text-sm">
                    {snippet.name}
                  </span>
                  {snippet.builtin && (
                    <span className="bg-glass-medium text-ink-3 ml-2 rounded px-1.5 py-0.5 text-xs">
                      builtin
                    </span>
                  )}
                </button>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={snippet.enabled}
                    onChange={() => handleToggle(snippet.id)}
                    className="accent-acc h-3.5 w-3.5"
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnippetForm({
  snippet,
  onUpdate,
  onDelete,
  onDone,
}: {
  snippet: PromptSnippet;
  onUpdate: (updates: Partial<Omit<PromptSnippet, 'id' | 'builtin'>>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Trigger</label>
          <div className="flex items-center">
            <span className="text-ink-3 mr-1 text-sm">/</span>
            <input
              type="text"
              value={snippet.trigger}
              onChange={(e) =>
                onUpdate({
                  trigger: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-'),
                })
              }
              placeholder="my-snippet"
              className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
              disabled={snippet.builtin}
            />
          </div>
        </div>
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Name</label>
          <input
            type="text"
            value={snippet.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="My Snippet"
            className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
            disabled={snippet.builtin}
          />
        </div>
      </div>
      <div>
        <label className="text-ink-2 mb-1 block text-xs">Template</label>
        <textarea
          value={snippet.template}
          onChange={(e) => onUpdate({ template: e.target.value })}
          placeholder="Review the changes on branch {task.branch.name} in {task.worktree.path}..."
          rows={4}
          className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1.5 text-sm focus:outline-none"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {AVAILABLE_VARIABLES.map((v) => (
            <span
              key={v}
              className="bg-glass-light text-ink-3 rounded px-1.5 py-0.5 font-mono text-xs"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        {!snippet.builtin ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        ) : (
          <span />
        )}
        <Button onClick={onDone} size="sm">
          Done
        </Button>
      </div>
    </div>
  );
}
