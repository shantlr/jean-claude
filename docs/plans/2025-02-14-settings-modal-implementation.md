# Settings Modal Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate the 3 separate settings entry points (header gear, sidebar footer link, project details page) into a single modal overlay with Global/Project tabs and sidebar menus.

**Architecture:** The settings modal is a new overlay type in the Zustand overlay store, rendered from `__root.tsx` like all other overlays. It contains two tabs (Global, conditional Project) each with a left sidebar menu and a right content area. Existing settings content components are extracted from route files and reused as-is inside the modal panels. Old routes are deleted.

**Tech Stack:** React, Zustand (overlays store), TanStack Router (cleanup only), lucide-react icons, Tailwind CSS, react-focus-lock, react-remove-scroll

---

### Task 1: Add `'settings'` to the overlay store

**Files:**
- Modify: `src/stores/overlays.ts`

**Step 1: Add the new overlay type**

In `src/stores/overlays.ts`, add `'settings'` to the `OverlayType` union:

```typescript
export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'background-jobs'
  | 'settings';
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add src/stores/overlays.ts
git commit -m "feat: add 'settings' overlay type to overlay store"
```

---

### Task 2: Extract `GeneralSettingsPanel` and `AutocompleteSettingsPanel` from route files

The general and autocomplete settings are currently defined inline in their route files. We need to extract them into standalone feature components so they can be rendered inside the modal.

**Files:**
- Create: `src/features/settings/ui-general-settings/index.tsx`
- Create: `src/features/settings/ui-autocomplete-settings/index.tsx`

**Step 1: Create `ui-general-settings/index.tsx`**

Move the full content of `GeneralSettingsPage`, `BackendsSettings`, and `ClaudeProjectsCleanup` from `src/routes/settings/general.tsx` into the new file. Export the top-level component as `GeneralSettings`:

```typescript
import { Check, FolderOpen, Search, Star, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import {
  useScanNonExistentProjects,
  useCleanupClaudeProjects,
} from '@/hooks/use-claude-projects-cleanup';
import {
  useBackendsSetting,
  useEditorSetting,
  useUpdateBackendsSetting,
  useUpdateEditorSetting,
  useAvailableEditors,
} from '@/hooks/use-settings';
import { api, type NonExistentClaudeProject } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { PRESET_EDITORS, type EditorSetting } from '@shared/types';

export function GeneralSettings() {
  // ... exact same implementation as GeneralSettingsPage from general.tsx
}

function BackendsSettings() {
  // ... exact same implementation
}

function ClaudeProjectsCleanup() {
  // ... exact same implementation
}
```

**Step 2: Create `ui-autocomplete-settings/index.tsx`**

Move the full content of `AutocompleteSettingsPage` from `src/routes/settings/autocomplete.tsx` into the new file. Export as `AutocompleteSettings`:

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCompletionSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';

export function AutocompleteSettings() {
  // ... exact same implementation as AutocompleteSettingsPage from autocomplete.tsx
}
```

**Step 3: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/settings/ui-general-settings/index.tsx src/features/settings/ui-autocomplete-settings/index.tsx
git commit -m "feat: extract general and autocomplete settings into standalone components"
```

---

### Task 3: Extract `ProjectSettingsPanel` from the details route

The project details page has inline logic for form state, save, delete. Extract it into a feature component that accepts a `projectId` prop.

**Files:**
- Create: `src/features/project/ui-project-settings/index.tsx`

**Step 1: Create the component**

Move the content from `src/routes/projects/$projectId/details.tsx` into a new component. Key changes:
- Accept `projectId` as a prop instead of reading from route params
- Accept an `onClose` callback for after-delete navigation (close the modal)
- Remove the `<ArrowLeft> Back to tasks` button (not needed in modal context)
- Remove the `<h1>Project Settings</h1>` heading (the modal tab already provides context)
- Keep all form state, save, delete logic intact

