# PR Review Refactor: Reuse Review Step + Work Item Alignment Check

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the PR review task creation to reuse the existing `review` step type (multi-reviewer with MCP parallel dispatch) instead of a bespoke single-agent prompt, and inject PR-linked work items into the review prompt so one reviewer checks alignment with the requirements.

**Architecture:** The current `tasks:createPrReview` IPC handler creates a hardcoded single-agent step with a review prompt + a `pr-review` comment-extraction step. We refactor Step 1 to use `type: 'review'` with `ReviewStepMeta` containing predefined reviewers (including a new "Requirements Alignment" reviewer). We add a new Azure DevOps API method to fetch work items linked to a PR, then inject their titles and descriptions into the review prompt. The `buildReviewPrompt()` function in `agent-service.ts` gains an optional `workItemContext` parameter.

**Tech Stack:** TypeScript, Electron IPC, Azure DevOps REST API, React

---

## Context: Current Architecture

### Two existing review workflows

1. **PR Review (`tasks:createPrReview`)** — Creates a 2-step task:
   - Step 1: `type: 'agent'` with a hardcoded review prompt asking agent to output JSON `[{filePath, lineNumber, comment}]`
   - Step 2: `type: 'pr-review'` — UI to validate/submit comments to Azure DevOps

2. **Review Changes (add-step dialog preset)** — Creates a step with `type: 'review'` + `ReviewStepMeta` containing multiple reviewers. Agent dispatches reviewers in parallel via MCP `run_review` tool. The prompt is built by `buildReviewPrompt()` in `agent-service.ts`.

### What we want

- **Refactor Step 1** of PR review to use `type: 'review'` with built-in reviewers (Bug Detection, Code Quality, Security & Performance, **Requirements Alignment**)
- **Fetch PR work items** from Azure DevOps and inject them into the review prompt
- **Keep Step 2** (`pr-review`) unchanged — the JSON comment extraction still works from agent output
- The `buildReviewPrompt()` function should accept optional work item context and pass it to all reviewers (but especially the Requirements Alignment reviewer)

### Key files

| File | Role |
|------|------|
| `electron/ipc/handlers.ts:472-631` | `tasks:createPrReview` handler — **main refactor target** |
| `electron/services/agent-service.ts:92-140` | `buildReviewPrompt()` — add work item context |
| `electron/services/azure-devops-service.ts` | Add `getPullRequestWorkItems()` method |
| `shared/types.ts:362-374` | `ReviewerConfig`, `ReviewStepMeta` — no changes needed |
| `src/features/task/ui-task-panel/index.tsx:114-120` | `buildReviewChangesPrompt()` — no changes needed |

---

### Task 1: Add `getPullRequestWorkItems()` to Azure DevOps Service

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add the new function**

Add after the existing `getPullRequest()` function (around line 1230):

