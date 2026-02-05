# Improved PR Creation in Task Page

## Overview

Enhance the PR pane in the task page to allow creating pull requests directly when no PR is associated. The form integrates with the existing summary feature to auto-generate descriptions and post file-level comments.

## User Flow

1. User opens PR pane for a worktree task with no linked PR
2. Instead of just "No PR found", an inline creation form appears
3. Form starts empty (title, description blank)
4. User can click "Generate Summary" to:
   - Generate AI summary (reuses existing if available)
   - Fill title from task name or prompt
   - Fill description with formatted "What I Did" / "Key Decisions"
   - Show annotations checklist (all checked by default)
5. User edits title/description as needed
6. User toggles which annotations become PR comments
7. User clicks "Create PR" (draft by default)
8. PR is created, then checked annotations become comments prefixed with "jean-claude: "

## Components

### Modified: `ui-task-pr-view/index.tsx`

Update `PrLinkingView` to show the creation form when:
- Repo is linked (`hasRepoLinked === true`)
- Branch exists (`branchName !== null`)
- No matching PRs found (`matchingPrs.length === 0`)

### New: `ui-task-pr-view/pr-creation-form.tsx`

Inline form component with:

**Props:**
```typescript
{
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
}
```

**State:**
```typescript
const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [isDraft, setIsDraft] = useState(true);
const [annotationStates, setAnnotationStates] = useState<
  { annotation: FileAnnotation; checked: boolean }[]
>([]);
```

**Hooks used:**
- `useTaskSummary(taskId)` - fetch existing summary
- `useGenerateSummary()` - generate new summary
- `usePushBranch()` - push branch before PR creation
- `useCreatePullRequest()` - create the PR
- `useCreatePrThreads()` - new hook for posting comments
- `useUpdateTask()` - save PR ID/URL to task

### New: Backend API for PR Threads

**Service: `azure-devops-service.ts`**

```typescript
async createPrThread(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  lineNumber: number;
  content: string;
}): Promise<void>
```

Uses Azure DevOps REST API: `POST /{project}/_apis/git/repositories/{repoId}/pullRequests/{pullRequestId}/threads`

**IPC Handler addition:**
```typescript
'azure-devops:create-pr-thread': (params) => azureDevOpsService.createPrThread(params)
```

**API bridge (`api.ts`):**
```typescript
azureDevOps: {
  // ... existing methods
  createPrThread: (params) => ipcRenderer.invoke('azure-devops:create-pr-thread', params)
}
```

**Hook: `use-create-pull-request.ts`**

Add new mutation:
```typescript
export function useCreatePrThreads() {
  return useMutation({
    mutationFn: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threads: { filePath: string; lineNumber: number; content: string }[];
    }) => Promise.allSettled(
      params.threads.map(thread =>
        api.azureDevOps.createPrThread({
          providerId: params.providerId,
          projectId: params.projectId,
          repoId: params.repoId,
          pullRequestId: params.pullRequestId,
          ...thread
        })
      )
    )
  });
}
```

## Form Layout

```
┌─────────────────────────────────────────────────────┐
│ Create Pull Request                                 │
├─────────────────────────────────────────────────────┤
│ Title                                               │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Description                     [Generate Summary]  │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ─── Comments to Post ─────────────────────────────  │
│ ☑ src/features/task/file.tsx:42                    │
│   "Added form state management..."                  │
│ ☑ electron/services/service.ts:156                 │
│   "New createPrThread method..."                    │
│                                                     │
│ feature-branch → main                               │
│                                                     │
│ ☑ Create as draft                                  │
│ Linked to work item AB#12345                        │
│                                                     │
│        [Cancel]              [Create PR]            │
└─────────────────────────────────────────────────────┘
```

## Description Format After Generation

```markdown
AB#12345

## What I Did
{summary.whatIDid}

## Key Decisions
{summary.keyDecisions}
```

Work item reference only included if `workItemId` is present.

## Comment Format

Each checked annotation becomes a PR thread comment:
```
jean-claude: {annotation.explanation}
```

Posted to the specific file path and line number from the annotation.

## Error Handling

- PR creation failure: Show error, don't post comments
- Comment posting failures: Log warning, show partial success message
- Summary generation failure: Show error, form remains editable

## Implementation Tasks

1. Add `createPrThread` to `azure-devops-service.ts`
2. Add IPC handler for `azure-devops:create-pr-thread`
3. Add `createPrThread` to API bridge in `api.ts`
4. Add `useCreatePrThreads` hook
5. Create `pr-creation-form.tsx` component
6. Modify `ui-task-pr-view/index.tsx` to use new form
7. Pass required props through component hierarchy