```typescript
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { RepoLink } from '@/features/project/ui-repo-link';
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';
import {
  useProject,
  useProjectBranches,
  useUpdateProject,
  useDeleteProject,
} from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import { PROJECT_COLORS } from '@/lib/colors';
import { useNavigationStore } from '@/stores/navigation';
import type { AgentBackendType } from '@shared/agent-backend-types';

export function ProjectSettings({
  projectId,
  onProjectDeleted,
}: {
  projectId: string;
  onProjectDeleted: () => void;
}) {
  const { data: project } = useProject(projectId);
  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const clearProjectNavHistoryState = useNavigationStore(
    (s) => s.clearProjectNavHistoryState,
  );

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [defaultAgentBackend, setDefaultAgentBackend] =
    useState<AgentBackendType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: backendsSetting } = useBackendsSetting();
  const enabledBackends = useMemo(
    () =>
      AVAILABLE_BACKENDS.filter((b) =>
        (backendsSetting?.enabledBackends ?? ['claude-code']).includes(b.value),
      ),
    [backendsSetting],
  );

  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color);
      setDefaultBranch(project.defaultBranch ?? '');
      setDefaultAgentBackend(project.defaultAgentBackend);
    }
  }, [project]);

  useEffect(() => {
    if (branches && branches.length > 0 && !defaultBranch) {
      const initial =
        project?.defaultBranch ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setDefaultBranch(initial);
    }
  }, [branches, project?.defaultBranch, defaultBranch]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  async function handleSave() {
    await updateProject.mutateAsync({
      id: projectId,
      data: {
        name,
        color,
        defaultBranch: defaultBranch || null,
        defaultAgentBackend,
      },
    });
  }

  async function handleDelete() {
    clearProjectNavHistoryState(projectId);
    await deleteProject.mutateAsync(projectId);
    onProjectDeleted();
  }

  const hasChanges =
    name !== project.name ||
    color !== project.color ||
    defaultBranch !== (project.defaultBranch ?? '') ||
    defaultAgentBackend !== project.defaultAgentBackend;

  return (
    <div className="space-y-6">
      {/* Same form fields as details.tsx but without the back button and h1 */}
      {/* Name, Path, Type, Color, Default Branch, Default Agent Backend */}
      {/* Save button */}
      {/* Integrations section: RepoLink, WorkItemsLink */}
      {/* Run Commands */}
      {/* MCP Server Templates */}
      {/* Danger Zone */}
    </div>
  );
}
```

The component body is a direct copy of the JSX from `details.tsx` lines 126-328, minus the back button (lines 113-122) and h1 (line 124), and with `navigate({ to: '/' })` in handleDelete replaced with `onProjectDeleted()`.

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/project/ui-project-settings/index.tsx
git commit -m "feat: extract project settings into standalone component"
```

---

### Task 4: Create the settings overlay component

This is the main new component: the modal with tabs, sidebar menu, and content area.

**Files:**
- Create: `src/features/settings/ui-settings-overlay/index.tsx`

**Step 1: Create the overlay component**

```typescript
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { AutocompleteSettings } from '@/features/settings/ui-autocomplete-settings';
import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';
import { DebugDatabase } from '@/features/settings/ui-debug-database';
import { GeneralSettings } from '@/features/settings/ui-general-settings';
import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';
import { TokensTab } from '@/features/settings/ui-tokens-tab';
import { ProjectSettings } from '@/features/project/ui-project-settings';
import { useProjects } from '@/hooks/use-projects';
import { useCurrentVisibleProject } from '@/stores/navigation';

type SettingsTab = 'global' | 'project';

const GLOBAL_MENU_ITEMS = [
  { id: 'general', label: 'General' },
  { id: 'mcp-servers', label: 'MCP Servers' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'azure-devops', label: 'Azure DevOps' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'debug', label: 'Debug' },
] as const;

const PROJECT_MENU_ITEMS = [
  { id: 'details', label: 'Details' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'run-commands', label: 'Run Commands' },
  { id: 'mcp-overrides', label: 'MCP Overrides' },
  { id: 'danger-zone', label: 'Danger Zone' },
] as const;

