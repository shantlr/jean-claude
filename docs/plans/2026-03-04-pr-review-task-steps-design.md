# PR Review Task Steps Design

## Overview

Add the ability to create a review task from a pull request. The task uses a worktree checked out on the PR's source branch and runs a two-step workflow:

1. **Agent step**: Reviews changes between the PR's source and target branches, outputs structured JSON review comments.
2. **PR review validation step** (new `pr-review` step type): Displays proposed comments in a validation UI where the user can check/uncheck/edit before submitting them as file-level comments on the Azure DevOps PR.

## Entry Point

A "Review" button on each PR in the `PrSidebarList` / `PrListItem` component. Clicking it triggers task creation via a new `tasks:createPrReview` IPC handler.

## Task Creation Flow

1. User clicks "Review" on a PR in the sidebar.
2. `tasks:createPrReview({ projectId, pullRequestId })`:
   - Fetches PR details (source branch, target branch, title, URL).
   - Creates a worktree based on the PR's source branch (reuses existing `createWorktree`).
   - Creates a task with `pullRequestId` and `pullRequestUrl` pre-linked.
   - Creates 2 steps (see below).
   - Auto-starts step 1.
3. User is navigated to the new task.

Task name: `"Review: {PR title}"` (truncated to 40 chars).

## Step Definitions

### Step 1 — "Review Changes" (`type: 'agent'`)

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `name`             | `"Review Changes"`                                                    |
| `type`             | `'agent'`                                                             |
| `sortOrder`        | `0`                                                                   |
| `status`           | `'ready'` (no dependencies)                                          |
| `promptTemplate`   | Review prompt with target branch injected (see below)                 |
| `interactionMode`  | `'auto'`                                                              |
| `dependsOn`        | `[]`                                                                  |

**Prompt template** (target branch hardcoded at creation time):

> You are reviewing a pull request. Review the changes between `origin/{targetBranch}` and the current branch. Analyze code quality, potential bugs, design issues, and suggest improvements.
>
> At the end of your review, output a JSON block fenced with \`\`\`json containing an array of review comments with this shape:
> `{filePath: string, lineNumber: number, comment: string}[]`
>
> Each comment should reference a specific file and line number in the diff.

### Step 2 — "Submit Review" (`type: 'pr-review'`)

| Field            | Value                           |
| ---------------- | ------------------------------- |
| `name`           | `"Submit Review"`               |
| `type`           | `'pr-review'`                   |
| `sortOrder`      | `1`                             |
| `status`         | `'pending'` (depends on step 1) |
| `dependsOn`      | `[step1Id]`                     |
| `meta`           | `PrReviewStepMeta`              |
| `promptTemplate` | `null` (not an agent step)      |

## New Types

### `TaskStepType`

Add `'pr-review'` to the existing union: `'agent' | 'create-pull-request' | 'fork' | 'pr-review'`.

### `PrReviewStepMeta`

```ts
interface PrReviewStepMeta {
  pullRequestId: string;
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

## JSON Parsing (Step 1 → Step 2 Transition)

When `updateDependentStepStatuses` transitions a `pr-review` step from `pending` → `ready`:

1. Read the dependency step's `output`.
2. Extract JSON from `` ```json ... ``` `` fences.
3. Parse and validate each entry has `filePath`, `lineNumber`, `comment`.
4. Populate `meta.comments` with `enabled: true` on each.
5. Save updated meta to the step.

**If parsing fails**:
- Step still transitions to `ready`.
- `meta.comments` set to `[]`.
- `meta.parseError` set with error description.
- Validation UI shows error state with option to re-run step 1.

## Validation UI

### Component: `PrReviewValidation` (`src/features/task/ui-pr-review-validation/`)

Renders when the active step is `type: 'pr-review'` instead of the message stream.

**Layout**:
- List of proposed review comments, each showing:
  - Checkbox to include/exclude
  - File path + line number badge
  - Editable comment text (inline textarea)
- "Select All" / "Deselect All" toggle
- "Submit Review" button (posts enabled comments)
- "Discard" option (completes step with 0 comments)
- Error state when `meta.parseError` is set (shows raw output + re-run option)
- Success state after submission (shows count of posted comments)

### Rendering in Task Panel

In `ui-task-panel/index.tsx`, check the active step's type:
- `'agent'` → render message stream (existing)
- `'pr-review'` → render `PrReviewValidation`

Step flow bar renders `pr-review` steps with a distinct icon (e.g., message-square or check-circle).

## New IPC Methods

### `tasks:createPrReview`

```ts
tasks:createPrReview(params: {
  projectId: string;
  pullRequestId: number;
}): Promise<{ taskId: string }>
```

Orchestrates: fetch PR → create worktree → create task → create steps → auto-start step 1.

### `steps:submitPrReview`

```ts
steps:submitPrReview(stepId: string): Promise<void>
```

Reads step meta → posts enabled comments via `addPullRequestFileComment` → updates meta with `submittedAt`/`submittedCount` → marks step completed.

## API Bridge

Add to `src/lib/api.ts` and `electron/preload.ts`:
- `tasks.createPrReview(params)`
- `steps.submitPrReview(stepId)`

## Files to Modify

| Layer   | What                                                 | Where                                               |
| ------- | ---------------------------------------------------- | --------------------------------------------------- |
| Type    | `'pr-review'` in `TaskStepType`                      | `shared/types.ts`                                   |
| Type    | `PrReviewStepMeta` interface                         | `shared/types.ts`                                   |
| Backend | JSON extraction + `pr-review` transition handling    | `electron/services/step-service.ts`                 |
| Backend | `tasks:createPrReview` IPC handler                   | `electron/ipc/handlers.ts`                          |
| Backend | `steps:submitPrReview` IPC handler                   | `electron/ipc/handlers.ts`                          |
| API     | New IPC methods in preload bridge                    | `src/lib/api.ts`, `electron/preload.ts`             |
| UI      | "Review" button on `PrListItem`                      | `src/features/pull-request/ui-pr-sidebar-list/`     |
| UI      | `PrReviewValidation` component                       | `src/features/task/ui-pr-review-validation/` (new)  |
| UI      | Step type check in task panel                        | `src/features/task/ui-task-panel/index.tsx`          |
| UI      | `pr-review` step icon in flow bar                    | `src/features/task/ui-step-flow-bar/index.tsx`      |
| Hook    | `useSubmitPrReview` mutation                         | `src/hooks/use-steps.ts`                            |

## What Stays Unchanged

- Worktree creation (`worktree-service.ts`)
- Agent execution (`agent-service.ts`)
- Step dependency system (`step-service.ts` core logic)
- Message storage (`agent-messages` repository)
- PR comment API (`azure-devops-service.ts` — `addPullRequestFileComment`)
- Step flow bar layout (only adds icon mapping for new type)
