# Add Project Grid Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the Add Project source-selection view into a fixed-height page where a 3-column detected-projects grid scrolls independently, and the Local Folder / Clone Azure DevOps buttons live in the header.

**Architecture:** Single-file change — `src/routes/projects/new.tsx`. The page wrapper becomes `flex flex-col overflow-hidden` (no page scroll). The header uses `flex justify-between` to place action buttons inline with the title. The detected-projects area becomes `min-h-0 flex-1 overflow-y-auto` wrapping a `grid grid-cols-3`. Cards are vertical flex stacks with fixed `h-[88px]` for grid consistency.

**Tech Stack:** React, TailwindCSS, TanStack Query, lucide-react

---

## Reference Files

Skim before starting:
- `src/routes/projects/new.tsx` — full file to rewrite (current: 343 lines)
- `docs/plans/2026-02-28-add-project-grid-layout-design.md` — approved design doc

---

### Task 1: Replace `src/routes/projects/new.tsx`

**Files:**
- Modify: `src/routes/projects/new.tsx`

This is a full replacement of the source-selection view. The form state (`pageState === 'form'`) and all event handlers are **preserved unchanged** — only the source-selection JSX and outer layout are rewritten.

**Step 1: Replace the entire file with the following**

```tsx
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Folder, FolderOpen, Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import {
  AddProjectForm,
  type ProjectFormData,
} from '@/features/project/ui-add-project-form';
import {
  CloneRepoPane,
  type CloneResult,
} from '@/features/project/ui-clone-repo-pane';
import { useCreateProject } from '@/hooks/use-projects';
import { api, type DetectedProject } from '@/lib/api';
import { getRandomColor } from '@/lib/colors';

export const Route = createFileRoute('/projects/new')({
  component: AddProjectPage,
});

type PageState = 'source-selection' | 'form';

// Badge config defined once at module level — not recreated on every render
const SOURCE_BADGE_CONFIG: Record<
  string,
  { className: string; label: string }
> = {
  'claude-code': {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400',
    label: 'Claude Code',
  },
  opencode: {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/15 text-teal-400',
    label: 'OpenCode',
  },
  codex: {
    className:
      'rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-400',
    label: 'Codex',
  },
};

function AddProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [pageState, setPageState] = useState<PageState>('source-selection');
  const [formData, setFormData] = useState<ProjectFormData | null>(null);
  const [showClonePane, setShowClonePane] = useState(false);
  const [isFromClone, setIsFromClone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: detectedProjects = [], isLoading: isLoadingDetected } =
    useQuery({
      queryKey: ['detected-projects'],
      queryFn: () => api.projects.getDetected(),
    });

  const filteredProjects = detectedProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      p.displayPath.toLowerCase().includes(q)
    );
  });

  const hasDetected = detectedProjects.length > 0;
  const showDetectedSection = isLoadingDetected || hasDetected;

  async function handleSelectLocalFolder() {
    const selectedPath = await api.dialog.openDirectory();
    if (!selectedPath) return;

    const name = await inferProjectName(selectedPath);
    setFormData({
      name,
      path: selectedPath,
      color: getRandomColor(),
      repoProviderId: null,
      repoProjectId: null,
      repoProjectName: null,
      repoId: null,
      repoName: null,
      workItemProviderId: null,
      workItemProjectId: null,
      workItemProjectName: null,
    });
    setIsFromClone(false);
    setPageState('form');
  }

  function handleShowClonePane() {
    setShowClonePane(true);
  }

  function handleCloneSuccess(result: CloneResult) {
    setShowClonePane(false);
    setFormData({
      name: result.repoName,
      path: result.path,
      color: getRandomColor(),
      repoProviderId: result.repoProviderId,
      repoProjectId: result.repoProjectId,
      repoProjectName: result.repoProjectName,
      repoId: result.repoId,
      repoName: result.repoName,
      workItemProviderId: result.repoProviderId,
      workItemProjectId: result.repoProjectId,
      workItemProjectName: result.repoProjectName,
    });
    setIsFromClone(true);
    setPageState('form');
  }

  async function handleSelectDetectedProject(project: DetectedProject) {
    const name = await inferProjectName(project.path);
    setFormData({
      name,
      path: project.path,
      color: getRandomColor(),
      repoId: null,
      repoName: null,
      repoProviderId: null,
      repoProjectId: null,
      repoProjectName: null,
      workItemProviderId: null,
      workItemProjectId: null,
      workItemProjectName: null,
    });
    setPageState('form');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formData) return;
    const project = await createProject.mutateAsync({
      name: formData.name,
      path: formData.path,
      type: 'local',
      color: formData.color,
      repoProviderId: formData.repoProviderId,
      repoProjectId: formData.repoProjectId,
      repoProjectName: formData.repoProjectName,
      repoId: formData.repoId,
      repoName: formData.repoName,
      workItemProviderId: formData.workItemProviderId,
      workItemProjectId: formData.workItemProjectId,
      workItemProjectName: formData.workItemProjectName,
      updatedAt: new Date().toISOString(),
    });
    navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  }

  function handleFormChange(updates: Partial<ProjectFormData>) {
    if (!formData) return;
    setFormData({ ...formData, ...updates });
  }

  function handleBack() {
    setPageState('source-selection');
    setFormData(null);
    setIsFromClone(false);
  }

  // ── Form state ──────────────────────────────────────────────────────────────
  if (pageState === 'form' && formData) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={handleBack}
            className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="mb-6 text-2xl font-bold">
            {isFromClone ? 'Configure Cloned Project' : 'Add Local Project'}
          </h1>
          <AddProjectForm
            formData={formData}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            isSubmitting={createProject.isPending}
            repoSectionExpanded={isFromClone}
            workItemSectionExpanded={false}
          />
        </div>
      </div>
    );
  }

  // ── Source selection state ───────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
        {/* Header — title + action buttons */}
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h1 className="text-2xl font-bold">Add Project</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectLocalFolder}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Folder className="h-4 w-4 shrink-0 text-neutral-400" />
              Local Folder
            </button>
            <button
              type="button"
              onClick={handleShowClonePane}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <svg
                className="h-4 w-4 shrink-0 text-neutral-400"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
              </svg>
              Clone from Azure DevOps
            </button>
          </div>
        </div>

        {/* Search box — only shown when detected projects exist */}
        {hasDetected && (
          <div className="relative mb-3 shrink-0">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              aria-label="Filter detected projects"
              placeholder="Filter projects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 py-2 pr-3 pl-9 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/50 focus:outline-none"
            />
          </div>
        )}

        {/* Scrollable 3-column grid */}
        {showDetectedSection && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              {/* Loading skeletons — 6 fills 2 rows */}
              {isLoadingDetected &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-[88px] animate-pulse rounded-lg bg-neutral-800/50"
                  />
                ))}

              {/* Project cards */}
              {!isLoadingDetected &&
                filteredProjects.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    onClick={() => handleSelectDetectedProject(project)}
                    className="flex h-[88px] w-full cursor-pointer flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                      <span className="truncate text-sm font-medium">
                        {project.name}
                      </span>
                    </div>
                    {project.sources.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.sources.map((source) => {
                          const badge = SOURCE_BADGE_CONFIG[source];
                          if (!badge) return null;
                          return (
                            <span key={source} className={badge.className}>
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-auto truncate text-xs text-neutral-500">
                      {project.displayPath}
                    </div>
                  </button>
                ))}

              {/* Empty filter state */}
              {!isLoadingDetected &&
                hasDetected &&
                filteredProjects.length === 0 && (
                  <p className="col-span-3 py-8 text-center text-sm text-neutral-500">
                    No projects match &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Clone pane */}
      {showClonePane && (
        <CloneRepoPane
          onClose={() => setShowClonePane(false)}
          onCloneSuccess={handleCloneSuccess}
        />
      )}
    </div>
  );
}

async function inferProjectName(folderPath: string): Promise<string> {
  const pkg = await api.fs.readPackageJson(folderPath);
  if (pkg?.name) return pkg.name;
  return folderPath.split(/[/\\]/).pop() || 'Untitled';
}
```

**Step 2: Type-check and lint**

```bash
pnpm ts-check 2>&1 | grep "projects/new"
pnpm lint --fix
```

Expected: zero new errors. Pre-existing NodeJS namespace errors in other files are unrelated.

---

### Task 2: Final verification

**Step 1: Full type-check**

```bash
pnpm ts-check
```

Confirm zero new errors in `src/routes/projects/new.tsx`.

**Step 2: Visual checklist**

Navigate to **Add Project** and verify:
- [ ] Page does NOT scroll — only the grid area scrolls
- [ ] Header shows "Add Project" on left, [Local Folder] + [Clone Azure DevOps] buttons on right
- [ ] Loading: 6 skeleton placeholders appear in 3-column grid
- [ ] Loaded: cards are 3 per row, equal height (`88px`), each shows name + badges + tilde-path
- [ ] Search box appears below header once projects load
- [ ] Filtering works in real-time; "No projects match…" spans all 3 columns
- [ ] Clicking a card navigates to the form
- [ ] Clicking Local Folder opens the OS directory picker
- [ ] Clicking Clone opens the clone pane
- [ ] Zero detected projects: grid hidden, only header with buttons visible