type GlobalMenuItem = (typeof GLOBAL_MENU_ITEMS)[number]['id'];
type ProjectMenuItem = (typeof PROJECT_MENU_ITEMS)[number]['id'];

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const { projectId } = useCurrentVisibleProject();
  const { data: projects = [] } = useProjects();
  const currentProject =
    projectId !== 'all'
      ? projects.find((p) => p.id === projectId) ?? null
      : null;

  const [activeTab, setActiveTab] = useState<SettingsTab>('global');
  const [globalMenuItem, setGlobalMenuItem] = useState<GlobalMenuItem>('general');
  const [projectMenuItem, setProjectMenuItem] = useState<ProjectMenuItem>('details');

  // Register Escape to close
  useRegisterKeyboardBindings('settings-overlay', {
    escape: () => {
      onClose();
      return true;
    },
  });

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
  }, []);

  const handleProjectDeleted = useCallback(() => {
    // Switch back to global tab after project deletion
    setActiveTab('global');
    onClose();
  }, [onClose]);

  const menuItems = activeTab === 'global' ? GLOBAL_MENU_ITEMS : PROJECT_MENU_ITEMS;
  const activeMenuItem = activeTab === 'global' ? globalMenuItem : projectMenuItem;
  const setActiveMenuItem = activeTab === 'global'
    ? (id: string) => setGlobalMenuItem(id as GlobalMenuItem)
    : (id: string) => setProjectMenuItem(id as ProjectMenuItem);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={onClose}
        >
          {/* Modal panel */}
          <div
            className="flex h-[80vh] w-[80vw] max-w-[1100px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tab bar with back arrow */}
            <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>

              <div className="flex gap-1">
                <button
                  onClick={() => handleTabChange('global')}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    activeTab === 'global'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                  )}
                >
                  Global
                </button>
                {currentProject && (
                  <button
                    onClick={() => handleTabChange('project')}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      activeTab === 'project'
                        ? 'bg-neutral-700 text-neutral-100'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                    )}
                  >
                    Project: {currentProject.name}
                  </button>
                )}
              </div>
            </div>

            {/* Body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              {/* Sidebar menu */}
              <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-neutral-700 p-3">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveMenuItem(item.id)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                      activeMenuItem === item.id
                        ? 'bg-neutral-700 text-neutral-100 font-medium'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto p-6">
                <SettingsContent
                  tab={activeTab}
                  menuItem={activeMenuItem}
                  projectId={currentProject?.id ?? null}
                  onProjectDeleted={handleProjectDeleted}
                />
              </div>
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}

function SettingsContent({
  tab,
  menuItem,
  projectId,
  onProjectDeleted,
}: {
  tab: SettingsTab;
  menuItem: string;
  projectId: string | null;
  onProjectDeleted: () => void;
}) {
  if (tab === 'global') {
    switch (menuItem) {
      case 'general':
        return <GeneralSettings />;
      case 'mcp-servers':
        return <McpServersSettings />;
      case 'tokens':
        return <TokensTab />;
      case 'azure-devops':
        return <AzureDevOpsTab />;
      case 'autocomplete':
        return <AutocompleteSettings />;
      case 'debug':
        return <DebugDatabase />;
      default:
        return null;
    }
  }

  if (tab === 'project' && projectId) {
    // Project settings - the ProjectSettings component handles all sections internally
    // For now, render the full project settings. If needed, we can split by menuItem later.
    return (
      <ProjectSettings
        projectId={projectId}
        onProjectDeleted={onProjectDeleted}
      />
    );
  }

  return null;
}
```

**Important note on Project tab menu items:** The project details page is currently a single scrollable form. Rather than immediately splitting it into 5 separate sections (details, integrations, run commands, mcp, danger zone), render `<ProjectSettings>` as a single scrollable component and use the sidebar menu items to scroll to the corresponding section. Use `id` attributes on section headings and `scrollIntoView()` on menu item click. This avoids fragmenting the existing component. Add `id` attributes to each section in `ProjectSettings`:

```typescript
// In ProjectSettings, add id attributes to section headings:
<div id="project-details">...</div>
<div id="project-integrations">...</div>
<div id="project-run-commands">...</div>
<div id="project-mcp-overrides">...</div>
<div id="project-danger-zone">...</div>
```

And in the sidebar menu click handler, scroll to the section:

```typescript
const setActiveMenuItem = activeTab === 'global'
  ? (id: string) => setGlobalMenuItem(id as GlobalMenuItem)
  : (id: string) => {
      setProjectMenuItem(id as ProjectMenuItem);
      // Scroll to section
      const sectionId = `project-${id}`;
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    };
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat: create settings overlay component with tabs and sidebar menu"
```

---

### Task 5: Wire up the settings overlay in `__root.tsx`

**Files:**
- Modify: `src/routes/__root.tsx`

**Step 1: Add `SettingsContainer` and update `GlobalCommands`**

Add a new `SettingsContainer` function following the exact same pattern as `CommandPaletteContainer`, `BackgroundJobsContainer`, etc. Also update `GlobalCommands` to toggle the overlay instead of navigating:

```typescript
// New import at top:
import { SettingsOverlay } from '@/features/settings/ui-settings-overlay';