```typescript
/**
 * Fetch work items linked to a pull request.
 * Uses the PR Work Items API: GET .../pullrequests/{prId}/workitems
 * Then batch-fetches full work item details.
 */
export async function getPullRequestWorkItems(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsWorkItem[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // 1. Get work item refs from PR
  const refsUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/workitems?api-version=7.0`;

  const refsResponse = await fetch(refsUrl, {
    headers: { Authorization: authHeader },
  });

  if (!refsResponse.ok) {
    const error = await refsResponse.text();
    throw new Error(`Failed to fetch PR work items: ${error}`);
  }

  const refsData: { value: Array<{ id: string; url: string }> } =
    await refsResponse.json();

  if (refsData.value.length === 0) {
    return [];
  }

  // 2. Batch-fetch full work item details
  const ids = refsData.value.map((ref) => ref.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch PR work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  return batchData.value.map((wi) => ({
    id: wi.id,
    url:
      wi._links?.html?.href ??
      `https://dev.azure.com/${orgName}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
      changedDate: wi.fields['System.ChangedDate'],
    },
    parentId: extractParentId(wi.relations),
  }));
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

---

### Task 2: Add Work Item Context to `buildReviewPrompt()`

**Files:**
- Modify: `electron/services/agent-service.ts:92-140`

**Step 1: Extend `buildReviewPrompt` signature and inject work items**

The function currently takes `{ basePrompt, meta, startCommitHash }`. Add an optional `workItemContext` parameter:

```typescript
function buildReviewPrompt({
  basePrompt,
  meta,
  startCommitHash,
  workItemContext,
}: {
  basePrompt: string;
  meta: ReviewStepMeta | undefined;
  startCommitHash: string | null;
  workItemContext?: string;
}): string {
```

At the end of the prompt array (before the `extra` line), add:

```typescript
const workItemSection = workItemContext
  ? [
      '',
      '## Associated Work Items',
      '',
      'The following work items are linked to this PR. Include these in each reviewer prompt.',
      'The "Requirements Alignment" reviewer should specifically verify that the code changes fulfill these requirements.',
      '',
      workItemContext,
    ].join('\n')
  : '';
```

Then in the return array, insert `workItemSection` before the `extra` line:

```typescript
return [
  'You are a code review coordinator.',
  '',
  'IMPORTANT: Do NOT investigate the code yourself. Do NOT run git diff, read files, or do any exploration.',
  'Your ONLY job is to:',
  '1. Immediately dispatch all reviewers in parallel using the `run_review` MCP tool.',
  '2. Wait for all reviews to complete.',
  '3. Synthesize the findings into a comprehensive summary organized by severity and category.',
  '',
  'When calling `run_review`, set the `backend` field to the backend listed for each reviewer. If a model is specified, set the `model` field accordingly.',
  "Include the diff instructions below in each reviewer's prompt so they know how to find the changes.",
  '',
  '## Diff instructions (include in each reviewer prompt)',
  '',
  diffHint,
  '',
  '## Reviewers',
  '',
  reviewerList,
  '',
  'IMPORTANT: Do NOT implement any changes. Present your findings and recommendations, then wait for the user to decide on next steps.',
  workItemSection,
  extra,
].join('\n');
```

**Step 2: Update the existing call site for `review` steps**

The existing call at line ~847-854 stays the same — it doesn't pass `workItemContext` so no change needed (the parameter is optional).

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`

---

### Task 3: Refactor `tasks:createPrReview` to Use `review` Step Type

**Files:**
- Modify: `electron/ipc/handlers.ts:472-631`

This is the main refactor. The current handler creates a single `agent` step with a hardcoded prompt. We change it to:
1. Fetch PR work items
2. Build work item context string
3. Create a `review` step with predefined reviewers + `ReviewStepMeta`
4. Still create the `pr-review` Step 2 for comment submission

**Step 1: Add import for `getPullRequestWorkItems`**

At the top of `handlers.ts`, find the imports from `azure-devops-service.ts` and add `getPullRequestWorkItems`:

```typescript
import {
  // ...existing imports...
  getPullRequestWorkItems,
} from '../services/azure-devops-service';
```

**Step 2: Add a helper to strip HTML tags from work item descriptions**

Add near the top of the file (or in a utils area) a simple HTML-to-text helper. Work item descriptions from Azure DevOps are HTML. We need plain text for the prompt:

```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

**Step 3: Refactor the handler**

Replace the step creation section (lines 581-615 approximately). The worktree creation + task creation (steps 1-5) remain unchanged. Replace steps 6-7:

```typescript
      // 6. Fetch work items linked to this PR (best-effort, don't fail if unavailable)
      let workItemContext = '';
      try {
        const workItems = await getPullRequestWorkItems({
          providerId: project.repoProviderId!,
          projectId: project.repoProjectId!,
          repoId: project.repoId!,
          pullRequestId,
        });
        if (workItems.length > 0) {
          workItemContext = workItems
            .map((wi) => {
              const desc = wi.fields.description
                ? stripHtml(wi.fields.description)
                : '';
              const repro = wi.fields.reproSteps
                ? stripHtml(wi.fields.reproSteps)
                : '';
              const body = desc || repro;
              return [
                `### ${wi.fields.workItemType} #${wi.id}: ${wi.fields.title}`,
                `State: ${wi.fields.state}`,
                body ? `\n${body}` : '',
              ]
                .filter(Boolean)
                .join('\n');
            })
            .join('\n\n');

          // Also store work item IDs on the task
          await TaskRepository.update(task.id, {
            workItemIds: workItems.map((wi) => String(wi.id)),
            workItemUrls: workItems.map((wi) => wi.url),
          });
        }
      } catch (err) {
        dbg.ipc('Failed to fetch PR work items (non-fatal): %O', err);
      }

      // 7. Build reviewer configs
      const defaultBackend: AgentBackendType =
        (project.defaultAgentBackend as AgentBackendType | null) ?? 'claude-code';

      const reviewers: import('@shared/types').ReviewerConfig[] = [
        {
          id: 'bug-detection',
          label: 'Bug Detection',
          focusPrompt:
            'Look for potential bugs, logic errors, race conditions, null pointer issues, off-by-one errors, and unhandled edge cases in the changed code.',
          backend: defaultBackend,
        },
        {
          id: 'code-quality',
          label: 'Code Quality',
          focusPrompt:
            'Review code quality: naming, structure, readability, DRY violations, function complexity, and adherence to project conventions.',
          backend: defaultBackend,
        },
        {
          id: 'security-performance',
          label: 'Security & Performance',
          focusPrompt:
            'Check for security vulnerabilities (injection, XSS, auth issues) and performance problems (N+1 queries, unnecessary re-renders, memory leaks).',
          backend: defaultBackend,
        },
      ];

      // Add requirements alignment reviewer if work items exist
      if (workItemContext) {
        reviewers.push({
          id: 'requirements-alignment',
          label: 'Requirements Alignment',
          focusPrompt: [
            'Verify that the code changes fulfill the requirements described in the associated work items.',
            'Check that all acceptance criteria are addressed.',
            'Flag any work item requirements that appear to be missing from the implementation.',
            'Flag any code changes that seem unrelated to the work items (scope creep).',
          ].join(' '),
          backend: defaultBackend,
        });
      }

      // 8. Build the review prompt with work item context
      const reviewMeta: import('@shared/types').ReviewStepMeta = { reviewers };

      // Use a minimal base prompt — buildReviewPrompt in agent-service will
      // construct the full coordinator prompt from reviewers + work items.
      const baseReviewPrompt = [
        `Reviewing PR #${pullRequestId}: ${pr.title}`,
        `Changes between \`origin/${targetBranch}\` and the current branch.`,
        '',
        'At the end of your synthesized summary, output a JSON block fenced with ```json containing an array of review comments with this shape:',
        '`[{ "filePath": "path/to/file", "lineNumber": 42, "comment": "Your review comment" }]`',
        '',
        'Each comment should reference a specific file and line number from the changed files.',
        'Only include actionable comments that warrant posting on the PR.',
      ].join('\n');

      // 9. Create Step 1: Review Changes (review type with MCP dispatch)
      const reviewStep = await StepService.create({
        taskId: task.id,
        name: 'Review Changes',
        type: 'review',
        promptTemplate: baseReviewPrompt,
        interactionMode: 'auto',
        agentBackend: defaultBackend,
        sortOrder: 0,
        meta: reviewMeta,
      });

      // Store workItemContext on the step for buildReviewPrompt to use
      // We pass it via the step's meta so agent-service can access it
      if (workItemContext) {
        await TaskStepRepository.update(reviewStep.id, {
          meta: {
            ...reviewMeta,
            workItemContext,
          } as import('@shared/types').ReviewStepMeta & { workItemContext?: string },
        });
      }

      // 10. Create Step 2: Submit Review (pr-review)
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

      // 11. Auto-start the review step
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        agentService.setMainWindow(window);
      }
      agentService.start(reviewStep.id).catch((err) => {
        dbg.ipc(
          'Error auto-starting review agent for step %s: %O',
          reviewStep.id,
          err,
        );
      });

      return task;
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

---

### Task 4: Pass Work Item Context from Step Meta to `buildReviewPrompt()`

**Files:**
- Modify: `electron/services/agent-service.ts` (around line 847)

The existing code at line ~847 calls `buildReviewPrompt` for `review` steps. We need to extract `workItemContext` from the step meta and pass it through.

**Step 1: Update the `review` step prompt building**

Change the existing block:

```typescript
// For review steps, build the review prompt from reviewer configs
let effectivePrompt = resolvedPrompt;
if (step.type === 'review') {
  const task = await TaskRepository.findById(step.taskId);
  effectivePrompt = buildReviewPrompt({
    basePrompt: resolvedPrompt,
    meta: step.meta as ReviewStepMeta,
    startCommitHash: task?.startCommitHash ?? null,
  });
}
```

To:

```typescript
// For review steps, build the review prompt from reviewer configs
let effectivePrompt = resolvedPrompt;
if (step.type === 'review') {
  const task = await TaskRepository.findById(step.taskId);
  const meta = step.meta as ReviewStepMeta & { workItemContext?: string };
  effectivePrompt = buildReviewPrompt({
    basePrompt: resolvedPrompt,
    meta,
    startCommitHash: task?.startCommitHash ?? null,
    workItemContext: meta.workItemContext,
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

---

### Task 5: Update StepService.create to Accept `type` and `meta`

**Files:**
- Modify: `electron/services/step-service.ts:323-349`

Currently `StepService.create` doesn't have explicit `type` or `meta` parameters in its signature (it relies on the cast `as Parameters<typeof TaskStepRepository.create>[0]`). Verify this works by checking `TaskStepRepository.create` accepts those fields.

**Step 1: Check and update if needed**

Look at the `StepService.create` signature at line 323. It should already handle `type` and `meta` via the cast, but let's make it explicit for clarity:

```typescript
create: async (data: {
  taskId: string;
  name: string;
  type?: TaskStepType;
  dependsOn?: string[];
  promptTemplate: string;
  interactionMode?: InteractionMode | null;
  modelPreference?: ModelPreference | null;
  agentBackend?: AgentBackendType | null;
  images?: PromptImagePart[] | null;
  meta?: TaskStepMeta;
  autoStart?: boolean;
  sortOrder?: number;
}): Promise<TaskStep> => {
```

Add `TaskStepType` and `TaskStepMeta` to the imports at the top of the file if not already present:

```typescript
import type { InteractionMode, ModelPreference, TaskStep, TaskStepType, TaskStepMeta } from '@shared/types';
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

---

### Task 6: Lint & Final Verification

**Step 1: Install dependencies**

Run: `pnpm install`

**Step 2: Auto-fix lint**

Run: `pnpm lint --fix`

**Step 3: TypeScript check**

Run: `pnpm ts-check`

**Step 4: Fix remaining lint errors**

Run: `pnpm lint`

Fix any remaining issues.

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| PR review Step 1 type | `'agent'` (single agent, hardcoded prompt) | `'review'` (multi-reviewer via MCP) |
| PR review reviewers | None (single prompt) | Bug Detection, Code Quality, Security & Performance, Requirements Alignment |
| Work items in prompt | Not included | Fetched from Azure DevOps PR API, injected into all reviewer prompts |
| Requirements check | Not done | Dedicated "Requirements Alignment" reviewer checks code matches work items |
| Step 2 (`pr-review`) | JSON comment extraction + UI | Unchanged |
| `buildReviewPrompt()` | No work item support | Optional `workItemContext` parameter |
| `StepService.create` | No explicit `type`/`meta` params | Explicit typed params |

## Notes

- The `pr-review` step (Step 2) still works because it extracts JSON from the agent output regardless of how that output was generated (single agent vs. multi-reviewer synthesis)
- Work item fetching is best-effort — if it fails, the review proceeds without work item context, and the "Requirements Alignment" reviewer is omitted
- The `workItemContext` is stored in the step meta so it survives restarts and is available when `buildReviewPrompt()` runs
- HTML stripping for work item descriptions is necessary because Azure DevOps returns HTML content
