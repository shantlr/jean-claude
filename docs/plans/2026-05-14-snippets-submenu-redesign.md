# Snippets Submenu Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat list + inline-expand snippets settings UI with a V1 "Rail + Detail" master/detail layout, matching the existing Skills settings pattern.

**Architecture:** Two-column layout inside the settings overlay. Left rail: snippet list grouped by Built-in/Custom with search filter and + button. Right detail pane: full snippet editor with name/description fields, Monaco template editor, grouped variable reference tree, live preview, context toggles (New task / New task step), slug chip editor, and usage metadata.

**Tech Stack:** React, Tailwind + inline oklch styles (matching settings shell aurora theme), existing `HandlebarsEditor` (Monaco), existing `usePromptSnippetsSetting` / `useUpdatePromptSnippetsSetting` hooks, `isBuiltinSnippet` utility, `resolveSnippetTemplate` for live preview.

---

## Design Reference

The design comes from a Claude Design handoff bundle. The chosen direction is **V1 "Rail + Detail"** — see `/tmp/jean-claude/project/snippets-views.jsx` (`SnippetsV1Rail` + `SnippetDetailV1`) and `/tmp/jean-claude/project/snippets-atoms.jsx` for the prototype components.

Key visual decisions from the design:
- Rail is ~280px wide, dark bg (`bg-black/[0.18]`), grouped by Built-in / Custom with uppercase mono group headers
- Rail rows: edge-to-edge (no rounded corners, no side gap), left accent border when active, Terminal icon, snippet name as primary label, dot indicator for built-in
- Detail pane: header with icon + name + built-in badge + duplicate/delete/toggle actions, name/desc fields in 2-col grid, template editor with line numbers + variables tree side panel (1fr 220px grid), live preview below, context toggles + slug chips at bottom, usage metadata footer
- Accent color: `oklch(0.78 0.18 295)` (purple), matching global settings accent

## Existing Code Map

| What | Where |
|------|-------|
| Current snippets settings | `src/features/settings/ui-prompt-snippets-settings/index.tsx` |
| Settings overlay (parent) | `src/features/settings/ui-settings-overlay/index.tsx` |
| Skills settings (reference layout) | `src/features/settings/ui-skills-settings/` |
| Snippet types | `shared/types.ts:677` (`PromptSnippet`) |
| Built-in snippets | `src/lib/builtin-snippets.ts` |
| Template resolver | `src/lib/resolve-snippet-template.ts` |
| Snippet hooks | `src/hooks/use-settings.ts:159` (`usePromptSnippetsSetting`, `useUpdatePromptSnippetsSetting`) |
| Monaco editor | `src/common/ui/handlebars-editor/index.tsx` |
| Skill row component (reference) | `src/features/settings/ui-skills-settings/skill-row.tsx` |
| Skill rail (reference layout) | `src/features/settings/ui-skills-settings/skill-rail.tsx` |
| Skill details (reference detail pane) | `src/features/settings/ui-skills-settings/skill-details.tsx` |

---

## Task 1: Create Snippet Rail Component

**Files:**
- Create: `src/features/settings/ui-prompt-snippets-settings/snippet-rail.tsx`

This component renders the left rail: header with title + count + add button, search input, and two grouped lists (Built-in / Custom). Follows the skills rail pattern but simpler (no browse mode, no resize handle).

**Step 1: Create the snippet rail file**

```tsx
import { Plus, Search, Terminal } from 'lucide-react';
import { useState } from 'react';

import type { PromptSnippet } from '@shared/types';

import { isBuiltinSnippet } from '@/lib/builtin-snippets';

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
      className="flex min-h-0 w-[280px] shrink-0 flex-col"
      style={{
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
          <Search
            size={12}
            style={{ color: 'oklch(0.5 0.01 280)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            className="flex-1 bg-transparent text-[12.5px] text-white placeholder-[oklch(0.5_0.01_280)] focus:outline-none"
            style={{ letterSpacing: '-0.005em' }}
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
            No snippets match "{search}"
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`
Expected: no errors in snippet-rail.tsx

**Step 3: Commit**

```bash
git add src/features/settings/ui-prompt-snippets-settings/snippet-rail.tsx
git commit -m "feat(snippets): add snippet rail component for master/detail layout"
```

---

## Task 2: Create Snippet Detail Pane Component

**Files:**
- Create: `src/features/settings/ui-prompt-snippets-settings/snippet-detail.tsx`

The right-side detail pane. Shows the full snippet editor when a snippet is selected. Built-in snippets are read-only (no edit on name/desc/template, no delete). Custom snippets are fully editable. Uses the existing `HandlebarsEditor` for the template field.