// Replace GlobalCommands (lines 89-102) with:
function GlobalCommands() {
  const toggle = useOverlaysStore((s) => s.toggle);

  useCommands('global-commands', [
    {
      label: 'Settings',
      shortcut: 'cmd+,',
      handler: () => {
        toggle('settings');
      },
    },
  ]);
  return null;
}

// Add new SettingsContainer function:
function SettingsContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'settings');
  const close = useOverlaysStore((s) => s.close);

  if (!isOpen) return null;
  return <SettingsOverlay onClose={() => close('settings')} />;
}
```

**Step 2: Add `<SettingsContainer />` to `RootLayout`**

In the `RootLayout` function (line 174), add `<SettingsContainer />` in the overlay containers section:

```typescript
{/* Overlay containers */}
<NewTaskContainer />
<CommandPaletteContainer />
<ProjectOverlayContainer />
<BackgroundJobsContainer />
<SettingsContainer />
```

**Step 3: Remove `useNavigate` import if no longer needed**

Check if `useNavigate` is still used in this file after the `GlobalCommands` change. If not, remove it from the imports on line 4.

Note: `useNavigate` is NOT used anywhere else in this file — it was only used in `GlobalCommands` and `NotFoundRedirect`. `NotFoundRedirect` uses it, so keep the import.

**Step 4: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: wire settings overlay into root layout with cmd+, shortcut"
```

---

### Task 6: Replace sidebar footer with settings button

**Files:**
- Modify: `src/features/task/ui-task-list/index.tsx`

**Step 1: Update imports**

Replace `Settings` icon import with `SlidersHorizontal` and add `useOverlaysStore`:

```typescript
// Change:
import { ChevronDown, Settings } from 'lucide-react';
// To:
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

// Add:
import { useOverlaysStore } from '@/stores/overlays';
```

**Step 2: Add overlay toggle hook inside `TaskList`**

Near the top of the `TaskList` component, add:

```typescript
const toggleSettings = useOverlaysStore((s) => s.toggle);
```

**Step 3: Replace the sidebar footer**

Replace the current footer section (lines 303-318) — the `selectedProject && (...)` block — with a settings button that is always visible:

```typescript
{/* Settings button */}
<div className="mx-2 border-t border-neutral-800" />
<div className="flex items-center gap-1 p-2">
  <button
    onClick={() => toggleSettings('settings')}
    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
  >
    <SlidersHorizontal size={14} />
    <span>Settings</span>
  </button>
</div>
```

**Step 4: Update the "Open Project Settings" command**

Update the command at lines 223-231 to open the settings overlay on the project tab instead of navigating:

```typescript
!!selectedProject && {
  label: 'Open Project Settings',
  handler: () => {
    toggleSettings('settings');
    // The overlay will detect the current project and show the Project tab
  },
},
```

**Step 5: Remove unused imports**

