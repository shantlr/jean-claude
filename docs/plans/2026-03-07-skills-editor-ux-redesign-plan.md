# Skills Editor UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the cramped 384px side-pane skill editor with a full-page split editor (markdown textarea + live preview), while simplifying the right pane to a read-only preview with an Edit button.

**Architecture:** The `SkillsSettings` component gains an `editingSkillPath` state that toggles between two views: (1) the existing card grid + a simplified read-only preview pane, and (2) a new full-page `SkillEditor` component with resizable split panes. The same pattern is applied to `ProjectSkillsSettings`. The existing `SkillForm` component is removed.

**Tech Stack:** React, TailwindCSS, `useHorizontalResize` hook, `MarkdownContent` component, existing `use-managed-skills` hooks.

---

### Task 1: Create the `SkillEditor` component

**Files:**
- Create: `src/features/settings/ui-skills-settings/skill-editor.tsx`

**Step 1: Create the full-page editor component**

This is the core new component. It replaces the entire skills settings content area when active.

```tsx
// src/features/settings/ui-skills-settings/skill-editor.tsx
import { ArrowLeft } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  useCreateSkill,
  useSkillContent,
  useUpdateSkill,
} from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

export function SkillEditor({
  skillPath,
  enabledBackends,
  scope,
  projectPath,
  onClose,
  onSaved,
}: {
  skillPath?: string;
  enabledBackends?: AgentBackendType[];
  scope: SkillScope;
  projectPath?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!skillPath;
  const { data: existing } = useSkillContent(skillPath ?? null);
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [formEnabledBackends, setFormEnabledBackends] = useState<
    AgentBackendType[]
  >(enabledBackends ?? ['claude-code', 'opencode']);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Resizable split state — store left panel width in pixels
  const [leftWidth, setLeftWidth] = useState(0);
  const containerRef2 = useRef<HTMLDivElement>(null);

  // Initialize to 50% on mount
  useEffect(() => {
    if (containerRef2.current && leftWidth === 0) {
      setLeftWidth(containerRef2.current.offsetWidth / 2);
    }
  }, [leftWidth]);

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: leftWidth,
    minWidth: 300,
    maxWidthFraction: 0.7,
    onWidthChange: setLeftWidth,
  });

  // Load existing skill data
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description);
      setContent(existing.content);
    }
  }, [existing]);

  // Track unsaved changes
  useEffect(() => {
    if (!isEditing) {
      // For new skills, any content counts as unsaved
      setHasUnsavedChanges(
        name.trim().length > 0 || description.trim().length > 0 || content.trim().length > 0,
      );
    } else if (existing) {
      setHasUnsavedChanges(
        name !== existing.name ||
          description !== existing.description ||
          content !== existing.content,
      );
    }
  }, [name, description, content, existing, isEditing]);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to go back?',
      );
      if (!confirmed) return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  const handleSave = async () => {
    if (!isEditing && formEnabledBackends.length === 0) return;
    try {
      if (isEditing && skillPath) {
        await updateSkill.mutateAsync({
          skillPath,
          backendType: enabledBackends?.[0] ?? 'claude-code',
          name,
          description,
          content,
        });
      } else {
        await createSkill.mutateAsync({
          enabledBackends: formEnabledBackends,
          scope,
          projectPath,
          name,
          description,
          content,
        });
      }
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save skill';
      addToast({ message, type: 'error' });
    }
  };

  const isValid =
    name.trim().length > 0 && (isEditing || formEnabledBackends.length > 0);
  const isPending = createSkill.isPending || updateSkill.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="cursor-pointer rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Back to skills"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-neutral-200">
            {isEditing ? `Edit "${name || '...'}"` : 'New Skill'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || isPending}
            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Metadata row */}
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., my-custom-skill"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[200px] flex-[2]">
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of what this skill does"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        {!isEditing && (
          <div className="flex items-center gap-3 pb-0.5">
            {(['claude-code', 'opencode'] as AgentBackendType[]).map(
              (backend) => (
                <label
                  key={backend}
                  className="flex items-center gap-1.5 text-sm text-neutral-200"
                >
                  <input
                    type="checkbox"
                    checked={formEnabledBackends.includes(backend)}
                    onChange={(e) => {
                      setFormEnabledBackends((prev) =>
                        e.target.checked
                          ? [...prev, backend]
                          : prev.filter((b) => b !== backend),
                      );
                    }}
                    className="rounded border-neutral-600 bg-neutral-800"
                  />
                  {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}
                </label>
              ),
            )}
          </div>
        )}
      </div>

      {/* Split editor + preview */}
      <div
        ref={(node) => {
          // Merge refs for both containerRef (from useHorizontalResize) and containerRef2 (for initial sizing)
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          (containerRef2 as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-700"
      >
        {/* Editor pane */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: leftWidth || '50%' }}
        >
          <div className="border-b border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase">
            Editor
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the skill instructions in Markdown..."
            className="flex-1 resize-none bg-neutral-900/60 p-3 font-mono text-sm leading-relaxed text-neutral-200 placeholder-neutral-600 focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown as (e: ReactMouseEvent<HTMLDivElement>) => void}
          className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
            isDragging ? 'bg-blue-500' : 'bg-neutral-700 hover:bg-neutral-500'
          }`}
        />

        {/* Preview pane */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase">
            Preview
          </div>
          <div className="flex-1 overflow-auto bg-neutral-900/30 p-4 text-sm text-neutral-200">
            {content.trim() ? (
              <MarkdownContent content={content} />
            ) : (
              <p className="text-neutral-600 italic">
                Start typing to see preview...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

---

### Task 2: Update `SkillDetails` to show rendered markdown and Edit button

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-details.tsx`

**Step 1: Replace `<pre>` with `MarkdownContent` and add an Edit button**

Replace the entire `skill-details.tsx` with:

```tsx
import { Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { useSkillContent } from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

function getSourceLabel(skill: ManagedSkill): string {
  if (skill.source === 'plugin') {
    return skill.pluginName ? `Plugin (${skill.pluginName})` : 'Plugin';
  }
  if (skill.source === 'user') {
    return 'User';
  }
  return 'Project';
}

export function SkillDetails({
  skill,
  onClose,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  skill: ManagedSkill;
  onClose: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => void;
  onDelete?: (skillPath: string) => void;
}) {
  const { data, isLoading, error } = useSkillContent(skill.skillPath);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          Skill Details
        </h3>
        <div className="flex items-center gap-1">
          {onEdit && skill.editable && (
            <button
              type="button"
              onClick={onEdit}
              className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-blue-400"
              title="Edit skill"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete &&
            skill.editable &&
            (confirmingDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(skill.skillPath);
                  setConfirmingDelete(false);
                }}
                onBlur={() => setConfirmingDelete(false)}
                className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-700 hover:bg-red-900/30"
                autoFocus
              >
                Delete?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                title="Delete skill"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        {/* Skill info card */}
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-sm">
          <div className="text-base font-medium text-neutral-100">
            {skill.name}
          </div>
          <div className="mt-1 text-neutral-400">
            {skill.description || 'No description provided.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-neutral-700 px-2 py-1 text-neutral-300">
              {getSourceLabel(skill)}
            </span>
            {onToggleEnabled && skill.editable
              ? Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <button
                      key={backend}
                      type="button"
                      onClick={() =>
                        onToggleEnabled(skill, backend as AgentBackendType)
                      }
                      className={`cursor-pointer rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50'
                            : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                          : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </button>
                  ),
                )
              : Object.entries(skill.enabledBackends).map(
                  ([backend, enabled]) => (
                    <span
                      key={backend}
                      className={`rounded px-2 py-1 ${
                        enabled
                          ? backend === 'claude-code'
                            ? 'bg-orange-900/30 text-orange-400'
                            : 'bg-blue-900/30 text-blue-400'
                          : 'bg-neutral-700 text-neutral-400'
                      }`}
                    >
                      {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}:{' '}
                      {enabled ? 'On' : 'Off'}
                    </span>
                  ),
                )}
          </div>
          <div className="mt-3 text-xs break-all text-neutral-500">
            {skill.skillPath}
          </div>
        </div>

        {/* Skill content — rendered markdown */}
        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">
            Skill Content
          </div>
          {isLoading && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3 text-sm text-neutral-400">
              Loading content...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
              Failed to load skill content.
            </div>
          )}
          {!isLoading && !error && (
            <div className="overflow-auto rounded-lg border border-neutral-700 bg-neutral-900/60 p-3 text-sm text-neutral-200">
              {data?.content ? (
                <MarkdownContent content={data.content} />
              ) : (
                <p className="text-neutral-500 italic">No content found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Key changes from original:
- Added `Pencil` icon import and `onEdit` prop
- Edit button in header (only for editable skills)
- Replaced `<pre>` with `<MarkdownContent content={data.content} />`
- Changed container from `space-y-4 overflow-y-auto` to `min-h-0 flex-1 space-y-4 overflow-y-auto` to ensure proper scrolling within the pane

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

---

### Task 3: Update `SkillsSettings` (global) to use editor view

**Files:**
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Add editor state and swap between list/editor views**

Replace the entire `index.tsx` with:

```tsx
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useAllManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

import { LegacySkillMigrationDialog } from './legacy-skill-migration-dialog';
import { SkillCardGrid } from './skill-card-grid';
import { SkillDetails } from './skill-details';
import { SkillEditor } from './skill-editor';

export function SkillsSettings() {
  const { data: skills, isLoading } = useAllManagedSkills();
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);
  const editingSkill =
    editingPath && editingPath !== 'new'
      ? skills?.find((s) => s.skillPath === editingPath)
      : undefined;

  const { mySkills, installedSkills } = useMemo(() => {
    const my = (skills ?? []).filter((s) => s.editable);
    const installed = (skills ?? []).filter((s) => !s.editable);
    return { mySkills: my, installedSkills: installed };
  }, [skills]);

  const handleCreate = () => {
    setSelectedPath(null);
    setEditingPath('new');
  };

  const handleSelect = (skillPath: string) => {
    setSelectedPath(skillPath);
  };

  const handleEdit = (skillPath: string) => {
    setEditingPath(skillPath);
  };

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    const backendType =
      (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ??
      'claude-code';
    await deleteSkill.mutateAsync({ skillPath, backendType });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (
    skill: ManagedSkill,
    backendType: AgentBackendType,
  ) => {
    const isEnabled = skill.enabledBackends[backendType];
    if (isEnabled) {
      await disableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType,
      });
    } else {
      await enableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType,
      });
    }
  };

  const handleClosePreview = () => {
    setSelectedPath(null);
  };

  const handleEditorClose = () => {
    setEditingPath(null);
  };

  const handleEditorSaved = () => {
    setEditingPath(null);
    setSelectedPath(null);
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  // Full-page editor view
  if (editingPath !== null) {
    return (
      <SkillEditor
        skillPath={editingPath !== 'new' ? editingPath : undefined}
        enabledBackends={
          editingSkill
            ? Object.entries(editingSkill.enabledBackends)
                .filter(([, v]) => v)
                .map(([k]) => k as AgentBackendType)
            : undefined
        }
        scope="user"
        onClose={handleEditorClose}
        onSaved={handleEditorSaved}
      />
    );
  }

  // Card grid + preview pane view
  return (
    <div className="flex h-full gap-6">
      {/* Left: Card Grid */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMigrationDialog(true)}
              className="cursor-pointer rounded-lg border border-neutral-600 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
            >
              Migrate Legacy Skills
            </button>
            <button
              onClick={handleCreate}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {mySkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-green-400 uppercase">
                My Skills
              </h3>
              <SkillCardGrid
                skills={mySkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
                onToggleBackend={handleToggleEnabled}
              />
            </div>
          )}

          {installedSkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Installed Skills
              </h3>
              <SkillCardGrid
                skills={installedSkills}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            </div>
          )}

          {mySkills.length === 0 && installedSkills.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              No skills found. Click &quot;Add&quot; to create one.
            </p>
          )}
        </div>
      </div>

      {/* Right: Preview pane (read-only) */}
      {selectedSkill && (
        <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          <SkillDetails
            skill={selectedSkill}
            onClose={handleClosePreview}
            onEdit={
              selectedSkill.editable
                ? () => handleEdit(selectedSkill.skillPath)
                : undefined
            }
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
          />
        </div>
      )}

      {showMigrationDialog && (
        <LegacySkillMigrationDialog
          onClose={() => setShowMigrationDialog(false)}
        />
      )}
    </div>
  );
}
```

Key changes from original:
- Removed `isCreating` state, replaced with `editingPath` (`null | string | 'new'`)
- Removed `SkillForm` import — no longer used
- When `editingPath !== null`, renders `<SkillEditor>` instead of the card grid layout
- Right pane now always shows `<SkillDetails>` (never `<SkillForm>`)
- `SkillDetails` receives `onEdit` callback to transition to editor view

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

---

### Task 4: Update `ProjectSkillsSettings` to use editor view

**Files:**
- Modify: `src/features/project/ui-project-skills-settings/index.tsx`

**Step 1: Apply the same pattern as global settings**

Replace the entire file with:

```tsx
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SkillCardGrid } from '@/features/settings/ui-skills-settings/skill-card-grid';
import { SkillDetails } from '@/features/settings/ui-skills-settings/skill-details';
import { SkillEditor } from '@/features/settings/ui-skills-settings/skill-editor';
import {
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
  useManagedSkills,
} from '@/hooks/use-managed-skills';
import { useProject } from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

export function ProjectSkillsSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: backendsSetting } = useBackendsSetting();

  const backendType: AgentBackendType =
    project?.defaultAgentBackend ??
    backendsSetting?.defaultBackend ??
    'claude-code';

  const { data: skills, isLoading } = useManagedSkills(
    backendType,
    project?.path,
  );
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null | 'new'>(null);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);
  const editingSkill =
    editingPath && editingPath !== 'new'
      ? skills?.find((s) => s.skillPath === editingPath)
      : undefined;

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    const bt =
      (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ??
      'claude-code';
    await deleteSkill.mutateAsync({ skillPath, backendType: bt });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (
    skill: ManagedSkill,
    bt: AgentBackendType,
  ) => {
    const isEnabled = skill.enabledBackends[bt];
    if (isEnabled) {
      await disableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: bt,
      });
    } else {
      await enableSkill.mutateAsync({
        skillPath: skill.skillPath,
        backendType: bt,
      });
    }
  };

  const { projectSkills, inheritedSkills } = useMemo(() => {
    const proj = (skills ?? []).filter((s) => s.source === 'project');
    const inherited = (skills ?? []).filter((s) => s.source !== 'project');
    return { projectSkills: proj, inheritedSkills: inherited };
  }, [skills]);

  if (isLoading || !project) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  // Full-page editor view
  if (editingPath !== null) {
    return (
      <SkillEditor
        skillPath={editingPath !== 'new' ? editingPath : undefined}
        enabledBackends={
          editingSkill
            ? Object.entries(editingSkill.enabledBackends)
                .filter(([, v]) => v)
                .map(([k]) => k as AgentBackendType)
            : [backendType]
        }
        scope="project"
        projectPath={project.path}
        onClose={() => setEditingPath(null)}
        onSaved={() => {
          setEditingPath(null);
          setSelectedPath(null);
        }}
      />
    );
  }

  // Card grid + preview pane view
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <p className="text-xs text-neutral-500">
            Manage skills for this project&apos;s {backendType} backend
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedPath(null);
            setEditingPath('new');
          }}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          <Plus className="h-4 w-4" />
          Add Project Skill
        </button>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-green-400 uppercase">
              Project Skills
            </h3>
            <SkillCardGrid
              skills={projectSkills}
              selectedPath={selectedPath}
              onSelect={(p) => setSelectedPath(p)}
            />
          </div>

          {inheritedSkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Inherited (user &amp; plugins)
              </h3>
              <SkillCardGrid
                skills={inheritedSkills}
                selectedPath={selectedPath}
                onSelect={(p) => setSelectedPath(p)}
                onToggleBackend={handleToggleEnabled}
              />
            </div>
          )}
        </div>

        {selectedSkill && (
          <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
            <SkillDetails
              skill={selectedSkill}
              onClose={() => setSelectedPath(null)}
              onEdit={
                selectedSkill.editable
                  ? () => setEditingPath(selectedSkill.skillPath)
                  : undefined
              }
              onToggleEnabled={handleToggleEnabled}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

Key changes from original:
- Removed `isCreating` state, replaced with `editingPath`
- Removed `SkillForm` import
- When `editingPath !== null`, renders `<SkillEditor>` full-page
- Right pane always shows `<SkillDetails>` with `onEdit` prop

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

---

### Task 5: Delete the old `SkillForm` component

**Files:**
- Delete: `src/features/settings/ui-skills-settings/skill-form.tsx`

**Step 1: Delete the file**

```bash
rm src/features/settings/ui-skills-settings/skill-form.tsx
```

**Step 2: Verify no remaining imports**

Search for any remaining imports of `skill-form` or `SkillForm`:

```bash
grep -r "skill-form\|SkillForm" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results (all usages were removed in Tasks 3 and 4).

**Step 3: Run lint and type check**

```bash
pnpm lint --fix
pnpm ts-check
pnpm lint
```

---

### Task 6: Final verification

**Step 1: Run full lint and type check**

```bash
pnpm install
pnpm lint --fix
pnpm ts-check
pnpm lint
```

Expected: All pass with no errors.