**Step 1: Create the snippet detail file**

The detail pane layout from the design:
1. **Header row**: Terminal icon + name + built-in badge (right side: duplicate btn, delete btn, enabled toggle)
2. **Name + Description**: 2-column grid with labeled text inputs
3. **Template + Variables**: 2-column grid (1fr 220px). Left: `HandlebarsEditor` with chrome header showing "template.hbs" + line count. Right: grouped variable reference tree with click-to-copy.
4. **Live Preview**: rendered template output using `resolveSnippetTemplate`
5. **Availability + Slugs**: 2-column grid. Left: context toggle checkboxes (New task / New task step). Right: slug chips with add/remove.
6. **Usage metadata footer**: last used + run count (only for custom snippets)

```tsx
import { Clock, Copy, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HandlebarsEditor } from '@/common/ui/handlebars-editor';
import { Switch } from '@/common/ui/switch';
import { isBuiltinSnippet } from '@/lib/builtin-snippets';
import {
  resolveSnippetTemplate,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import type { PromptSnippet } from '@shared/types';

const ACCENT = 'oklch(0.78 0.18 295)';

// Variable groups for the reference tree
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

// Sample context for live preview
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
      testCases: ['AC1: it works', 'AC2: no regressions'],
    },
  ],
};

function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span
        className="text-[11px] font-medium uppercase tracking-wide"
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
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-[7px] rounded-[5px] py-[5px] pr-2.5 pl-2 text-[11.5px] font-medium"
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
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="oklch(0.12 0 0)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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

function VarTree({ onInsert }: { onInsert?: (name: string) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      {VARIABLE_GROUPS.map((g) => (
        <div key={g.group}>
          <div
            className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] font-semibold uppercase"
            style={{
              color: 'oklch(0.5 0.01 280)',
              letterSpacing: '1px',
            }}
          >
            <span style={{ color: ACCENT }}>●</span>
            {g.group}
          </div>
          <div className="flex flex-col gap-px">
            {g.items.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => onInsert?.(v.name)}
                className="flex items-baseline gap-2 rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-white/[0.04]"
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
              </button>
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

  // Live preview
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
      <div className="flex flex-col gap-[18px] p-6">
        {/* ── Header ── */}
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

        {/* ── Name + Description fields ── */}
        {!isBuiltin && (
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <FieldLabel label="Name" />
              <input
                type="text"
                value={snippet.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="My Snippet"
                className="w-full rounded-md px-2.5 py-[7px] text-sm focus:outline-none"
                style={{
                  background: 'oklch(0 0 0 / 0.28)',
                  border: '1px solid oklch(1 0 0 / 0.07)',
                  color: 'oklch(0.95 0.008 280)',
                }}
              />
            </div>
            <div>
              <FieldLabel label="Description" hint="One line, helps you remember" />
              <input
                type="text"
                value={snippet.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Short description"
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

        {/* ── Template + Variables side-by-side ── */}
        <div
          className="grid items-start gap-3.5"
          style={{ gridTemplateColumns: '1fr 220px' }}
        >
          <div>
            <FieldLabel
              label="Template"
              hint={isBuiltin ? undefined : 'Handlebars syntax — type {{ to insert a variable'}
            />
            <div
              className="overflow-hidden rounded-[7px]"
              style={{
                background: 'oklch(0 0 0 / 0.35)',
                border: '1px solid oklch(1 0 0 / 0.08)',
              }}
            >
              {/* Editor chrome bar */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10.5px] uppercase"
                style={{
                  borderBottom: '1px solid oklch(1 0 0 / 0.05)',
                  color: 'oklch(0.55 0.01 280)',
                  background: 'oklch(0 0 0 / 0.25)',
                  letterSpacing: '0.08em',
                }}
              >
                <Terminal size={11} />
                template.hbs
                <div className="flex-1" />
                <span>
                  {(snippet.template.match(/\n/g) || []).length + 1} lines
                </span>
              </div>
              {/* Editor body */}
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
            <FieldLabel label="Variables" hint="click to insert" />
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

        {/* ── Live Preview ── */}
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

        {/* ── Availability + Slugs ── */}
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <FieldLabel label="Available in" hint="Where this snippet appears" />
            <div className="flex flex-wrap gap-1.5">
              <ContextToggle
                on={snippet.contexts.newTask}
                label="New task"
                onClick={() =>
                  !isBuiltin &&
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
                onClick={() =>
                  !isBuiltin &&
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

        {/* ── Autocomplete toggle ── */}
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
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/settings/ui-prompt-snippets-settings/snippet-detail.tsx
git commit -m "feat(snippets): add snippet detail pane with template editor, variables, preview"
```