After the changes:
- `Link` may no longer be needed if nothing else in this file uses it. Check: `Link` is used in `TaskSummaryCard` — but `TaskSummaryCard` is imported, not defined here. `Link` is imported on line 1 but used by `useNavigate` and the sidebar footer link. After removing the footer link, check if `Link` is still used elsewhere in this component. Looking at the code: `Link` is imported but only used in the old footer. Remove it from imports if unused.
- `Settings` icon import — already removed in step 1.

**Step 6: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 7: Commit**

```bash
git add src/features/task/ui-task-list/index.tsx
git commit -m "feat: replace sidebar footer with settings overlay button"
```

---

### Task 7: Remove the header settings button

**Files:**
- Modify: `src/layout/ui-header/index.tsx`

**Step 1: Remove the settings button block**

Delete lines 69-80 (the settings button section):

```typescript
// DELETE this entire block:
{/* Settings button */}
<div
  className="pl-2"
  style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
>
  <Link
    to="/settings"
    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
  >
    <Settings size={16} />
  </Link>
</div>
```

**Step 2: Remove unused imports**

- Remove `Link` from TanStack Router imports (line 1) — check if it's used elsewhere in this file. It is NOT used elsewhere. Remove it.
- Remove `Settings` from lucide-react imports (line 2).

After cleanup, the imports should be:

```typescript
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { useProjects } from '@/hooks/use-projects';
import { api } from '@/lib/api';
import {
  getRunningJobsCount,
  useBackgroundJobsStore,
} from '@/stores/background-jobs';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';

import { UsageDisplay } from './usage-display';
```

**Step 3: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/layout/ui-header/index.tsx
git commit -m "feat: remove settings gear icon from header"
```

---

### Task 8: Delete old settings routes

**Files:**
- Delete: `src/routes/settings.tsx`
- Delete: `src/routes/settings/index.tsx`
- Delete: `src/routes/settings/general.tsx`
- Delete: `src/routes/settings/mcp-servers.tsx`
- Delete: `src/routes/settings/tokens.tsx`
- Delete: `src/routes/settings/azure-devops.tsx`
- Delete: `src/routes/settings/autocomplete.tsx`
- Delete: `src/routes/settings/debug.tsx`
- Delete: `src/routes/projects/$projectId/details.tsx`

**Step 1: Delete all settings route files**

```bash
rm src/routes/settings.tsx
rm src/routes/settings/index.tsx
rm src/routes/settings/general.tsx
rm src/routes/settings/mcp-servers.tsx
rm src/routes/settings/tokens.tsx
rm src/routes/settings/azure-devops.tsx
rm src/routes/settings/autocomplete.tsx
rm src/routes/settings/debug.tsx
rm src/routes/projects/\$projectId/details.tsx
```

**Step 2: Remove the empty settings directory**

```bash
rmdir src/routes/settings
```

**Step 3: Check for remaining references to old routes**

Search for any remaining references to `/settings` or `/projects/$projectId/details` in the codebase:

```bash
grep -r "'/settings" src/ --include="*.tsx" --include="*.ts" -l
grep -r "details'" src/routes/ --include="*.tsx" --include="*.ts" -l
```

Fix any remaining references found. Common locations:
- Navigation store's last location tracking may have old routes saved — this is persisted state and will just redirect via `NotFoundRedirect` if hit

**Step 4: Regenerate the TanStack Router route tree**

Run: `pnpm dev` briefly or check if there's a route generation command. TanStack Router with file-based routing auto-generates a `routeTree.gen.ts`. The dev server should regenerate this. Alternatively:

Run: `pnpm ts-check`
Expected: May fail if route tree references deleted files. If so, run `pnpm dev` to regenerate routes, then Ctrl+C.

**Step 5: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove old settings and project details routes"
```

---

### Task 9: Run lint and final verification

**Files:** None (verification only)

**Step 1: Run linter with auto-fix**

Run: `pnpm lint --fix`
Expected: PASS or minor auto-fixable issues

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS (no type errors)

**Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for settings modal refactor"
```
