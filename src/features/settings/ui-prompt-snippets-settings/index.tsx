import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { HandlebarsEditor } from '@/common/ui/handlebars-editor';
import {
  usePromptSnippetsSetting,
  useUpdatePromptSnippetsSetting,
} from '@/hooks/use-settings';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import type { PromptSnippet, PromptSnippetContext } from '@shared/types';

// Variables available only when task already exists (new task step)
const TASK_VARIABLES = [
  '{{task.worktreePath}}',
  '{{task.name}}',
  '{{task.note}}',
  '{{task.sourceBranch}}',
  '{{task.branchName}}',
];

// Variables always available
const PROJECT_VARIABLES = ['{{project.name}}', '{{project.path}}'];

// Work item variables (available in new task context)
const WORK_ITEM_VARIABLES = [
  '{{#each workItems}}...{{/each}}',
  '{{this.id}}',
  '{{this.title}}',
  '{{this.description}}',
  '{{this.comments}}',
  '{{this.testCases}}',
];

// Helpers always available
const TEMPLATE_HELPERS = ['{{#if ...}}...{{/if}}', '{{#each ...}}...{{/each}}'];

function getAvailableVariables(contexts: PromptSnippetContext): {
  variables: string[];
  helpers: string[];
} {
  const variables: string[] = [...PROJECT_VARIABLES];

  if (contexts.newTaskStep) {
    variables.push(...TASK_VARIABLES);
  }

  if (contexts.newTask) {
    variables.push(...WORK_ITEM_VARIABLES);
  }

  // Work items also available in step if task has them
  if (contexts.newTaskStep && !contexts.newTask) {
    variables.push(...WORK_ITEM_VARIABLES);
  }

  return { variables, helpers: TEMPLATE_HELPERS };
}

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
      description: '',
      template: '',
      enabled: true,
      contexts: { newTask: true, newTaskStep: true },
      autocomplete: { enabled: true, slugs: [''] },
    };
    updateSnippets.mutate([...snippets, newSnippet], {
      onSuccess: () => setEditingId(newSnippet.id),
    });
  };

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
            Create reusable prompt templates with Handlebars syntax
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
                  // Remove snippet if no slug and no name (incomplete creation)
                  if (
                    !snippet.autocomplete.slugs[0]?.trim() &&
                    !snippet.name.trim()
                  ) {
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
                    {snippet.autocomplete.slugs[0]
                      ? `/${snippet.autocomplete.slugs[0]}`
                      : snippet.name || '...'}
                  </span>
                  {snippet.autocomplete.slugs[0] && snippet.name && (
                    <span className="text-ink-3 ml-2 text-sm">
                      {snippet.name}
                    </span>
                  )}
                  {isBuiltinSnippet(snippet.id) && (
                    <span className="bg-glass-medium text-ink-3 ml-2 rounded px-1.5 py-0.5 text-xs">
                      builtin
                    </span>
                  )}
                  {!snippet.autocomplete.enabled && (
                    <span className="bg-glass-medium text-ink-3 ml-2 rounded px-1.5 py-0.5 text-xs">
                      no autocomplete
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
  onUpdate: (updates: Partial<Omit<PromptSnippet, 'id'>>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const { variables, helpers } = useMemo(
    () => getAvailableVariables(snippet.contexts),
    [snippet.contexts],
  );

  const isBuiltin = isBuiltinSnippet(snippet.id);

  if (isBuiltin) {
    return (
      <div className="space-y-3">
        <div>
          <div className="text-ink-1 text-sm font-medium">{snippet.name}</div>
          {snippet.description && (
            <div className="text-ink-3 text-xs">{snippet.description}</div>
          )}
        </div>
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Template</label>
          <pre className="border-glass-border bg-bg-2 text-ink-2 w-full overflow-auto rounded border px-3 py-2 font-mono text-[12px] leading-relaxed">
            {snippet.template}
          </pre>
        </div>
        <div className="text-ink-3 flex gap-3 text-xs">
          {snippet.contexts.newTask && <span>New task</span>}
          {snippet.contexts.newTaskStep && <span>New task step</span>}
          {snippet.autocomplete.enabled && (
            <span>/{snippet.autocomplete.slugs.join(', /')}</span>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={onDone} size="sm">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Name and Description */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Name</label>
          <input
            type="text"
            value={snippet.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="My Snippet"
            className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Description</label>
          <input
            type="text"
            value={snippet.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Short description of what this does"
            className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Template */}
      <div>
        <label className="text-ink-2 mb-1 block text-xs">
          Template (Handlebars)
        </label>
        <HandlebarsEditor
          value={snippet.template}
          onChange={(val) => onUpdate({ template: val })}
          placeholder="Review changes on branch {{task.branchName}}..."
          className="border-glass-border bg-bg-2 w-full rounded border"
          minHeight="100px"
          maxHeight="250px"
        />
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => (
              <span
                key={v}
                className="bg-glass-light text-ink-3 rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {v}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {helpers.map((v) => (
              <span
                key={v}
                className="bg-glass-light text-acc/70 rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Contexts */}
      <div>
        <label className="text-ink-2 mb-1.5 block text-xs">
          Available in contexts
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={snippet.contexts.newTask}
              onChange={(e) =>
                onUpdate({
                  contexts: {
                    ...snippet.contexts,
                    newTask: e.target.checked,
                  },
                })
              }
              className="accent-acc h-3.5 w-3.5"
            />
            <span className="text-ink-2">New task</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={snippet.contexts.newTaskStep}
              onChange={(e) =>
                onUpdate({
                  contexts: {
                    ...snippet.contexts,
                    newTaskStep: e.target.checked,
                  },
                })
              }
              className="accent-acc h-3.5 w-3.5"
            />
            <span className="text-ink-2">New task step</span>
          </label>
        </div>
      </div>

      {/* Autocomplete */}
      <div>
        <label className="text-ink-2 mb-1.5 block text-xs">Autocomplete</label>
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={snippet.autocomplete.enabled}
              onChange={(e) =>
                onUpdate({
                  autocomplete: {
                    ...snippet.autocomplete,
                    enabled: e.target.checked,
                  },
                })
              }
              className="accent-acc h-3.5 w-3.5"
              disabled={isBuiltin}
            />
            <span className="text-ink-2">Show in / autocomplete</span>
          </label>
          {snippet.autocomplete.enabled && (
            <div>
              <label className="text-ink-3 mb-1 block text-xs">
                Slugs (comma-separated)
              </label>
              <div className="flex items-center">
                <span className="text-ink-3 mr-1 text-sm">/</span>
                <input
                  type="text"
                  value={snippet.autocomplete.slugs.join(', ')}
                  onChange={(e) =>
                    onUpdate({
                      autocomplete: {
                        ...snippet.autocomplete,
                        slugs: e.target.value
                          .split(',')
                          .map((s) =>
                            s
                              .trim()
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, '-'),
                          )
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="review, cr"
                  className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
                  disabled={isBuiltin}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        {!isBuiltin ? (
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
