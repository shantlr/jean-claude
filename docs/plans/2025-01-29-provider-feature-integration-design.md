# Provider Feature Integration Design

## Overview

Link Jean-Claude projects to external Azure DevOps resources for two capabilities:

1. **Repository link** — create PRs from completed worktree tasks
2. **Work items link** — browse Azure DevOps work items and create tasks from them

Both links are independently optional. The repo and work items can come from different Azure DevOps projects (but same organization per link). This design is Azure DevOps-first; GitHub/GitLab are future work.

## Data Model

### New columns on `projects` table

Repo link (for PR creation):

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `repoProviderId` | `text` | yes | FK → `providers.id` (Azure DevOps org) |
| `repoProjectId` | `text` | yes | Azure DevOps project ID |
| `repoProjectName` | `text` | yes | Azure DevOps project name (display) |
| `repoId` | `text` | yes | Azure DevOps repository ID |
| `repoName` | `text` | yes | Azure DevOps repository name (display) |

Work items link (for task creation from work items):

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `workItemProviderId` | `text` | yes | FK → `providers.id` (Azure DevOps org) |
| `workItemProjectId` | `text` | yes | Azure DevOps project ID |
| `workItemProjectName` | `text` | yes | Azure DevOps project name (display) |

Both ID and name are stored per Azure DevOps project — ID for API calls, name for display without extra fetches.

### New columns on `tasks` table

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `workItemId` | `text` | yes | Azure DevOps work item ID (e.g., "1234") |
| `workItemUrl` | `text` | yes | Full URL to the work item |
| `pullRequestId` | `text` | yes | Azure DevOps PR ID (e.g., "567") |
| `pullRequestUrl` | `text` | yes | Full URL to the PR |

These provide traceability: task → work item origin + task → PR created.

## Project Settings UI — Linking Repo & Work Items

Located on the existing project details page (`/projects/:projectId/details`).

### Repo Link Section

```
┌─ Link Repository ──────────────────────────────┐
│                                                 │
│  Organization   [Select provider ▾]             │
│  Project        [Select project ▾]              │
│  Repository     [Select repo ▾]                 │
│                                                 │
│                            [Link Repository]    │
└─────────────────────────────────────────────────┘
```

When already linked:

```
┌─ Repository ────────────────────────────────────┐
│                                                 │
│  myorg / MyProject / my-repo                    │
│                                          [Unlink]│
└─────────────────────────────────────────────────┘
```

- Cascading selectors: provider → fetches projects → fetches repos
- Uses existing `providers:getDetails` IPC for project/repo lists
- If no providers exist, hint: "Add an organization in Settings first"

### Work Items Link Section

Same pattern, but only needs provider + project (no repo):

```
┌─ Link Work Items ───────────────────────────────┐
│                                                 │
│  Organization   [Select provider ▾]             │
│  Project        [Select project ▾]              │
│                                                 │
│                          [Link Work Items]      │
└─────────────────────────────────────────────────┘
```

Both sections are independently optional. Saving updates the project via the existing `updateProject` mutation.

## Work Items Browser

When a project has a linked work items source, the new task form (`/projects/:projectId/tasks/new`) gains a "From Work Item" button that opens a work item browser panel.

### Work Items List

```
┌─ Select Work Item ──────────────────────────────────────────┐
│                                                             │
│  Status: [Active ▾]    Type: [All ▾]                        │
│                                                             │
│  ┌───────┬──────────────┬─────────────────────┬──────────┐  │
│  │ ID    │ Type         │ Title               │ State    │  │
│  ├───────┼──────────────┼─────────────────────┼──────────┤  │
│  │ 1234  │ User Story   │ Add login page      │ Active   │  │
│  │ 1235  │ Bug          │ Fix crash on save   │ Active   │  │
│  │ 1236  │ User Story   │ Profile settings    │ New      │  │
│  └───────┴──────────────┴─────────────────────┴──────────┘  │
│                                                             │
│                                              [Select] [Cancel]│
└─────────────────────────────────────────────────────────────┘
```

- **Filters**: status (Active, New, Resolved, Closed) and type (User Story, Bug, Task, Feature)
- **Default filter**: Active status only
- Paginated with reasonable page size (50 items)

### Selection Flow

1. User clicks a work item row
2. New task form is pre-filled:
   - **Prompt**: work item title + description (as markdown), prefixed with `[AB#1234]`
   - **Task name**: work item title (truncated if long)
3. User can edit before submitting
4. `workItemId` and `workItemUrl` saved on the created task

## PR Creation

When a worktree task's project has a linked repo, a "Create PR" button appears alongside existing Commit and Merge actions.

### Create PR Dialog

```
┌─ Create Pull Request ───────────────────────────┐
│                                                 │
│  Title       [Implement login page           ]  │
│  Description [Added login form with...       ]  │
│              [                                ]  │
│  Target      [main ▾]                           │
│  ☑ Create as draft                              │
│                                                 │
│  Work Item   AB#1234 - Add login page           │
│                                                 │
│                          [Cancel] [Create PR]   │
└─────────────────────────────────────────────────┘
```

- **Title**: pre-filled from task name
- **Description**: pre-filled with task prompt or summary; includes work item reference if applicable
- **Target branch**: defaults to project's `defaultBranch`
- **Draft toggle**: default on
- **Work item**: shown if task was created from a work item (informational)

