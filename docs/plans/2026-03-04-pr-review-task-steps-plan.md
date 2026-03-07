# PR Review Task Steps — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Review PR" flow that creates a worktree task from a pull request, runs an agent to review changes and produce structured comments, then presents a validation UI for the user to check/edit/submit those comments to Azure DevOps.

**Architecture:** New `pr-review` step type + `tasks:createPrReview` IPC handler. Step 1 is a standard agent step. Step 2 is a non-agent `pr-review` step whose validation UI renders in the task panel instead of the message stream. JSON parsing bridges step 1's output into step 2's actionable meta.

**Tech Stack:** Electron IPC, React, Zustand, TanStack Query, Azure DevOps REST API (existing), Kysely (no migration needed — step type is just a string column).

---

### Task 1: Add `pr-review` Step Type and `PrReviewStepMeta`

**Files:**
- Modify: `shared/types.ts:310` (TaskStepType), `shared/types.ts:330-333` (TaskStepMeta union)

**Step 1: Add type and meta interface**

In `shared/types.ts`, extend the `TaskStepType` union at line 310:

```typescript
export type TaskStepType = 'agent' | 'create-pull-request' | 'fork' | 'pr-review';
```

Add the `PrReviewStepMeta` interface after `ForkStepMeta` (after line 328):

```typescript
/** Meta for `pr-review` steps — review comments parsed from agent output */
export interface PrReviewStepMeta {
  pullRequestId: number;
  projectId: string;
  comments: Array<{
    filePath: string;
    lineNumber: number;
    comment: string;
    enabled: boolean;
  }>;
  parseError?: string;
  submittedAt?: string;
  submittedCount?: number;
}
```

Update the `TaskStepMeta` union at line 330:

```typescript
export type TaskStepMeta =
  | CreatePullRequestStepMeta
  | ForkStepMeta
  | PrReviewStepMeta
  | Record<string, never>;
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add pr-review step type and PrReviewStepMeta"
```

---

### Task 2: Add JSON Extraction to Step Service

**Files:**
- Modify: `electron/services/step-service.ts:79-94` (updateDependentStepStatuses)

**Step 1: Add JSON extraction helper**

Add above `updateDependentStepStatuses` (around line 76) in `electron/services/step-service.ts`:

```typescript
/**
 * Extract a JSON array from fenced ```json blocks in text.
 * Returns parsed array or null + error message.
 */
