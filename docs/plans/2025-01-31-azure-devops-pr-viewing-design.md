# Azure DevOps PR Viewing Integration

## Overview

Add pull request viewing capabilities to projects with linked Azure DevOps repos. Users can toggle between task list and PR list in the project sidebar, and view full PR details including diffs and comments.

## Key Decisions

- PR button only visible when project has `repoProviderId` set
- Tab-style toggle: `[Tasks | PRs]` in sidebar header
- When viewing PRs: "New Task" becomes "Back" button
- PR detail route: `/projects/:projectId/prs/:prId`
- PR list shows: number, title, status, author, target branch, created date
- PR detail shows: metadata, description, commits, changed files with diffs, comments thread
- Comments: both PR-level and inline file-level supported

## Backend Changes

### New Types (`shared/azure-devops-types.ts`)

```typescript
export interface AzureDevOpsPullRequest {
  id: number;
  title: string;
  status: 'active' | 'completed' | 'abandoned';
  isDraft: boolean;
  createdBy: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string; // refs/heads/feature-branch
  targetRefName: string; // refs/heads/main
  url: string; // Web URL to PR
}

export interface AzureDevOpsPullRequestDetails extends AzureDevOpsPullRequest {
  description: string;
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet';
  reviewers: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    vote: number; // -10 rejected, -5 waiting, 0 none, 5 approved with suggestions, 10 approved
  }>;
}

export interface AzureDevOpsCommit {
  commitId: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  comment: string;
  url: string;
}

export interface AzureDevOpsFileChange {
  path: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  originalPath?: string; // For renames
}

export interface AzureDevOpsComment {
  id: number;
  parentCommentId?: number;
  content: string;
  author: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  publishedDate: string;
  lastUpdatedDate: string;
  // For file-level comments
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number };
    rightFileEnd?: { line: number };
  };
}

export interface AzureDevOpsCommentThread {
  id: number;
  status: 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending';
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number };
    rightFileEnd?: { line: number };
  };
  comments: AzureDevOpsComment[];
}
```

### New Service Functions (`electron/services/azure-devops-service.ts`)

```typescript
// List pull requests for a repo
export async function listPullRequests(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  status?: 'active' | 'completed' | 'abandoned' | 'all';
}): Promise<AzureDevOpsPullRequest[]>

// Get single PR with full details
export async function getPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsPullRequestDetails>

// Get PR commits
export async function getPullRequestCommits(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsCommit[]>

// Get PR changed files
export async function getPullRequestChanges(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsFileChange[]>

// Get file content for diff view
export async function getPullRequestFileContent(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  version: 'base' | 'head';
}): Promise<string>

// Get PR comment threads
export async function getPullRequestThreads(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsCommentThread[]>

// Add PR-level comment
export async function addPullRequestComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  content: string;
}): Promise<AzureDevOpsComment>

// Add file-level comment
export async function addPullRequestFileComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  line: number;
  content: string;
}): Promise<AzureDevOpsComment>
```

## IPC & React Query Hooks

### New IPC Handlers (`electron/ipc/handlers.ts`)

- `azure-devops:list-pull-requests`
- `azure-devops:get-pull-request`
- `azure-devops:get-pull-request-commits`
- `azure-devops:get-pull-request-changes`
- `azure-devops:get-pull-request-file-content`
- `azure-devops:get-pull-request-threads`
- `azure-devops:add-pull-request-comment`
- `azure-devops:add-pull-request-file-comment`

### New Hooks (`src/hooks/use-azure-devops-prs.ts`)

```typescript
// List PRs for a project's linked repo
export function usePullRequests(projectId: string, status?: 'active' | 'all')

// Single PR with details
export function usePullRequest(projectId: string, prId: number)

// PR commits
export function usePullRequestCommits(projectId: string, prId: number)

// PR file changes
export function usePullRequestChanges(projectId: string, prId: number)

// File content for diff
export function usePullRequestFileContent(
  projectId: string,
  prId: number,
  filePath: string,
  version: 'base' | 'head'
)

// PR comment threads
export function usePullRequestThreads(projectId: string, prId: number)

// Mutations
export function useAddPullRequestComment()
export function useAddPullRequestFileComment()
```

The hooks extract `repoProviderId`, `repoProjectId`, and `repoId` from the project internally.

## UI Components & Routes

### Sidebar Changes (`src/layout/ui-project-sidebar/index.tsx`)

- Add state: `viewMode: 'tasks' | 'prs'`
- Conditionally render tab toggle when `project.repoProviderId` exists
- When `viewMode === 'prs'`: show "Back" button + PR list
- When `viewMode === 'tasks'`: show "New Task" button + task list (current)

### New Route

`src/routes/projects/$projectId/prs/$prId.tsx` - PR detail page

### New Components (`src/features/pull-request/`)

| Component | Purpose |
|-----------|---------|
| `ui-pr-list-item/` | PR item in sidebar (number, title, status badge, author, target branch, date) |
| `ui-pr-detail/` | Main PR detail view container |
| `ui-pr-header/` | PR title, status, metadata (author, branches, dates) |
| `ui-pr-description/` | PR description (markdown rendered) |
| `ui-pr-commits/` | Collapsible commits list |
| `ui-pr-files/` | File tree of changed files |
| `ui-pr-diff-view/` | Side-by-side or unified diff with inline comment support |
| `ui-pr-comments/` | PR-level comments thread |
| `ui-pr-comment-form/` | Comment input (reused for PR-level and inline) |

### PR Detail Page Layout

```
+--------------------------------------------------+
| PR Header (title, status, author, branches)      |
+--------------------------------------------------+
| Description (collapsible)                        |
+--------------------------------------------------+
| Tabs: [Files] [Commits] [Comments]               |
+----------------+---------------------------------+
| File tree      | Diff view with inline comments  |
| (resizable)    |                                 |
+----------------+---------------------------------+
```

## Implementation Steps

### Phase 1: Backend & Types
1. Create `shared/azure-devops-types.ts` with PR-related types
2. Add PR functions to `electron/services/azure-devops-service.ts`
3. Add IPC handlers in `electron/ipc/handlers.ts`
4. Update `src/lib/api.ts` with new API methods

### Phase 2: React Query Hooks
5. Create `src/hooks/use-azure-devops-prs.ts` with all PR hooks

### Phase 3: Sidebar PR List
6. Update `src/layout/ui-project-sidebar/index.tsx` with viewMode toggle
7. Create `src/features/pull-request/ui-pr-list-item/index.tsx`

### Phase 4: PR Detail Route & Components
8. Create route `src/routes/projects/$projectId/prs/$prId.tsx`
9. Create `ui-pr-detail/` - main container
10. Create `ui-pr-header/` - title, status, metadata
11. Create `ui-pr-description/` - markdown description
12. Create `ui-pr-commits/` - commits list
13. Create `ui-pr-files/` - file tree
14. Create `ui-pr-diff-view/` - diff viewer
15. Create `ui-pr-comments/` - comments thread
16. Create `ui-pr-comment-form/` - comment input