---

## Task 3: Rewrite Main PromptSnippetsSettings with Rail + Detail Layout

**Files:**
- Modify: `src/features/settings/ui-prompt-snippets-settings/index.tsx` (full rewrite)
- Modify: `src/features/settings/ui-settings-overlay/index.tsx` (add 'prompt-snippets' to FILL_HEIGHT_SECTIONS)

Replace the flat list with the master/detail layout. Wire up rail selection, create/delete/update/duplicate operations.

**Step 1: Rewrite `index.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react';

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
    <div className="flex min-h-0 flex-1 border-t" style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}>
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
          <p
            className="text-sm"
            style={{ color: 'oklch(0.55 0.01 280)' }}
          >
            {snippets.length === 0
              ? 'No snippets yet. Click + to create one.'
              : 'Select a snippet to edit'}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update settings overlay to give snippets fill-height treatment**

In `src/features/settings/ui-settings-overlay/index.tsx`, the `FILL_HEIGHT_SECTIONS` array currently only has `'skills'`. Add `'prompt-snippets'` so the snippets layout gets the flex/no-padding treatment like skills:

```ts
// Change this line:
const FILL_HEIGHT_SECTIONS: GlobalMenuItem[] = ['skills'];
// To:
const FILL_HEIGHT_SECTIONS: GlobalMenuItem[] = ['skills', 'prompt-snippets'];
```

This ensures `PromptSnippetsSettings` gets `flex min-h-0 flex-1 flex-col` and `padding: 0` instead of being wrapped in a scrollable div with section header.

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: no errors

**Step 4: Run lint**

Run: `pnpm lint --fix`

**Step 5: Commit**

```bash
git add src/features/settings/ui-prompt-snippets-settings/index.tsx src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat(snippets): rewrite settings to rail+detail master/detail layout

Replace flat list + inline expand with two-column layout matching skills
settings pattern. Left rail with search/filter, right detail with
template editor, variable reference, live preview, context toggles,
and slug management."
```

---

## Task 4: Polish and Visual Alignment Pass

**Files:**
- Modify: `src/features/settings/ui-prompt-snippets-settings/snippet-rail.tsx` (potential tweaks)
- Modify: `src/features/settings/ui-prompt-snippets-settings/snippet-detail.tsx` (potential tweaks)

After the components are wired up and rendering, do a visual alignment pass:

**Step 1: Run lint and type checks**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 2: Fix any lint / type errors**

Address any issues found.

**Step 3: Review the design prototype for missed details**

Check against design atoms in `/tmp/jean-claude/project/snippets-atoms.jsx` and `/tmp/jean-claude/project/snippets-views.jsx`. Key items to verify:
- Rail row edge-to-edge with no rounded corners ✓
- Rail row shows snippet name (not slug) as primary label ✓
- Built-in indicator is a small dot, not text badge in rail ✓
- Detail header matches: Terminal icon + name + built-in badge ✓
- Template editor has chrome bar with "template.hbs" + line count ✓
- Variables tree is grouped with colored dot headers ✓
- Live preview has subtle gradient background ✓
- Context toggles are styled checkbox-label pills ✓
- Slug chips have leading slash ✓

**Step 4: Final commit**

```bash
git add -u
git commit -m "fix(snippets): visual polish pass for rail+detail layout"
```

---

## Notes for the Implementer

1. **The design uses inline styles heavily** — this codebase mixes Tailwind classes with inline `oklch()` styles for the aurora theme. Follow existing patterns in `ui-settings-overlay/index.tsx` and `ui-skills-settings/`.

2. **Built-in snippets are read-only** — disable all editing UI (name, description, template, slugs, contexts) for built-in snippets. The enabled toggle and duplicate button should still work.

3. **The `HandlebarsEditor` (Monaco)** already has `{{` autocomplete for variables. The variables tree in the detail pane is a visual reference, not a replacement for the Monaco autocomplete.

4. **The `resolveSnippetTemplate` function** uses real Handlebars compilation. The preview uses a hardcoded sample context — not a real task context (there's no active task in global settings).

5. **No resize handle on the snippet rail** — the skills rail has a resize handle stored in navigation store. The design doesn't show one for snippets; keep it simple with a fixed 280px width.

6. **Don't break existing consumers** — `usePromptSnippetsSetting` and `useUpdatePromptSnippetsSetting` stay unchanged. The `PromptSnippet` type is unchanged. Only the UI component changes.