### Backend Flow

1. **Push** — `git push -u origin <branchName>` via worktree service
2. **Create PR** — Azure DevOps REST API: `POST /{projectId}/_apis/git/repositories/{repoId}/pullrequests`
3. **Save** — write `pullRequestId` and `pullRequestUrl` back to the task record
4. **Show success** — dialog with clickable link to the PR in Azure DevOps

### Task PR Badge

After PR creation, the task view shows a clickable `PR #567` badge that opens the PR in the browser. The task list sidebar also shows a small PR indicator icon.

## Backend API

### Azure DevOps Service — New Methods

**`queryWorkItems(params)`**

```typescript
queryWorkItems(params: {
  providerId: string;
  projectId: string;
  filters: {
    states?: string[];      // e.g., ["Active", "New"]
    workItemTypes?: string[]; // e.g., ["User Story", "Bug"]
  };
}): Promise<AzureDevOpsWorkItem[]>
```

Implementation:
1. Look up provider → get tokenId → decrypt token
2. Build WIQL query from filters
3. `POST https://dev.azure.com/{org}/{projectId}/_apis/wit/wiql?api-version=7.0`
4. Batch-fetch work item details: `GET /_apis/wit/workitems?ids=1,2,3&api-version=7.0`
5. Return mapped results

**`createPullRequest(params)`**

```typescript
createPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  isDraft: boolean;
}): Promise<{ id: number; url: string }>
```

Implementation:
1. Look up provider → get tokenId → decrypt token
2. `POST https://dev.azure.com/{org}/{projectId}/_apis/git/repositories/{repoId}/pullrequests?api-version=7.0`
3. Return PR id and url

### Worktree Service — New Method

**`pushBranch(params)`**

```typescript
pushBranch(params: {
  worktreePath: string;
  branchName: string;
  remote?: string; // defaults to "origin"
}): Promise<void>
```

Runs `git push -u origin <branchName>` in the worktree directory.

### IPC Handlers

New handlers:
- `azureDevOps:queryWorkItems` — calls `queryWorkItems`
- `azureDevOps:createPullRequest` — calls `createPullRequest`
- `worktree:pushBranch` — calls `pushBranch`

### Work Item Types

```typescript
interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;   // "User Story", "Bug", "Task", "Feature"
    state: string;          // "New", "Active", "Resolved", "Closed"
    assignedTo?: string;    // Display name
    description?: string;   // HTML content
  };
}
```

## File Changes

### New Files

- `electron/database/migrations/NNN_provider_integration.ts` — add columns to projects and tasks tables
- `src/features/project/ui-repo-link/index.tsx` — repo link section for project details
- `src/features/project/ui-work-items-link/index.tsx` — work items link section for project details
- `src/features/agent/ui-work-items-browser/index.tsx` — work item browser panel for new task form
- `src/features/agent/ui-create-pr-dialog/index.tsx` — create PR dialog
- `src/features/agent/ui-pr-badge/index.tsx` — PR link badge component
- `src/hooks/use-work-items.ts` — React Query hook for work items
- `src/hooks/use-create-pull-request.ts` — React Query mutation for PR creation

### Modified Files

- `electron/database/schema.ts` — add new columns to ProjectTable and TaskTable
- `shared/types.ts` — update Project, UpdateProject, Task, NewTask types
- `electron/services/azure-devops-service.ts` — add `queryWorkItems`, `createPullRequest`
- `electron/services/worktree-service.ts` — add `pushBranch`
- `electron/ipc/handlers.ts` — register new IPC handlers
- `electron/preload.ts` — expose new methods
- `src/lib/api.ts` — add new API types and methods
- `src/routes/projects/$projectId/details.tsx` — add repo link and work items link sections
- `src/routes/projects/$projectId/tasks/new.tsx` — add "From Work Item" button and browser
- `src/features/agent/ui-worktree-actions/index.tsx` — add "Create PR" button
- `src/features/task/ui-task-list-item/index.tsx` — add PR indicator icon

## Implementation Phases

### Phase 1 — Data Model & Project Linking UI

- Database migration (new columns on projects + tasks)
- Update schema types, shared types, repositories
- Project details page: repo link section with cascading selectors
- Project details page: work items link section with cascading selectors

### Phase 2 — Work Items Browser

- Azure DevOps service: `queryWorkItems` method (WIQL + batch fetch)
- IPC handler, preload bridge, API types
- React Query hook: `useWorkItems`
- New task form: "From Work Item" button and panel
- Work items list with status and type filters
- Selection pre-fills task form with work item data

### Phase 3 — PR Creation

- Azure DevOps service: `createPullRequest` method
- Worktree service: `pushBranch` method
- IPC handlers, preload bridge, API types
- React Query mutation: `useCreatePullRequest`
- "Create PR" button in worktree actions (visible when repo linked)
- Create PR dialog with pre-filled fields
- Save PR id/url to task on success
- PR link badge on task view and task list

## Out of Scope

- Clone-from-provider project creation flow
- Work item status sync (update Azure DevOps when task completes)
- PR status sync (show open/merged/closed in Jean-Claude)
- PR review trigger (create review task from PR)
- GitHub / GitLab provider implementations