function extractReviewComments(
  output: string,
): {
  comments: Array<{ filePath: string; lineNumber: number; comment: string }>;
  error?: string;
} {
  // Match fenced JSON blocks
  const jsonMatch = output.match(/```json\s*\n([\s\S]*?)```/);
  if (!jsonMatch) {
    return { comments: [], error: 'No ```json block found in agent output' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as unknown;
    if (!Array.isArray(parsed)) {
      return { comments: [], error: 'JSON block is not an array' };
    }

    const comments: Array<{
      filePath: string;
      lineNumber: number;
      comment: string;
    }> = [];

    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).filePath === 'string' &&
        typeof (item as Record<string, unknown>).lineNumber === 'number' &&
        typeof (item as Record<string, unknown>).comment === 'string'
      ) {
        comments.push({
          filePath: (item as Record<string, unknown>).filePath as string,
          lineNumber: (item as Record<string, unknown>).lineNumber as number,
          comment: (item as Record<string, unknown>).comment as string,
        });
      }
    }

    if (comments.length === 0 && parsed.length > 0) {
      return {
        comments: [],
        error: `JSON array has ${parsed.length} items but none match {filePath, lineNumber, comment} shape`,
      };
    }

    return { comments };
  } catch (e) {
    return {
      comments: [],
      error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
```

**Step 2: Add pr-review handling in updateDependentStepStatuses**

Modify `updateDependentStepStatuses` (line 79) to populate meta when transitioning a `pr-review` step to ready. Replace the existing function:

```typescript
async function updateDependentStepStatuses(taskId: string): Promise<void> {
  const steps = await TaskStepRepository.findByTaskId(taskId);
  const completedIds = new Set(
    steps.filter((s) => s.status === 'completed').map((s) => s.id),
  );

  for (const step of steps) {
    if (step.status !== 'pending') continue;
    const allDepsCompleted = step.dependsOn.every((depId) =>
      completedIds.has(depId),
    );
    if (allDepsCompleted) {
      // For pr-review steps, parse JSON from dependency output into meta
      if (step.type === 'pr-review') {
        const depStep = steps.find((s) => s.id === step.dependsOn[0]);
        const output = depStep?.output ?? '';
        const { comments, error } = extractReviewComments(output);

        const currentMeta = (step.meta ?? {}) as Record<string, unknown>;
        const updatedMeta = {
          ...currentMeta,
          comments: comments.map((c) => ({ ...c, enabled: true })),
          ...(error ? { parseError: error } : {}),
        };

        await TaskStepRepository.update(step.id, {
          status: 'ready',
          meta: updatedMeta as import('@shared/types').TaskStepMeta,
        });
      } else {
        await TaskStepRepository.update(step.id, { status: 'ready' });
      }
    }
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 4: Commit**

```bash
git add electron/services/step-service.ts
git commit -m "feat: extract review comments from agent output for pr-review steps"
```

---

### Task 3: Add `tasks:createPrReview` IPC Handler

**Files:**
- Modify: `electron/ipc/handlers.ts` (add new handler after `tasks:createWithWorktree` block, around line 423)
- Modify: `src/lib/api.ts` (add to tasks section)
- Modify: `electron/preload.ts` (add to tasks section)

**Step 1: Add IPC handler in handlers.ts**

After the `tasks:createWithWorktree` handler (line 423), add:

```typescript
ipcMain.handle(
  'tasks:createPrReview',
  async (
    event,
    params: {
      projectId: string;
      pullRequestId: number;
    },
  ) => {
    const { projectId, pullRequestId } = params;
    dbg.ipc(
      'tasks:createPrReview projectId=%s prId=%d',
      projectId,
      pullRequestId,
    );

    // 1. Get project and PR details
    const project = await ProjectRepository.findById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.repoProviderId || !project.repoProjectId || !project.repoId) {
      throw new Error('Project has no linked repository');
    }

    const pr = await getPullRequest({
      providerId: project.repoProviderId,
      projectId: project.repoProjectId,
      repoId: project.repoId,
      pullRequestId,
    });

    // 2. Extract branch names (refs come as "refs/heads/branch-name")
    const sourceBranch = pr.sourceRefName.replace('refs/heads/', '');
    const targetBranch = pr.targetRefName.replace('refs/heads/', '');

    // 3. Generate task name
    const rawName = `Review: ${pr.title}`;
    const taskName = rawName.length > 40 ? rawName.slice(0, 37) + '...' : rawName;

    // 4. Create worktree on the PR source branch
    const { worktreePath, startCommitHash, branchName } =
      await createWorktree(
        project.path,
        project.id,
        project.name,
        `Review PR #${pullRequestId}`,
        taskName,
        sourceBranch,
      );

    // 5. Create task linked to PR
    const task = await TaskRepository.create({
      projectId,
      prompt: `Review PR #${pullRequestId}: ${pr.title}`,
      name: taskName,
      worktreePath,
      startCommitHash,
      branchName,
      sourceBranch,
      pullRequestId: String(pullRequestId),
      pullRequestUrl: pr.url ?? null,
    });

    // 6. Create Step 1: Review Changes (agent)
    const reviewStep = await StepService.create({
      taskId: task.id,
      name: 'Review Changes',
      promptTemplate: [
        'You are reviewing a pull request.',
        `Review the changes between \`origin/${targetBranch}\` and the current branch.`,
        'Analyze code quality, potential bugs, design issues, and suggest improvements.',
        '',
        'At the end of your review, output a JSON block fenced with ```json containing an array of review comments with this shape:',
        '`[{ "filePath": "path/to/file", "lineNumber": 42, "comment": "Your review comment" }]`',
        '',
        'Each comment should reference a specific file and line number from the changed files.',
      ].join('\n'),
      interactionMode: 'auto',
      agentBackend: project.defaultAgentBackend ?? 'claude-code',
      sortOrder: 0,
    });

    // 7. Create Step 2: Submit Review (pr-review)
    await TaskStepRepository.create({
      taskId: task.id,
      name: 'Submit Review',
      type: 'pr-review',
      dependsOn: [reviewStep.id],
      promptTemplate: '',
      sortOrder: 1,
      meta: {
        pullRequestId,
        projectId,
        comments: [],
      } as import('@shared/types').PrReviewStepMeta,
    });

    // 8. Auto-start the review step
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      agentService.setMainWindow(window);
    }
    agentService.start(reviewStep.id).catch((err) => {
      dbg.ipc('Error auto-starting review agent for step %s: %O', reviewStep.id, err);
    });

    return task;
  },
);
```

Note: This handler uses `getPullRequest` from `azure-devops-service.ts`, `createWorktree` from `worktree-service.ts`, and `TaskStepRepository` — check the existing imports at the top of handlers.ts to see which are already imported and add any missing ones.

**Step 2: Add API type in api.ts**

In the `tasks` section of `src/lib/api.ts` (look for the existing `createWithWorktree` method), add:

```typescript
createPrReview: (params: {
  projectId: string;
  pullRequestId: number;
}) => Promise<Task>;
```

**Step 3: Add preload binding in preload.ts**

In the `tasks` section of `electron/preload.ts`, add:

```typescript
createPrReview: (params: { projectId: string; pullRequestId: number }) =>
  ipcRenderer.invoke('tasks:createPrReview', params),
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts src/lib/api.ts electron/preload.ts
git commit -m "feat: add tasks:createPrReview IPC handler"
```

---

### Task 4: Add `steps:submitPrReview` IPC Handler

**Files:**
- Modify: `electron/ipc/handlers.ts` (add near other steps: handlers, around line 807)
- Modify: `src/lib/api.ts` (add to steps section)
- Modify: `electron/preload.ts` (add to steps section)

**Step 1: Add IPC handler**

After the existing `steps:setMode` handler in `electron/ipc/handlers.ts`, add:

```typescript
ipcMain.handle(
  'steps:submitPrReview',
  async (_, stepId: string) => {
    dbg.ipc('steps:submitPrReview stepId=%s', stepId);

    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    if (step.type !== 'pr-review') throw new Error('Step is not a pr-review type');

    const meta = step.meta as import('@shared/types').PrReviewStepMeta;
    const enabledComments = meta.comments.filter((c) => c.enabled);

    if (enabledComments.length > 0) {
      // Get project repo info for API calls
      const project = await ProjectRepository.findById(meta.projectId);
      if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId) {
        throw new Error('Project has no linked repository');
      }

      // Post each enabled comment as a file comment
      const results = await Promise.allSettled(
        enabledComments.map((comment) =>
          addPullRequestFileComment({
            providerId: project.repoProviderId!,
            projectId: project.repoProjectId!,
            repoId: project.repoId!,
            pullRequestId: meta.pullRequestId,
            filePath: comment.filePath,
            line: comment.lineNumber,
            content: comment.comment,
          }),
        ),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        dbg.ipc('%d of %d comments failed to post', failed, enabledComments.length);
      }

      // Update meta with submission info
      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: enabledComments.length - failed,
      };
      await TaskStepRepository.update(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    } else {
      // No comments to submit — mark as completed with 0 count
      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: 0,
      };
      await TaskStepRepository.update(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    }

    // Sync task status
    await StepService.syncTaskStatus(step.taskId);

    return TaskStepRepository.findById(stepId);
  },
);
```

Note: `addPullRequestFileComment` is from `azure-devops-service.ts` — check existing imports at top of handlers.ts and add if needed.

**Step 2: Add API type in api.ts**

In the `steps` section of `src/lib/api.ts`, add:

```typescript
submitPrReview: (stepId: string) => Promise<TaskStep>;
```

**Step 3: Add preload binding in preload.ts**

In the `steps` section of `electron/preload.ts`, add:

```typescript
submitPrReview: (stepId: string) =>
  ipcRenderer.invoke('steps:submitPrReview', stepId),
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts src/lib/api.ts electron/preload.ts
git commit -m "feat: add steps:submitPrReview IPC handler"
```

---

### Task 5: Add `useSubmitPrReview` Hook

**Files:**
- Modify: `src/hooks/use-steps.ts` (add mutation hook at the end)

**Step 1: Add the hook**

At the end of `src/hooks/use-steps.ts`, add:

```typescript
export function useSubmitPrReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => api.steps.submitPrReview(stepId),
    onSuccess: (step: TaskStep) => {
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/hooks/use-steps.ts
git commit -m "feat: add useSubmitPrReview mutation hook"
```

---

### Task 6: Add "Review" Button to PR List Item

**Files:**
- Modify: `src/features/pull-request/ui-pr-list-item/index.tsx`

**Step 1: Add the Review button**

The current `PrListItem` component is a `<Link>`. We need to add a "Review" button that prevents navigation and triggers task creation. Add a `useCreatePrReviewTask` hook inline and a button.

Import what's needed at the top of the file:

```typescript
import { useNavigate } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useCallback } from 'react';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import api from '@/lib/api';
```

Add an `onReview` prop or handle it inside the component. The simplest approach: add a small icon button inside the existing link that stops propagation and creates the review task.

After the reviewer avatars section (around line 101-117), but still inside the Link, add a review button. Note: we need to use `e.preventDefault()` and `e.stopPropagation()` to prevent the Link navigation.

Replace the component with:

```tsx
export function PrListItem({
  pr,
  projectId,
  isActive,
  basePath = 'project',
  projectName,
  projectColor,
}: {
  pr: AzureDevOpsPullRequest;
  projectId: string;
  isActive: boolean;
  basePath?: 'project' | 'all';
  projectName?: string;
  projectColor?: string;
}) {
  const navigate = useNavigate();
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);

  const handleReview = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const jobId = addRunningJob({
        type: 'task-creation',
        title: `Creating review for PR #${pr.id}`,
        projectId,
      });

      try {
        const task = await api.tasks.createPrReview({
          projectId,
          pullRequestId: pr.id,
        });
        markJobSucceeded(jobId);
        void navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: { projectId, taskId: task.id },
        });
      } catch (error) {
        markJobFailed(
          jobId,
          error instanceof Error ? error.message : 'Failed to create review task',
        );
      }
    },
    [pr.id, projectId, navigate, addRunningJob, markJobSucceeded, markJobFailed],
  );

  const linkProps =
    basePath === 'all'
      ? {
          to: '/all/prs/$projectId/$prId' as const,
          params: { projectId, prId: String(pr.id) },
        }
      : {
          to: '/projects/$projectId/prs/$prId' as const,
          params: { projectId, prId: String(pr.id) },
        };

  const reviewersWithVotes = pr.reviewers.filter(
    (r) => r.voteStatus !== 'none' && !r.isContainer,
  );

  return (
    <Link
      {...linkProps}
      className={clsx(
        'group flex flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors',
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800',
      )}
    >
      {/* Top row: icon, PR number, draft badge, review button */}
      <div className="flex items-center gap-2">
        <div className="shrink-0">{getStatusIcon(pr.status, pr.isDraft)}</div>
        <span className="text-xs text-neutral-500">#{pr.id}</span>
        {pr.isDraft && (
          <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 uppercase">
            Draft
          </span>
        )}
        <div className="flex-1" />
        {pr.status === 'active' && (
          <button
            onClick={handleReview}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 opacity-0 transition-all hover:bg-neutral-600 hover:text-neutral-200 group-hover:opacity-100"
            title="Create review task"
          >
            <Eye className="h-3 w-3" />
            Review
          </button>
        )}
      </div>

      {/* Title */}
      <p className="truncate text-sm font-medium text-neutral-200">
        {pr.title}
      </p>

      {/* Bottom row: metadata and reviewers */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
          {projectName && projectColor && (
            <>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: projectColor }}
              />
              <span className="max-w-16 truncate">{projectName}</span>
              <span>&middot;</span>
            </>
          )}
          <span className="truncate">{pr.createdBy.displayName}</span>
          <span>&middot;</span>
          <span className="shrink-0">
            {formatRelativeTime(pr.creationDate)}
          </span>
        </div>

        {reviewersWithVotes.length > 0 && (
          <div className="flex shrink-0 -space-x-1">
            {reviewersWithVotes.slice(0, 3).map((reviewer) => (
              <UserAvatar
                key={reviewer.uniqueName}
                name={reviewer.displayName}
                vote={reviewer.voteStatus}
              />
            ))}
            {reviewersWithVotes.length > 3 && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-600 text-[9px] font-medium text-neutral-300">
                +{reviewersWithVotes.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/pull-request/ui-pr-list-item/index.tsx
git commit -m "feat: add Review button to PR list items"
```

---

### Task 7: Create `PrReviewValidation` Component

**Files:**
- Create: `src/features/task/ui-pr-review-validation/index.tsx`

**Step 1: Create the component**

Create `src/features/task/ui-pr-review-validation/index.tsx`:

```tsx
import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Loader2,
  MessageSquare,
  Square,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { useUpdateStep, useSubmitPrReview } from '@/hooks/use-steps';
import type { PrReviewStepMeta, TaskStep } from '@shared/types';

export function PrReviewValidation({ step }: { step: TaskStep }) {
  const meta = step.meta as PrReviewStepMeta;
  const submitReview = useSubmitPrReview();
  const updateStep = useUpdateStep();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const comments = meta.comments ?? [];
  const enabledCount = comments.filter((c) => c.enabled).length;

  const toggleComment = useCallback(
    (index: number) => {
      const updated = [...comments];
      updated[index] = { ...updated[index], enabled: !updated[index].enabled };
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  const toggleAll = useCallback(
    (enabled: boolean) => {
      const updated = comments.map((c) => ({ ...c, enabled }));
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  const updateCommentText = useCallback(
    (index: number, text: string) => {
      const updated = [...comments];
      updated[index] = { ...updated[index], comment: text };
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  const handleSubmit = useCallback(() => {
    submitReview.mutate(step.id);
  }, [step.id, submitReview]);

  const handleDiscard = useCallback(() => {
    // Toggle all off then submit (posts 0 comments)
    const updated = comments.map((c) => ({ ...c, enabled: false }));
    updateStep.mutate(
      {
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      },
      { onSuccess: () => submitReview.mutate(step.id) },
    );
  }, [comments, meta, step.id, updateStep, submitReview]);

  // Completed state
  if (step.status === 'completed' && meta.submittedAt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/50">
          <Check className="h-6 w-6 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-neutral-200">
          Review submitted
        </p>
        <p className="text-xs text-neutral-500">
          {meta.submittedCount ?? 0} comment{(meta.submittedCount ?? 0) !== 1 ? 's' : ''} posted to PR #{meta.pullRequestId}
        </p>
      </div>
    );
  }

  // Pending state
  if (step.status === 'pending') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        <p className="text-sm text-neutral-500">
          Waiting for review step to complete...
        </p>
      </div>
    );
  }

  // Parse error state
  if (meta.parseError && comments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-950/50">
          <AlertTriangle className="h-6 w-6 text-yellow-400" />
        </div>
        <p className="text-sm font-medium text-neutral-200">
          Could not parse review comments
        </p>
        <p className="max-w-md text-center text-xs text-neutral-500">
          {meta.parseError}
        </p>
        <button
          onClick={handleDiscard}
          className="rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
        >
          Skip Review
        </button>
      </div>
    );
  }

  // Main validation UI
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-200">
            Review Comments
          </span>
          <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
            {enabledCount}/{comments.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleAll(enabledCount < comments.length)}
            className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          >
            {enabledCount === comments.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {comments.map((comment, index) => (
            <div
              key={index}
              className={clsx(
                'rounded-lg border p-3 transition-colors',
                comment.enabled
                  ? 'border-neutral-700 bg-neutral-800/60'
                  : 'border-neutral-800 bg-neutral-900/40 opacity-50',
              )}
            >
              {/* Top row: checkbox, file path, line number */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleComment(index)}
                  className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-200"
                >
                  {comment.enabled ? (
                    <CheckSquare className="h-4 w-4 text-blue-400" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300">
                  {comment.filePath}
                </span>
                <span className="text-[10px] text-neutral-500">
                  L{comment.lineNumber}
                </span>
              </div>

              {/* Comment text */}
              {editingIndex === index ? (
                <textarea
                  autoFocus
                  className="mt-2 w-full rounded border border-neutral-600 bg-neutral-900 p-2 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                  rows={3}
                  defaultValue={comment.comment}
                  onBlur={(e) => {
                    updateCommentText(index, e.target.value);
                    setEditingIndex(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingIndex(null);
                  }}
                />
              ) : (
                <p
                  className="mt-2 cursor-text text-xs leading-relaxed text-neutral-300"
                  onClick={() => setEditingIndex(index)}
                  title="Click to edit"
                >
                  {comment.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-neutral-700 px-4 py-3">
        <button
          onClick={handleDiscard}
          disabled={submitReview.isPending}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
          Discard
        </button>
        <button
          onClick={handleSubmit}
          disabled={enabledCount === 0 || submitReview.isPending}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitReview.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Submit {enabledCount} Comment{enabledCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/task/ui-pr-review-validation/index.tsx
git commit -m "feat: add PrReviewValidation component for review step UI"
```

---

### Task 8: Integrate `PrReviewValidation` into Task Panel

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (around line 899-985, the main content area)

**Step 1: Import the component**

Add import at the top of the file:

```typescript
import { PrReviewValidation } from '@/features/task/ui-pr-review-validation';
```

**Step 2: Add pr-review step rendering**

In the main content area (around line 899-985), the current rendering logic is:

```
isPrViewOpen → TaskPrView
isDiffViewOpen → WorktreeDiffView
agentState.isLoading → Loading spinner
hasMessages → MessageStream
else → Prompt display with Start/Pending/Reload states
```

We need to add a check for `pr-review` step type before the agent-based rendering. Insert after the diff view check (after line 922) and before `agentState.isLoading`:

Find this section in `index.tsx`:
```tsx
          ) : isDiffViewOpen && task.worktreePath ? (
            <WorktreeDiffView
              ...
            />
          ) : agentState.isLoading ? (
```

Insert the pr-review check between the diff view and agent loading:

```tsx
          ) : isDiffViewOpen && task.worktreePath ? (
            <WorktreeDiffView
              taskId={taskId}
              projectId={project.id}
              selectedFilePath={diffSelectedFile}
              onSelectFile={selectDiffFile}
              branchName={
                task.branchName ?? getBranchFromWorktreePath(task.worktreePath)
              }
              sourceBranch={task.sourceBranch}
              defaultBranch={project.defaultBranch}
              taskName={task.name}
              hasRepoLink={hasRepoLink}
              onMergeStarted={handleMergeStarted}
              onOpenPrView={openPrView}
            />
          ) : activeStep?.type === 'pr-review' ? (
            <PrReviewValidation step={activeStep} />
          ) : agentState.isLoading ? (
```

This means: when the active step is a `pr-review` type, render the validation component instead of the message stream, regardless of agent state.

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: render PrReviewValidation for pr-review steps in task panel"
```

---

### Task 9: Final Verification

**Step 1: Run lint with autofix**

Run: `pnpm install && pnpm lint --fix`

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Run lint check**

Run: `pnpm lint`
Expected: No errors (or fix any remaining manually)

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes"
```
