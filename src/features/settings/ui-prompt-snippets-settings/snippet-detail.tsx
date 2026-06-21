import { Copy, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  resolveSnippetTemplate,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import { HandlebarsEditor } from '@/common/ui/handlebars-editor';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import type { PromptSnippet } from '@shared/types';
import { Switch } from '@/common/ui/switch';



const ACCENT = 'oklch(0.78 0.18 295)';

const VARIABLE_GROUPS = [
  {
    group: 'project',
    items: [
      { name: 'project.name', desc: 'Project name' },
      { name: 'project.path', desc: 'Worktree root' },
    ],
  },
  {
    group: 'task',
    items: [
      { name: 'task.name', desc: 'Task title' },
      { name: 'task.note', desc: 'Author note' },
      { name: 'task.sourceBranch', desc: 'Source branch' },
      { name: 'task.branchName', desc: 'Working branch' },
      { name: 'task.worktreePath', desc: 'Worktree path' },
    ],
  },
  {
    group: 'workItems',
    items: [
      { name: 'this.id', desc: 'inside #each' },
      { name: 'this.title', desc: 'inside #each' },
      { name: 'this.description', desc: 'inside #each' },
      { name: 'this.comments', desc: 'inside #each' },
      { name: 'this.testCases', desc: 'inside #each' },
    ],
  },
  {
    group: 'helpers',
    items: [
      { name: '#each', desc: 'Loop over collection' },
      { name: '#if', desc: 'Conditional' },
    ],
  },
];

const PREVIEW_CONTEXT: SnippetVariableContext = {
  project: { name: 'my-project', path: '~/code/my-project' },
  task: {
    name: 'example task',
    note: 'implementation notes here',
    sourceBranch: 'main',
    branchName: 'jean-claude/example-task',
    worktreePath: '~/code/my-project/.worktrees/example',
  },
  workItems: [
    {
      id: '12345',
      title: 'Example work item',
      description: 'Implement the feature',
      testCases: [
        {
          id: '99001',
          title: 'Verify feature works end-to-end',
          steps: [
            {
              action: 'Open the app',
              expectedResult: 'App loads successfully',
            },
            { action: 'Click the button', expectedResult: 'Action completes' },
          ],
        },
        {
          id: '99002',
          title: 'Verify no regressions',
        },
      ],
    },
  ],
};

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span
        className="text-[11px] font-medium tracking-wide uppercase"
        style={{ color: 'oklch(0.78 0.01 280)' }}
      >
        {label}
      </span>
      {hint && (
        <span
          className="text-[10.5px]"
          style={{ color: 'oklch(0.48 0.01 280)' }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function ContextToggle({
  on,
  label,
  onClick,
  disabled,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-[7px] rounded-[5px] py-[5px] pr-2.5 pl-2 text-[11.5px] font-medium disabled:opacity-50"
      style={{
        background: on
          ? `color-mix(in oklch, ${ACCENT} 16%, transparent)`
          : 'oklch(1 0 0 / 0.03)',
        border: on
          ? `1px solid color-mix(in oklch, ${ACCENT} 35%, transparent)`
          : '1px solid oklch(1 0 0 / 0.07)',
        color: on ? ACCENT : 'oklch(0.65 0.01 280)',
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-[3px]"
        style={{
          width: 12,
          height: 12,
          background: on ? ACCENT : 'transparent',
          border: on ? 'none' : '1.5px solid oklch(1 0 0 / 0.18)',
        }}
      >
        {on && (
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="oklch(0.12 0 0)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

function SlugChip({
  slug,
  primary,
  onRemove,
}: {
  slug: string;
  primary?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded font-mono text-[11.5px]"
      style={{
        padding: '3px 4px 3px 7px',
        background: primary
          ? `color-mix(in oklch, ${ACCENT} 18%, transparent)`
          : 'oklch(1 0 0 / 0.05)',
        border: primary
          ? `1px solid color-mix(in oklch, ${ACCENT} 35%, transparent)`
          : '1px solid oklch(1 0 0 / 0.08)',
        color: primary ? ACCENT : 'oklch(0.78 0.008 280)',
      }}
    >
      /{slug}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] opacity-50 hover:opacity-100"
        >
          <X size={9} strokeWidth={2.2} />
        </button>
      )}
    </span>
  );
}

function VarTree() {
  return (
    <div className="flex flex-col gap-2.5">
      {VARIABLE_GROUPS.map((g) => (
        <div key={g.group}>
          <div
            className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] font-semibold uppercase"
            style={{ color: 'oklch(0.5 0.01 280)', letterSpacing: '1px' }}
          >
            <span style={{ color: ACCENT }}>●</span>
            {g.group}
          </div>
          <div className="flex flex-col gap-px">
            {g.items.map((v) => (
              <div
                key={v.name}
                className="flex items-baseline gap-2 rounded px-1.5 py-1 font-mono text-[11px] transition-colors hover:bg-white/[0.04]"
              >
                <span style={{ color: ACCENT, whiteSpace: 'nowrap' }}>
                  {v.name}
                </span>
                <span
                  className="truncate text-[10.5px]"
                  style={{ color: 'oklch(0.5 0.01 280)' }}
                >
                  {v.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SnippetDetail({
  snippet,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  snippet: PromptSnippet;
  onUpdate: (updates: Partial<Omit<PromptSnippet, 'id'>>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const isBuiltin = isBuiltinSnippet(snippet.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [slugInput, setSlugInput] = useState('');

  const previewResult = useMemo(
    () => resolveSnippetTemplate(snippet.template, PREVIEW_CONTEXT),
    [snippet.template],
  );

  const handleAddSlug = useCallback(() => {
    const slug = slugInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    if (slug && !snippet.autocomplete.slugs.includes(slug)) {
      onUpdate({
        autocomplete: {
          ...snippet.autocomplete,
          slugs: [...snippet.autocomplete.slugs, slug],
        },
      });
    }
    setSlugInput('');
  }, [slugInput, snippet.autocomplete, onUpdate]);

  const handleRemoveSlug = useCallback(
    (slug: string) => {
      onUpdate({
        autocomplete: {
          ...snippet.autocomplete,
          slugs: snippet.autocomplete.slugs.filter((s) => s !== slug),
        },
      });
    },
    [snippet.autocomplete, onUpdate],
  );

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      style={{ background: 'oklch(0 0 0 / 0.08)' }}
    >
      <div className="flex min-w-0 flex-col gap-[18px] p-6">
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2.5">
              <Terminal size={15} style={{ color: ACCENT }} />
              <div
                className="text-lg font-semibold"
                style={{
                  color: 'oklch(0.99 0 0)',
                  letterSpacing: '-0.015em',
                }}
              >
                {snippet.name || 'Untitled snippet'}
              </div>
              {isBuiltin && (
                <span
                  className="rounded bg-white/5 px-[7px] py-0.5 font-mono text-[10px] uppercase"
                  style={{
                    color: 'oklch(0.55 0.01 280)',
                    letterSpacing: '0.06em',
                  }}
                >
                  built-in
                </span>
              )}
            </div>
            <div
              className="text-[12.5px]"
              style={{ color: 'oklch(0.65 0.01 280)' }}
            >
              {snippet.description || 'No description'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onDuplicate}
              className="rounded p-1.5 transition-colors hover:bg-white/[0.06]"
              style={{ color: 'oklch(0.65 0.01 280)' }}
              title="Duplicate"
            >
              <Copy size={14} />
            </button>
            {!isBuiltin &&
              (confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setConfirmingDelete(false);
                  }}
                  onBlur={() => setConfirmingDelete(false)}
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{
                    background: 'oklch(0.72 0.18 25 / 0.16)',
                    color: 'oklch(0.85 0.16 25)',
                    border: '1px solid oklch(0.72 0.18 25 / 0.3)',
                  }}
                  autoFocus
                >
                  Delete?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                  style={{ color: 'oklch(0.65 0.01 280)' }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              ))}
            <Switch
              checked={snippet.enabled}
              onChange={() => onUpdate({ enabled: !snippet.enabled })}
              label="Enabled"
            />
          </div>
        </div>

        {/* Name + Description */}
        {!isBuiltin && (
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <FieldLabel label="Name" />
              <input
                type="text"
                value={snippet.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="My Snippet"
                aria-label="Snippet name"
                className="w-full rounded-md px-2.5 py-[7px] text-sm focus:outline-none"
                style={{
                  background: 'oklch(0 0 0 / 0.28)',
                  border: '1px solid oklch(1 0 0 / 0.07)',
                  color: 'oklch(0.95 0.008 280)',
                }}
              />
            </div>
            <div>
              <FieldLabel
                label="Description"
                hint="One line, helps you remember"
              />
              <input
                type="text"
                value={snippet.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Short description"
                aria-label="Snippet description"
                className="w-full rounded-md px-2.5 py-[7px] text-sm focus:outline-none"
                style={{
                  background: 'oklch(0 0 0 / 0.28)',
                  border: '1px solid oklch(1 0 0 / 0.07)',
                  color: 'oklch(0.95 0.008 280)',
                }}
              />
            </div>
          </div>
        )}

        {/* Template + Variables */}
        <div
          className="grid min-w-0 items-start gap-3.5"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) 220px' }}
        >
          <div className="min-w-0">
            <FieldLabel
              label="Template"
              hint={
                isBuiltin
                  ? undefined
                  : 'Handlebars syntax — type {{ to insert a variable'
              }
            />
            <div
              className="min-w-0 overflow-visible rounded-[7px]"
              style={{
                background: 'oklch(0 0 0 / 0.35)',
                border: '1px solid oklch(1 0 0 / 0.08)',
              }}
            >
              {isBuiltin ? (
                <pre
                  className="overflow-auto p-3 font-mono text-xs leading-relaxed"
                  style={{ color: 'oklch(0.85 0.008 280)' }}
                >
                  {snippet.template}
                </pre>
              ) : (
                <HandlebarsEditor
                  value={snippet.template}
                  onChange={(val) => onUpdate({ template: val })}
                  placeholder="Review changes on branch {{task.branchName}}..."
                  minHeight="140px"
                  maxHeight="300px"
                />
              )}
            </div>
          </div>

          <div>
            <FieldLabel label="Variables" hint="reference" />
            <div
              className="overflow-auto rounded-[7px] p-2.5"
              style={{
                background: 'oklch(0 0 0 / 0.22)',
                border: '1px solid oklch(1 0 0 / 0.06)',
                maxHeight: 280,
              }}
            >
              <VarTree />
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <FieldLabel label="Preview" hint="Rendered against sample context" />
          <div
            className="rounded-[7px] p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{
              background: `linear-gradient(135deg, oklch(0.78 0.18 295 / 0.06), transparent 60%), oklch(0 0 0 / 0.22)`,
              border: '1px solid oklch(1 0 0 / 0.07)',
              color: 'oklch(0.88 0.008 280)',
            }}
          >
            {previewResult.ok
              ? previewResult.output
              : `⚠ ${previewResult.error}`}
          </div>
        </div>

        {/* Availability + Slugs */}
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <FieldLabel
              label="Available in"
              hint="Where this snippet appears"
            />
            <div className="flex flex-wrap gap-1.5">
              <ContextToggle
                on={snippet.contexts.newTask}
                label="New task"
                disabled={isBuiltin}
                onClick={() =>
                  onUpdate({
                    contexts: {
                      ...snippet.contexts,
                      newTask: !snippet.contexts.newTask,
                    },
                  })
                }
              />
              <ContextToggle
                on={snippet.contexts.newTaskStep}
                label="New task step"
                disabled={isBuiltin}
                onClick={() =>
                  onUpdate({
                    contexts: {
                      ...snippet.contexts,
                      newTaskStep: !snippet.contexts.newTaskStep,
                    },
                  })
                }
              />
            </div>
          </div>
          <div>
            <FieldLabel label="Slash commands" hint="Trigger with /" />
            <div className="flex flex-wrap items-center gap-1.5">
              {snippet.autocomplete.slugs.map((slug, i) => (
                <SlugChip
                  key={slug}
                  slug={slug}
                  primary={i === 0}
                  onRemove={
                    !isBuiltin ? () => handleRemoveSlug(slug) : undefined
                  }
                />
              ))}
              {!isBuiltin && (
                <input
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSlug();
                    }
                  }}
                  onBlur={handleAddSlug}
                  placeholder="+ add"
                  className="rounded bg-transparent px-2 py-0.5 font-mono text-[11px] focus:outline-none"
                  style={{
                    border: '1px dashed oklch(1 0 0 / 0.12)',
                    color: 'oklch(0.6 0.01 280)',
                    width: 70,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Autocomplete toggle */}
        {!isBuiltin && (
          <div>
            <FieldLabel label="Autocomplete" />
            <Switch
              checked={snippet.autocomplete.enabled}
              onChange={() =>
                onUpdate({
                  autocomplete: {
                    ...snippet.autocomplete,
                    enabled: !snippet.autocomplete.enabled,
                  },
                })
              }
              label="Show in / autocomplete"
            />
          </div>
        )}
      </div>
    </div>
  );
}
