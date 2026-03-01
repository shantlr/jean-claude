# Add Project Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Add Project page into a clean single-column layout with detected projects as the primary focus, a search box, tilde-shortened paths, skeleton loading, and compact manual-add buttons.

**Architecture:** Three files change. The service gains a `displayPath` field (tilde-shortened). The `DetectedProject` type adds `displayPath`. The page is fully rewritten: single column, `max-w-lg`, detected projects on top with search + skeleton loading, compact manual-add buttons at the bottom.

**Tech Stack:** React, TailwindCSS, TanStack Query, lucide-react

---

## Reference Files

Skim before starting:
- `electron/services/project-detection-service.ts` lines 203–237 — the `push()` call to update
- `src/lib/api.ts` lines 89–93 — `DetectedProject` interface to update
- `src/routes/projects/new.tsx` — full file to rewrite (297 lines)

---

### Task 1: Add `displayPath` to the detection service

**Files:**
- Modify: `electron/services/project-detection-service.ts`

**Step 1: Update the return type signature**

Find (line 178):
```typescript
): Promise<{ path: string; name: string; sources: DetectedProjectSource[] }[]> {
```

Replace with:
```typescript
): Promise<{ path: string; name: string; displayPath: string; sources: DetectedProjectSource[] }[]> {
```

**Step 2: Update the internal array declaration**

Find (line 204):
```typescript
  const detectedProjects: { path: string; name: string; sources: DetectedProjectSource[] }[] = [];
```

Replace with:
```typescript
  const homedir = os.homedir();
  const detectedProjects: { path: string; name: string; displayPath: string; sources: DetectedProjectSource[] }[] = [];
```

**Step 3: Add `displayPath` to the push call**

Find (lines 226–230):
```typescript
    detectedProjects.push({
      path: projectPath,
      name: path.basename(projectPath),
      sources: Array.from(sources),
    });
```

Replace with:
```typescript
    const displayPath = projectPath.startsWith(homedir + path.sep)
      ? '~' + projectPath.slice(homedir.length)
      : projectPath;

    detectedProjects.push({
      path: projectPath,
      name: path.basename(projectPath),
      displayPath,
      sources: Array.from(sources),
    });
```

**Step 4: Type-check**

```bash
pnpm ts-check 2>&1 | grep project-detection-service
```

Expected: no output (zero errors in that file).

---

### Task 2: Add `displayPath` to the `DetectedProject` type

**Files:**
- Modify: `src/lib/api.ts` lines 89–93

**Step 1: Add the field**

Find:
```typescript
export interface DetectedProject {
  path: string;
  name: string;
  sources: ('claude-code' | 'opencode' | 'codex')[];
}
```

Replace with:
```typescript
export interface DetectedProject {
  path: string;
  name: string;
  displayPath: string;
  sources: ('claude-code' | 'opencode' | 'codex')[];
}
```

**Step 2: Type-check**

```bash
pnpm ts-check 2>&1 | grep "api.ts"
```

Expected: only pre-existing `process` error at line 280; no new errors.

---

### Task 3: Rewrite `src/routes/projects/new.tsx`

**Files:**
- Modify: `src/routes/projects/new.tsx`

This is a full replacement of the source-selection UI. The form state (`pageState === 'form'`) is **unchanged** — only the source-selection view is rewritten.

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
    return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
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
      <div className="flex w-full flex-1 flex-col items-center overflow-y-auto p-6">
        <div className="w-full max-w-lg py-8">
          <h1 className="mb-6 text-2xl font-bold">Add Project</h1>

          {/* Detected projects section */}
          {showDetectedSection && (
            <div className="mb-6">
              {/* Search box — only shown once we have projects */}
              {hasDetected && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Filter projects…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 py-2 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500/50"
                  />
                </div>
              )}

              {/* List */}
              <div className="space-y-1.5">
                {/* Loading skeletons */}
                {isLoadingDetected && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 animate-pulse rounded-lg bg-neutral-800/50"
                      />
                    ))}
                  </>
                )}

                {/* Project cards */}
                {!isLoadingDetected &&
                  filteredProjects.map((project) => (
                    <button
                      key={project.path}
                      type="button"
                      onClick={() => handleSelectDetectedProject(project)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-neutral-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {decodeURIComponent(project.name)}
                          </span>
                          {project.sources.length > 0 && (
                            <div className="flex shrink-0 gap-1">
                              {project.sources.map((source) => {
                                const badge = SOURCE_BADGE_CONFIG[source];
                                if (!badge) return null;
                                return (
                                  <span
                                    key={source}
                                    className={badge.className}
                                  >
                                    {badge.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="truncate text-xs text-neutral-500">
                          {project.displayPath}
                        </div>
                      </div>
                    </button>
                  ))}

                {/* Empty filtered state */}
                {!isLoadingDetected &&
                  hasDetected &&
                  filteredProjects.length === 0 && (
                    <p className="py-4 text-center text-sm text-neutral-500">
                      No projects match &ldquo;{searchQuery}&rdquo;
                    </p>
                  )}
              </div>
            </div>
          )}

          {/* Divider — only when there are detected projects */}
          {hasDetected && (
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-700" />
              <span className="text-xs text-neutral-500">or add manually</span>
              <div className="h-px flex-1 bg-neutral-700" />
            </div>
          )}

          {/* Manual add buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSelectLocalFolder}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Folder className="h-4 w-4 shrink-0 text-neutral-400" />
              Local Folder
            </button>
            <button
              type="button"
              onClick={handleShowClonePane}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800"
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

Expected: only pre-existing missing-module errors (`TS2307`, `TS7026`); no new semantic errors.

---

### Task 4: Final verification

**Step 1: Full type-check**

```bash
pnpm ts-check
```

Confirm zero new errors in:
- `electron/services/project-detection-service.ts`
- `src/lib/api.ts`
- `src/routes/projects/new.tsx`

**Step 2: Visual checklist (in running app)**

Navigate to **Add Project** and verify:
- [ ] Page is a single centered column, no side-by-side layout
- [ ] Loading skeletons appear briefly while projects are fetched
- [ ] Detected projects show name + `~/tilde-path` + badges (badges on the right of the name row)
- [ ] Search box filters in real time; "No projects match…" shown for no results
- [ ] "or add manually" divider appears between list and buttons
- [ ] Two compact buttons side-by-side: Local Folder + Clone from Azure DevOps
- [ ] Clicking a detected project goes to the form as before
- [ ] Clicking Local Folder opens the directory picker as before
- [ ] Clicking Clone opens the clone pane as before
- [ ] With 0 detected projects: search and divider hidden, buttons are the focus

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | Add `displayPath` (tilde-shortened) to return type and push call |
| `src/lib/api.ts` | Add `displayPath: string` to `DetectedProject` interface |
| `src/routes/projects/new.tsx` | Full source-selection UI rewrite |
