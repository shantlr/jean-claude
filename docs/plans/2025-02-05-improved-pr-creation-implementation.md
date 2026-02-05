# Improved PR Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline PR creation form to the task's PR pane that integrates with the summary feature to auto-generate descriptions and post file-level comments.

**Architecture:** Modify `ui-task-pr-view` to show a creation form when no PR exists. The form uses existing `useTaskSummary`/`useGenerateSummary` hooks and existing `api.azureDevOps.addPullRequestFileComment` API. No new backend code needed.

**Tech Stack:** React, TanStack React Query, existing hooks and API

---

### Task 1: Add Hook for Batch File Comments

**Files:**
- Modify: `src/hooks/use-create-pull-request.ts`

**Step 1: Add useAddPrFileComments hook**

Add a new hook that posts multiple file comments in parallel:

```typescript
export function useAddPrFileComments() {
  return useMutation({
    mutationFn: async (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      comments: Array<{
        filePath: string;
        line: number;
        content: string;
      }>;
    }) => {
      const results = await Promise.allSettled(
        params.comments.map((comment) =>
          api.azureDevOps.addPullRequestFileComment({
            providerId: params.providerId,
            projectId: params.projectId,
            repoId: params.repoId,
            pullRequestId: params.pullRequestId,
            filePath: comment.filePath,
            line: comment.line,
            content: comment.content,
          }),
        ),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(`${failed} of ${params.comments.length} comments failed to post`);
      }

      return { total: params.comments.length, failed };
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 2: Create PR Creation Form Component

**Files:**
- Create: `src/features/task/ui-task-pr-view/pr-creation-form.tsx`

**Step 1: Create the form component**

```tsx
import { Loader2, Sparkles, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';

import {
  useCreatePullRequest,
  usePushBranch,
  useAddPrFileComments,
} from '@/hooks/use-create-pull-request';
import { useGenerateSummary, useTaskSummary } from '@/hooks/use-task-summary';
import { useUpdateTask } from '@/hooks/use-tasks';
import type { FileAnnotation } from '@/lib/api';

export function PrCreationForm({
  taskId,
  taskName,
  taskPrompt,
  branchName,
  targetBranch,
  workItemId,
  repoProviderId,
  repoProjectId,
  repoId,
  onSuccess,
  onCancel,
}: {
  taskId: string;
  taskName: string | null;
  taskPrompt: string;
  branchName: string;
  targetBranch: string;
  workItemId: string | null;
  repoProviderId: string;
  repoProjectId: string;
  repoId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDraft, setIsDraft] = useState(true);
  const [annotationStates, setAnnotationStates] = useState<
    Array<{ annotation: FileAnnotation; checked: boolean }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const { data: existingSummary } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
  const pushBranch = usePushBranch();
  const createPr = useCreatePullRequest();
  const addComments = useAddPrFileComments();
  const updateTask = useUpdateTask();

  const isPending =
    pushBranch.isPending ||
    createPr.isPending ||
    addComments.isPending ||
    updateTask.isPending;

  // When summary is generated or loaded, populate annotations
  useEffect(() => {
    const summary = generateSummary.data ?? existingSummary;
    if (summary?.annotations && annotationStates.length === 0) {
      setAnnotationStates(
        summary.annotations.map((annotation) => ({
          annotation,
          checked: true,
        })),
      );
    }
  }, [generateSummary.data, existingSummary, annotationStates.length]);

  async function handleGenerateSummary() {
    setError(null);
    try {
      const summary = await generateSummary.mutateAsync(taskId);

      // Populate title
      const generatedTitle =
        taskName ?? taskPrompt.split('\n')[0].slice(0, 100);
      setTitle(generatedTitle);

      // Populate description
      const workItemRef = workItemId ? `AB#${workItemId}\n\n` : '';
      const desc = `${workItemRef}## What I Did\n${summary.summary.whatIDid}\n\n## Key Decisions\n${summary.summary.keyDecisions}`;
      setDescription(desc);

      // Annotations are populated via useEffect
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate summary',
      );
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      // Step 1: Push branch
      await pushBranch.mutateAsync(taskId);

      // Step 2: Create PR
      const result = await createPr.mutateAsync({
        providerId: repoProviderId,
        projectId: repoProjectId,
        repoId,
        sourceBranch: branchName,
        targetBranch,
        title,
        description,
        isDraft,
      });

      // Step 3: Post comments for checked annotations
      const checkedAnnotations = annotationStates
        .filter((a) => a.checked)
        .map((a) => ({
          filePath: a.annotation.filePath,
          line: a.annotation.lineNumber,
          content: `jean-claude: ${a.annotation.explanation}`,
        }));

      if (checkedAnnotations.length > 0) {
        await addComments.mutateAsync({
          providerId: repoProviderId,
          projectId: repoProjectId,
          repoId,
          pullRequestId: result.id,
          comments: checkedAnnotations,
        });
      }

      // Step 4: Save PR info to task
      await updateTask.mutateAsync({
        id: taskId,
        data: {
          pullRequestId: String(result.id),
          pullRequestUrl: result.url,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    }
  }

  function toggleAnnotation(index: number) {
    setAnnotationStates((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  const hasSummary = !!(generateSummary.data ?? existingSummary);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
        <Plus className="h-5 w-5 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200">
          Create Pull Request
        </span>
      </div>

      {/* Scrollable form content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="pr-title"
              className="mb-1.5 block text-sm font-medium text-neutral-300"
            >
              Title
            </label>
            <input
              id="pr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter PR title..."
              autoComplete="off"
              className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/50 focus:outline-none"
            />
          </div>

          {/* Description with Generate button */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="pr-description"
                className="text-sm font-medium text-neutral-300"
              >
                Description
              </label>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generateSummary.isPending || hasSummary}
                className="flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generateSummary.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {generateSummary.isPending
                  ? 'Generating...'
                  : hasSummary
                    ? 'Generated'
                    : 'Generate Summary'}
              </button>
            </div>
            <textarea
              id="pr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter PR description..."
              rows={8}
              autoComplete="off"
              className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/50 focus:outline-none"
            />
          </div>

          {/* Annotations checklist (only shown after summary) */}
          {annotationStates.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-300">
                Comments to Post
              </label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-800/50 p-2">
                {annotationStates.map((item, index) => (
                  <label
                    key={`${item.annotation.filePath}:${item.annotation.lineNumber}`}
                    className="flex cursor-pointer items-start gap-2 rounded p-1.5 transition-colors hover:bg-neutral-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleAnnotation(index)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-neutral-400">
                        {item.annotation.filePath}:{item.annotation.lineNumber}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500 line-clamp-2">
                        {item.annotation.explanation}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Branch info */}
          <div className="text-xs text-neutral-500">
            <span className="font-mono">{branchName}</span>
            <span className="mx-2">&rarr;</span>
            <span className="font-mono">{targetBranch}</span>
          </div>

          {/* Draft checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="isDraft"
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label
              htmlFor="isDraft"
              className="cursor-pointer text-sm text-neutral-300"
            >
              Create as draft
            </label>
          </div>

          {/* Work item reference */}
          {workItemId && (
            <div className="text-xs text-neutral-500">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer with buttons */}
      <div className="flex gap-2 border-t border-neutral-700 p-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !title.trim()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {isPending ? 'Creating...' : 'Create PR'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 3: Integrate Form into TaskPrView

**Files:**
- Modify: `src/features/task/ui-task-pr-view/index.tsx`

**Step 1: Add props needed for PR creation**

Update `TaskPrView` and `PrLinkingView` components to accept additional props needed by the form:

```tsx
// Update TaskPrView props
export function TaskPrView({
  taskId,
  projectId,
  branchName,
  pullRequestId,
  hasRepoLinked,
  onClose,
  // New props for PR creation
  taskName,
  taskPrompt,
  targetBranch,
  workItemId,
  repoProviderId,
  repoProjectId,
  repoId,
}: {
  taskId: string;
  projectId: string;
  branchName: string | null;
  pullRequestId: string | null;
  hasRepoLinked: boolean;
  onClose: () => void;
  // New props
  taskName: string | null;
  taskPrompt: string;
  targetBranch: string;
  workItemId: string | null;
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoId: string | null;
}) {
```

**Step 2: Pass props to PrLinkingView**

Update the call to `PrLinkingView` to pass the new props:

```tsx
  return (
    <PrLinkingView
      taskId={taskId}
      projectId={projectId}
      branchName={branchName}
      hasRepoLinked={hasRepoLinked}
      onClose={onClose}
      taskName={taskName}
      taskPrompt={taskPrompt}
      targetBranch={targetBranch}
      workItemId={workItemId}
      repoProviderId={repoProviderId}
      repoProjectId={repoProjectId}
      repoId={repoId}
    />
  );
```

**Step 3: Update PrLinkingView to show creation form**

Update the `PrLinkingView` component signature and add the creation form:

```tsx
import { PrCreationForm } from './pr-creation-form';

function PrLinkingView({
  taskId,
  projectId,
  branchName,
  hasRepoLinked,
  onClose,
  taskName,
  taskPrompt,
  targetBranch,
  workItemId,
  repoProviderId,
  repoProjectId,
  repoId,
}: {
  taskId: string;
  projectId: string;
  branchName: string | null;
  hasRepoLinked: boolean;
  onClose: () => void;
  taskName: string | null;
  taskPrompt: string;
  targetBranch: string;
  workItemId: string | null;
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoId: string | null;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  // ... existing code
```

**Step 4: Replace empty state with create option**

In the empty state (when `matchingPrs.length === 0`), add a "Create PR" button and conditionally show the form:

```tsx
        ) : matchingPrs.length === 0 ? (
          showCreateForm && branchName && repoProviderId && repoProjectId && repoId ? (
            <PrCreationForm
              taskId={taskId}
              taskName={taskName}
              taskPrompt={taskPrompt}
              branchName={branchName}
              targetBranch={targetBranch}
              workItemId={workItemId}
              repoProviderId={repoProviderId}
              repoProjectId={repoProjectId}
              repoId={repoId}
              onSuccess={onClose}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <GitPullRequest className="h-12 w-12 text-neutral-600" />
              <p className="text-neutral-400">
                No pull requests found for branch{' '}
                <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-sm">
                  {branchName}
                </code>
              </p>
              {branchName && repoProviderId && repoProjectId && repoId ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-2 flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" />
                  Create Pull Request
                </button>
              ) : (
                <p className="text-sm text-neutral-500">
                  Create a pull request from the diff view or your git provider.
                </p>
              )}
            </div>
          )
        ) : (
```

**Step 5: Add imports and useState**

Add to imports at top of file:

```tsx
import { useState } from 'react';
// ... existing imports
import { Plus } from 'lucide-react';

import { PrCreationForm } from './pr-creation-form';
```

**Step 6: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 4: Update TaskPanel to Pass New Props

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Update TaskPrView invocation**

Find the `<TaskPrView>` component and add the new props:

```tsx
            <TaskPrView
              taskId={taskId}
              projectId={project.id}
              branchName={
                task.branchName ??
                (task.worktreePath
                  ? getBranchFromWorktreePath(task.worktreePath)
                  : null)
              }
              pullRequestId={task.pullRequestId ?? null}
              hasRepoLinked={!!project.repoProviderId}
              onClose={closePrView}
              // New props
              taskName={task.name}
              taskPrompt={task.prompt}
              targetBranch={project.defaultBranch ?? 'main'}
              workItemId={task.workItemIds?.[0] ?? null}
              repoProviderId={project.repoProviderId}
              repoProjectId={project.repoProjectId}
              repoId={project.repoId}
            />
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 5: Run Lint and Final Verification

**Step 1: Run lint with autofix**

Run: `pnpm lint --fix`
Expected: No errors (warnings OK)

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Manual verification**

Test the feature manually:
1. Open a task with a worktree and no PR
2. Click "PR" button in task header
3. Click "Create Pull Request" button
4. Verify form appears empty
5. Click "Generate Summary" button
6. Verify title, description, and annotations populate
7. Toggle some annotations off
8. Click "Create PR"
9. Verify PR is created and comments are posted to Azure DevOps
