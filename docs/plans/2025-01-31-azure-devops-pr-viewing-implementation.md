# Azure DevOps PR Viewing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pull request viewing capabilities to projects with linked Azure DevOps repos, including PR list in sidebar, detail view with diffs, and commenting.

**Architecture:** Backend service functions call Azure DevOps REST API, exposed via IPC handlers to renderer. React Query hooks provide data fetching, sidebar gains viewMode toggle, new route displays PR details with diff view and comments.

**Tech Stack:** TypeScript, Electron IPC, React Query, TanStack Router, Shiki (syntax highlighting), existing DiffView component

---

## Task 1: Create PR Types

**Files:**
- Create: `shared/azure-devops-types.ts`

**Step 1: Create the types file**

```typescript
// shared/azure-devops-types.ts

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
  sourceRefName: string;
  targetRefName: string;
  url: string;
}

export interface AzureDevOpsPullRequestDetails extends AzureDevOpsPullRequest {
  description: string;
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet' | 'queued';
  reviewers: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    vote: number;
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
  originalPath?: string;
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
}

export interface AzureDevOpsCommentThread {
  id: number;
  status: 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending' | 'unknown';
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number; offset: number };
    rightFileEnd?: { line: number; offset: number };
  };
  comments: AzureDevOpsComment[];
  isDeleted: boolean;
}
```

**Step 2: Commit**

```bash
git add shared/azure-devops-types.ts
git commit -m "feat: add Azure DevOps PR types"
```

---

## Task 2: Add PR Service Functions

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add listPullRequests function**

Add after the existing `createPullRequest` function:

```typescript
export interface ListPullRequestsParams {
  providerId: string;
  projectId: string;
  repoId: string;
  status?: 'active' | 'completed' | 'abandoned' | 'all';
}

interface PullRequestsResponse {
  count: number;
  value: Array<{
    pullRequestId: number;
    title: string;
    status: string;
    isDraft: boolean;
    createdBy: {
      displayName: string;
      uniqueName: string;
      imageUrl?: string;
    };
    creationDate: string;
    sourceRefName: string;
    targetRefName: string;
    repository: {
      webUrl: string;
    };
  }>;
}

export async function listPullRequests(
  params: ListPullRequestsParams,
): Promise<AzureDevOpsPullRequest[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const statusParam = params.status === 'all' ? '' : `&searchCriteria.status=${params.status || 'active'}`;
  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests?api-version=7.0${statusParam}`,
    {
      headers: { Authorization: createAuthHeader(token) },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list pull requests: ${error}`);
  }

  const data: PullRequestsResponse = await response.json();

  return data.value.map((pr) => ({
    id: pr.pullRequestId,
    title: pr.title,
    status: pr.status as 'active' | 'completed' | 'abandoned',
    isDraft: pr.isDraft,
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `${pr.repository.webUrl}/pullrequest/${pr.pullRequestId}`,
  }));
}
```

**Step 2: Add getPullRequest function**

```typescript
export interface GetPullRequestParams {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}

interface PullRequestDetailResponse {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  isDraft: boolean;
  mergeStatus: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  reviewers: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    vote: number;
  }>;
  repository: {
    webUrl: string;
  };
}

export async function getPullRequest(
  params: GetPullRequestParams,
): Promise<AzureDevOpsPullRequestDetails> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`,
    {
      headers: { Authorization: createAuthHeader(token) },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request: ${error}`);
  }

  const pr: PullRequestDetailResponse = await response.json();

  return {
    id: pr.pullRequestId,
    title: pr.title,
    description: pr.description || '',
    status: pr.status as 'active' | 'completed' | 'abandoned',
    isDraft: pr.isDraft,
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequestDetails['mergeStatus'],
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    reviewers: pr.reviewers.map((r) => ({
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      vote: r.vote,
    })),
    url: `${pr.repository.webUrl}/pullrequest/${pr.pullRequestId}`,
  };
}
```

**Step 3: Add getPullRequestCommits function**

```typescript
interface CommitsResponse {
  count: number;
  value: Array<{
    commitId: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    comment: string;
    url: string;
  }>;
}

export async function getPullRequestCommits(
  params: GetPullRequestParams,
): Promise<AzureDevOpsCommit[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/commits?api-version=7.0`,
    {
      headers: { Authorization: createAuthHeader(token) },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request commits: ${error}`);
  }

  const data: CommitsResponse = await response.json();

  return data.value.map((c) => ({
    commitId: c.commitId,
    author: {
      name: c.author.name,
      email: c.author.email,
      date: c.author.date,
    },
    comment: c.comment,
    url: c.url,
  }));
}
```

**Step 4: Add getPullRequestIterations and getPullRequestChanges functions**

```typescript
interface IterationsResponse {
  count: number;
  value: Array<{
    id: number;
  }>;
}

interface ChangesResponse {
  changeEntries: Array<{
    changeType: string;
    item: {
      path: string;
    };
    originalPath?: string;
  }>;
}

export async function getPullRequestChanges(
  params: GetPullRequestParams,
): Promise<AzureDevOpsFileChange[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Get iterations first to get the latest iteration ID
  const iterationsResponse = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/iterations?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!iterationsResponse.ok) {
    const error = await iterationsResponse.text();
    throw new Error(`Failed to get pull request iterations: ${error}`);
  }

  const iterations: IterationsResponse = await iterationsResponse.json();
  if (iterations.value.length === 0) {
    return [];
  }

  const latestIterationId = iterations.value[iterations.value.length - 1].id;

  // Get changes for the latest iteration
  const changesResponse = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/iterations/${latestIterationId}/changes?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!changesResponse.ok) {
    const error = await changesResponse.text();
    throw new Error(`Failed to get pull request changes: ${error}`);
  }

  const data: ChangesResponse = await changesResponse.json();

  const changeTypeMap: Record<string, AzureDevOpsFileChange['changeType']> = {
    add: 'add',
    edit: 'edit',
    delete: 'delete',
    rename: 'rename',
  };

  return data.changeEntries.map((c) => ({
    path: c.item.path,
    changeType: changeTypeMap[c.changeType.toLowerCase()] || 'edit',
    originalPath: c.originalPath,
  }));
}
```

**Step 5: Add getPullRequestFileContent function**

```typescript
export interface GetPullRequestFileContentParams {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  version: 'base' | 'head';
}

export async function getPullRequestFileContent(
  params: GetPullRequestFileContentParams,
): Promise<string> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Get the PR to find source and target branches
  const prResponse = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!prResponse.ok) {
    const error = await prResponse.text();
    throw new Error(`Failed to get pull request: ${error}`);
  }

  const pr = await prResponse.json();
  const versionDescriptor = params.version === 'base'
    ? pr.targetRefName.replace('refs/heads/', '')
    : pr.sourceRefName.replace('refs/heads/', '');

  // Get file content
  const contentResponse = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/items?path=${encodeURIComponent(params.filePath)}&versionDescriptor.version=${encodeURIComponent(versionDescriptor)}&versionDescriptor.versionType=branch&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!contentResponse.ok) {
    // File might not exist in base branch (new file)
    if (contentResponse.status === 404) {
      return '';
    }
    const error = await contentResponse.text();
    throw new Error(`Failed to get file content: ${error}`);
  }

  return contentResponse.text();
}
```

**Step 6: Add comment thread functions**

```typescript
interface ThreadsResponse {
  count: number;
  value: Array<{
    id: number;
    status: string;
    threadContext?: {
      filePath: string;
      rightFileStart?: { line: number; offset: number };
      rightFileEnd?: { line: number; offset: number };
    };
    comments: Array<{
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
    }>;
    isDeleted: boolean;
  }>;
}

export async function getPullRequestThreads(
  params: GetPullRequestParams,
): Promise<AzureDevOpsCommentThread[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`,
    {
      headers: { Authorization: createAuthHeader(token) },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request threads: ${error}`);
  }

  const data: ThreadsResponse = await response.json();

  return data.value.map((t) => ({
    id: t.id,
    status: (t.status || 'unknown') as AzureDevOpsCommentThread['status'],
    threadContext: t.threadContext,
    comments: t.comments.map((c) => ({
      id: c.id,
      parentCommentId: c.parentCommentId,
      content: c.content,
      author: {
        displayName: c.author.displayName,
        uniqueName: c.author.uniqueName,
        imageUrl: c.author.imageUrl,
      },
      publishedDate: c.publishedDate,
      lastUpdatedDate: c.lastUpdatedDate,
    })),
    isDeleted: t.isDeleted,
  }));
}

export interface AddPullRequestCommentParams {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  content: string;
}

export async function addPullRequestComment(
  params: AddPullRequestCommentParams,
): Promise<AzureDevOpsCommentThread> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`,
    {
      method: 'POST',
      headers: {
        Authorization: createAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comments: [{ content: params.content, commentType: 1 }],
        status: 'active',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add comment: ${error}`);
  }

  const thread = await response.json();

  return {
    id: thread.id,
    status: thread.status || 'active',
    threadContext: thread.threadContext,
    comments: thread.comments.map((c: ThreadsResponse['value'][0]['comments'][0]) => ({
      id: c.id,
      parentCommentId: c.parentCommentId,
      content: c.content,
      author: {
        displayName: c.author.displayName,
        uniqueName: c.author.uniqueName,
        imageUrl: c.author.imageUrl,
      },
      publishedDate: c.publishedDate,
      lastUpdatedDate: c.lastUpdatedDate,
    })),
    isDeleted: false,
  };
}

export interface AddPullRequestFileCommentParams {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  line: number;
  content: string;
}

export async function addPullRequestFileComment(
  params: AddPullRequestFileCommentParams,
): Promise<AzureDevOpsCommentThread> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`,
    {
      method: 'POST',
      headers: {
        Authorization: createAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comments: [{ content: params.content, commentType: 1 }],
        status: 'active',
        threadContext: {
          filePath: params.filePath,
          rightFileStart: { line: params.line, offset: 1 },
          rightFileEnd: { line: params.line, offset: 1 },
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add file comment: ${error}`);
  }

  const thread = await response.json();

  return {
    id: thread.id,
    status: thread.status || 'active',
    threadContext: thread.threadContext,
    comments: thread.comments.map((c: ThreadsResponse['value'][0]['comments'][0]) => ({
      id: c.id,
      parentCommentId: c.parentCommentId,
      content: c.content,
      author: {
        displayName: c.author.displayName,
        uniqueName: c.author.uniqueName,
        imageUrl: c.author.imageUrl,
      },
      publishedDate: c.publishedDate,
      lastUpdatedDate: c.lastUpdatedDate,
    })),
    isDeleted: false,
  };
}
```

**Step 7: Add imports at the top of the file**

Add to imports:

```typescript
import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
} from '../../shared/azure-devops-types';
```

**Step 8: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add Azure DevOps PR service functions"
```

---

## Task 3: Add IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add imports**

Add to the azure-devops-service imports:

```typescript
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
  queryWorkItems,
  createPullRequest,
  cloneRepository,
  listPullRequests,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestChanges,
  getPullRequestFileContent,
  getPullRequestThreads,
  addPullRequestComment,
  addPullRequestFileComment,
  type CloneRepositoryParams,
  type ListPullRequestsParams,
  type GetPullRequestParams,
  type GetPullRequestFileContentParams,
  type AddPullRequestCommentParams,
  type AddPullRequestFileCommentParams,
} from '../services/azure-devops-service';
```

**Step 2: Add IPC handlers after the cloneRepository handler**

```typescript
  ipcMain.handle(
    'azureDevOps:listPullRequests',
    (_, params: ListPullRequestsParams) => listPullRequests(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequest',
    (_, params: GetPullRequestParams) => getPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestCommits',
    (_, params: GetPullRequestParams) => getPullRequestCommits(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestChanges',
    (_, params: GetPullRequestParams) => getPullRequestChanges(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestFileContent',
    (_, params: GetPullRequestFileContentParams) => getPullRequestFileContent(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestThreads',
    (_, params: GetPullRequestParams) => getPullRequestThreads(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestComment',
    (_, params: AddPullRequestCommentParams) => addPullRequestComment(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestFileComment',
    (_, params: AddPullRequestFileCommentParams) => addPullRequestFileComment(params),
  );
```

**Step 3: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handlers for PR endpoints"
```

---

## Task 4: Update Preload Bridge

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add PR methods to azureDevOps object**

Add after `cloneRepository`:

```typescript
    listPullRequests: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      status?: 'active' | 'completed' | 'abandoned' | 'all';
    }) => ipcRenderer.invoke('azureDevOps:listPullRequests', params),
    getPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequest', params),
    getPullRequestCommits: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestCommits', params),
    getPullRequestChanges: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestChanges', params),
    getPullRequestFileContent: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      version: 'base' | 'head';
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestFileContent', params),
    getPullRequestThreads: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestThreads', params),
    addPullRequestComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:addPullRequestComment', params),
    addPullRequestFileComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      line: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:addPullRequestFileComment', params),
```

**Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add PR methods to preload bridge"
```

---

## Task 5: Update API Types

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add PR type imports**

Add import at top:

```typescript
import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
} from '../../shared/azure-devops-types';
```

**Step 2: Re-export types for convenience**

Add after imports:

```typescript
export type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
};
```

**Step 3: Add PR methods to Api interface**

Add to the `azureDevOps` object in the `Api` interface:

```typescript
    listPullRequests: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      status?: 'active' | 'completed' | 'abandoned' | 'all';
    }) => Promise<AzureDevOpsPullRequest[]>;
    getPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsPullRequestDetails>;
    getPullRequestCommits: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsCommit[]>;
    getPullRequestChanges: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsFileChange[]>;
    getPullRequestFileContent: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      version: 'base' | 'head';
    }) => Promise<string>;
    getPullRequestThreads: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsCommentThread[]>;
    addPullRequestComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      content: string;
    }) => Promise<AzureDevOpsCommentThread>;
    addPullRequestFileComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      line: number;
      content: string;
    }) => Promise<AzureDevOpsCommentThread>;
```

**Step 4: Add stubs to fallback api object**

Add to the `azureDevOps` object in the fallback:

```typescript
        listPullRequests: async () => [],
        getPullRequest: async () => {
          throw new Error('API not available');
        },
        getPullRequestCommits: async () => [],
        getPullRequestChanges: async () => [],
        getPullRequestFileContent: async () => '',
        getPullRequestThreads: async () => [],
        addPullRequestComment: async () => {
          throw new Error('API not available');
        },
        addPullRequestFileComment: async () => {
          throw new Error('API not available');
        },
```

**Step 5: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add PR methods to API types"
```

---

## Task 6: Create React Query Hooks

**Files:**
- Create: `src/hooks/use-pull-requests.ts`

**Step 1: Create the hooks file**

```typescript
// src/hooks/use-pull-requests.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { useProject } from './use-projects';

// Helper to get repo params from project
function useProjectRepoParams(projectId: string) {
  const { data: project } = useProject(projectId);

  if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId) {
    return null;
  }

  return {
    providerId: project.repoProviderId,
    projectId: project.repoProjectId,
    repoId: project.repoId,
  };
}

export function usePullRequests(
  projectId: string,
  status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequests', projectId, status],
    queryFn: () => api.azureDevOps.listPullRequests({ ...repoParams!, status }),
    enabled: !!repoParams,
  });
}

export function usePullRequest(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequest', projectId, prId],
    queryFn: () => api.azureDevOps.getPullRequest({ ...repoParams!, pullRequestId: prId }),
    enabled: !!repoParams && prId > 0,
  });
}

export function usePullRequestCommits(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequestCommits', projectId, prId],
    queryFn: () => api.azureDevOps.getPullRequestCommits({ ...repoParams!, pullRequestId: prId }),
    enabled: !!repoParams && prId > 0,
  });
}

export function usePullRequestChanges(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequestChanges', projectId, prId],
    queryFn: () => api.azureDevOps.getPullRequestChanges({ ...repoParams!, pullRequestId: prId }),
    enabled: !!repoParams && prId > 0,
  });
}

export function usePullRequestFileContent(
  projectId: string,
  prId: number,
  filePath: string,
  version: 'base' | 'head',
) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequestFileContent', projectId, prId, filePath, version],
    queryFn: () => api.azureDevOps.getPullRequestFileContent({
      ...repoParams!,
      pullRequestId: prId,
      filePath,
      version,
    }),
    enabled: !!repoParams && prId > 0 && !!filePath,
  });
}

export function usePullRequestThreads(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);

  return useQuery({
    queryKey: ['pullRequestThreads', projectId, prId],
    queryFn: () => api.azureDevOps.getPullRequestThreads({ ...repoParams!, pullRequestId: prId }),
    enabled: !!repoParams && prId > 0,
  });
}

export function useAddPullRequestComment(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      api.azureDevOps.addPullRequestComment({
        ...repoParams!,
        pullRequestId: prId,
        content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pullRequestThreads', projectId, prId] });
    },
  });
}

export function useAddPullRequestFileComment(projectId: string, prId: number) {
  const repoParams = useProjectRepoParams(projectId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { filePath: string; line: number; content: string }) =>
      api.azureDevOps.addPullRequestFileComment({
        ...repoParams!,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pullRequestThreads', projectId, prId] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-pull-requests.ts
git commit -m "feat: add React Query hooks for PRs"
```

---

## Task 7: Create PR List Item Component

**Files:**
- Create: `src/features/pull-request/ui-pr-list-item/index.tsx`

**Step 1: Create directory and component**

```typescript
// src/features/pull-request/ui-pr-list-item/index.tsx

import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitBranch, GitPullRequest } from 'lucide-react';

import { formatRelativeTime } from '@/lib/time';

import type { AzureDevOpsPullRequest } from '../../../../shared/azure-devops-types';

function getStatusColor(status: string, isDraft: boolean): string {
  if (isDraft) return 'text-neutral-400';
  switch (status) {
    case 'active':
      return 'text-blue-400';
    case 'completed':
      return 'text-green-400';
    case 'abandoned':
      return 'text-red-400';
    default:
      return 'text-neutral-400';
  }
}

function getStatusLabel(status: string, isDraft: boolean): string {
  if (isDraft) return 'Draft';
  switch (status) {
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'abandoned':
      return 'Abandoned';
    default:
      return status;
  }
}

export function PrListItem({
  pr,
  projectId,
  isActive,
}: {
  pr: AzureDevOpsPullRequest;
  projectId: string;
  isActive?: boolean;
}) {
  const targetBranch = pr.targetRefName.replace('refs/heads/', '');

  return (
    <Link
      to="/projects/$projectId/prs/$prId"
      params={{ projectId, prId: String(pr.id) }}
      className={clsx(
        'flex flex-col gap-1 rounded-lg px-3 py-2 transition-colors',
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800',
      )}
    >
      <div className="flex items-center gap-2">
        <GitPullRequest
          className={clsx('h-4 w-4 shrink-0', getStatusColor(pr.status, pr.isDraft))}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          #{pr.id} {pr.title}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-6 text-xs text-neutral-400">
        <span className={getStatusColor(pr.status, pr.isDraft)}>
          {getStatusLabel(pr.status, pr.isDraft)}
        </span>
        <span>•</span>
        <span className="truncate">{pr.createdBy.displayName}</span>
      </div>
      <div className="flex items-center gap-1 pl-6 text-xs text-neutral-500">
        <GitBranch className="h-3 w-3 shrink-0" />
        <span className="truncate">→ {targetBranch}</span>
      </div>
      <span className="pl-6 text-xs text-neutral-500">
        {formatRelativeTime(pr.creationDate)}
      </span>
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pull-request/ui-pr-list-item/index.tsx
git commit -m "feat: add PR list item component"
```

---

## Task 8: Update Project Sidebar with ViewMode Toggle

**Files:**
- Modify: `src/layout/ui-project-sidebar/index.tsx`

**Step 1: Add imports**

```typescript
import { ArrowLeft, GitPullRequest } from 'lucide-react';
import { useState } from 'react';

import { PrListItem } from '@/features/pull-request/ui-pr-list-item';
import { usePullRequests } from '@/hooks/use-pull-requests';
```

**Step 2: Add viewMode state and PR query inside component**

After the existing hooks, add:

```typescript
  const [viewMode, setViewMode] = useState<'tasks' | 'prs'>('tasks');
  const { data: pullRequests, isLoading: prsLoading } = usePullRequests(
    projectId!,
    'active',
  );

  const hasLinkedRepo = !!project?.repoProviderId;
```

**Step 3: Replace the "New task button" section**

Replace the `{/* New task button */}` section with:

```typescript
      {/* Action buttons */}
      <div className="border-b border-neutral-700 p-3">
        {viewMode === 'tasks' ? (
          <div className="flex gap-2">
            <Link
              to="/projects/$projectId/tasks/new"
              params={{ projectId: project.id }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
            >
              <Plus className="h-4 w-4" />
              New Task
            </Link>
            {hasLinkedRepo && (
              <button
                onClick={() => setViewMode('prs')}
                className="flex items-center justify-center rounded-lg bg-neutral-700 px-3 py-2 transition-colors hover:bg-neutral-600"
                title="View Pull Requests"
              >
                <GitPullRequest className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('tasks')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2">
              <GitPullRequest className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
```

**Step 4: Update the task list section**

Replace the `{/* Task list */}` section with:

```typescript
      {/* List content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {viewMode === 'tasks' ? (
          // Task list
          hasTasks ? (
            <div className="flex flex-col gap-4">
              {/* Active tasks section */}
              {localActiveTasks.length > 0 && (
                <div className="flex flex-col gap-1">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleActiveDragEnd}
                  >
                    <SortableContext
                      items={localActiveTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localActiveTasks.map((task) => (
                        <SortableTaskListItem
                          key={task.id}
                          task={task}
                          projectId={project.id}
                          isActive={task.id === taskId}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {/* Completed tasks section */}
              {localCompletedTasks.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Completed
                  </span>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleCompletedDragEnd}
                  >
                    <SortableContext
                      items={localCompletedTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localCompletedTasks.map((task) => (
                        <SortableTaskListItem
                          key={task.id}
                          task={task}
                          projectId={project.id}
                          isActive={task.id === taskId}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              No tasks yet
            </div>
          )
        ) : (
          // PR list
          prsLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              Loading PRs...
            </div>
          ) : pullRequests && pullRequests.length > 0 ? (
            <div className="flex flex-col gap-1">
              {pullRequests.map((pr) => (
                <PrListItem
                  key={pr.id}
                  pr={pr}
                  projectId={project.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              No active PRs
            </div>
          )
        )}
      </div>
```

**Step 5: Commit**

```bash
git add src/layout/ui-project-sidebar/index.tsx
git commit -m "feat: add viewMode toggle for PRs in sidebar"
```

---

## Task 9: Create PR Detail Route

**Files:**
- Create: `src/routes/projects/$projectId/prs/$prId.tsx`

**Step 1: Create directory structure and route file**

```typescript
// src/routes/projects/$projectId/prs/$prId.tsx

import { createFileRoute } from '@tanstack/react-router';

import { PrDetail } from '@/features/pull-request/ui-pr-detail';

export const Route = createFileRoute('/projects/$projectId/prs/$prId')({
  component: PrDetailPage,
});

function PrDetailPage() {
  const { projectId, prId } = Route.useParams();

  return <PrDetail projectId={projectId} prId={Number(prId)} />;
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/prs/\$prId.tsx
git commit -m "feat: add PR detail route"
```

---

## Task 10: Create PR Detail Component

**Files:**
- Create: `src/features/pull-request/ui-pr-detail/index.tsx`

**Step 1: Create component**

```typescript
// src/features/pull-request/ui-pr-detail/index.tsx

import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquare,
} from 'lucide-react';
import { useState } from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  usePullRequest,
  usePullRequestChanges,
  usePullRequestCommits,
  usePullRequestThreads,
} from '@/hooks/use-pull-requests';
import { formatRelativeTime } from '@/lib/time';

import { PrComments } from '../ui-pr-comments';
import { PrDiffView } from '../ui-pr-diff-view';
import { PrFileTree } from '../ui-pr-file-tree';

type Tab = 'files' | 'commits' | 'comments';

export function PrDetail({
  projectId,
  prId,
}: {
  projectId: string;
  prId: number;
}) {
  const { data: pr, isLoading } = usePullRequest(projectId, prId);
  const { data: changes } = usePullRequestChanges(projectId, prId);
  const { data: commits } = usePullRequestCommits(projectId, prId);
  const { data: threads } = usePullRequestThreads(projectId, prId);

  const [activeTab, setActiveTab] = useState<Tab>('files');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);

  const { width, containerRef, handleRef, isResizing } = useHorizontalResize({
    initialWidth: 250,
    minWidth: 150,
    maxWidth: 400,
  });

  if (isLoading || !pr) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading PR...
      </div>
    );
  }

  const sourceBranch = pr.sourceRefName.replace('refs/heads/', '');
  const targetBranch = pr.targetRefName.replace('refs/heads/', '');

  // Filter to only PR-level comments (no file context)
  const prLevelThreads = threads?.filter((t) => !t.threadContext && !t.isDeleted) ?? [];
  const fileThreads = threads?.filter((t) => t.threadContext && !t.isDeleted) ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-neutral-700 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <GitPullRequest
                className={clsx(
                  'h-5 w-5 shrink-0',
                  pr.isDraft
                    ? 'text-neutral-400'
                    : pr.status === 'completed'
                      ? 'text-green-400'
                      : 'text-blue-400',
                )}
              />
              <h1 className="truncate text-lg font-semibold">
                #{pr.id} {pr.title}
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-400">
              <span className="flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                {sourceBranch} → {targetBranch}
              </span>
              <span>by {pr.createdBy.displayName}</span>
              <span>{formatRelativeTime(pr.creationDate)}</span>
              {pr.mergeStatus && pr.mergeStatus !== 'notSet' && (
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 text-xs',
                    pr.mergeStatus === 'succeeded'
                      ? 'bg-green-500/20 text-green-400'
                      : pr.mergeStatus === 'conflicts'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400',
                  )}
                >
                  {pr.mergeStatus}
                </span>
              )}
            </div>
          </div>
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
          >
            Open in Azure DevOps
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Description (collapsible) */}
      {pr.description && (
        <div className="border-b border-neutral-700">
          <button
            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800"
          >
            {descriptionExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Description
          </button>
          {descriptionExpanded && (
            <div className="px-4 pb-3 text-sm text-neutral-300 whitespace-pre-wrap">
              {pr.description}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <button
          onClick={() => setActiveTab('files')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm',
            activeTab === 'files'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-neutral-400 hover:text-neutral-200',
          )}
        >
          Files
          {changes && (
            <span className="rounded bg-neutral-700 px-1.5 text-xs">
              {changes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('commits')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm',
            activeTab === 'commits'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-neutral-400 hover:text-neutral-200',
          )}
        >
          <GitCommit className="h-4 w-4" />
          Commits
          {commits && (
            <span className="rounded bg-neutral-700 px-1.5 text-xs">
              {commits.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('comments')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm',
            activeTab === 'comments'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-neutral-400 hover:text-neutral-200',
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Comments
          {prLevelThreads.length > 0 && (
            <span className="rounded bg-neutral-700 px-1.5 text-xs">
              {prLevelThreads.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div ref={containerRef} className="relative min-h-0 flex-1 flex">
        {activeTab === 'files' && (
          <>
            {/* File tree */}
            <div
              style={{ width }}
              className="flex flex-col border-r border-neutral-700 overflow-hidden"
            >
              <PrFileTree
                changes={changes ?? []}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                fileThreads={fileThreads}
              />
            </div>

            {/* Resize handle */}
            <div
              ref={handleRef}
              className={clsx(
                'w-1 cursor-col-resize hover:bg-blue-500/50',
                isResizing && 'bg-blue-500/50',
              )}
            />

            {/* Diff view */}
            <div className="min-w-0 flex-1 overflow-auto">
              {selectedFile ? (
                <PrDiffView
                  projectId={projectId}
                  prId={prId}
                  filePath={selectedFile}
                  changeType={changes?.find((c) => c.path === selectedFile)?.changeType ?? 'edit'}
                  fileThreads={fileThreads.filter(
                    (t) => t.threadContext?.filePath === selectedFile,
                  )}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-500">
                  Select a file to view diff
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'commits' && (
          <div className="flex-1 overflow-auto p-4">
            {commits && commits.length > 0 ? (
              <div className="flex flex-col gap-2">
                {commits.map((commit) => (
                  <div
                    key={commit.commitId}
                    className="rounded-lg border border-neutral-700 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <GitCommit className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{commit.comment}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {commit.author.name} • {formatRelativeTime(commit.author.date)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-neutral-600">
                          {commit.commitId.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-500">
                No commits
              </div>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="flex-1 overflow-auto">
            <PrComments
              projectId={projectId}
              prId={prId}
              threads={prLevelThreads}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pull-request/ui-pr-detail/index.tsx
git commit -m "feat: add PR detail component"
```

---

## Task 11: Create PR File Tree Component

**Files:**
- Create: `src/features/pull-request/ui-pr-file-tree/index.tsx`

**Step 1: Create component**

```typescript
// src/features/pull-request/ui-pr-file-tree/index.tsx

import clsx from 'clsx';
import { File, FilePlus, FileX, MessageSquare, Pencil } from 'lucide-react';

import type { AzureDevOpsFileChange, AzureDevOpsCommentThread } from '../../../../shared/azure-devops-types';

function getFileIcon(changeType: string) {
  switch (changeType) {
    case 'add':
      return <FilePlus className="h-4 w-4 text-green-400" />;
    case 'delete':
      return <FileX className="h-4 w-4 text-red-400" />;
    case 'rename':
      return <Pencil className="h-4 w-4 text-yellow-400" />;
    default:
      return <File className="h-4 w-4 text-blue-400" />;
  }
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

function getDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

export function PrFileTree({
  changes,
  selectedFile,
  onSelectFile,
  fileThreads,
}: {
  changes: AzureDevOpsFileChange[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  fileThreads: AzureDevOpsCommentThread[];
}) {
  // Count comments per file
  const commentCountByFile = fileThreads.reduce(
    (acc, thread) => {
      const filePath = thread.threadContext?.filePath;
      if (filePath) {
        acc[filePath] = (acc[filePath] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex-1 overflow-auto p-2">
      <div className="flex flex-col gap-0.5">
        {changes.map((change) => {
          const commentCount = commentCountByFile[change.path] ?? 0;

          return (
            <button
              key={change.path}
              onClick={() => onSelectFile(change.path)}
              className={clsx(
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                selectedFile === change.path
                  ? 'bg-neutral-700'
                  : 'hover:bg-neutral-800',
              )}
              title={change.path}
            >
              {getFileIcon(change.changeType)}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{getFileName(change.path)}</div>
                <div className="truncate text-xs text-neutral-500">
                  {getDirectory(change.path)}
                </div>
              </div>
              {commentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-neutral-400">
                  <MessageSquare className="h-3 w-3" />
                  {commentCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pull-request/ui-pr-file-tree/index.tsx
git commit -m "feat: add PR file tree component"
```

---

## Task 12: Create PR Diff View Component

**Files:**
- Create: `src/features/pull-request/ui-pr-diff-view/index.tsx`

**Step 1: Create component**

```typescript
// src/features/pull-request/ui-pr-diff-view/index.tsx

import { DiffView } from '@/features/agent/ui-diff-view';
import { usePullRequestFileContent } from '@/hooks/use-pull-requests';

import type { AzureDevOpsCommentThread } from '../../../../shared/azure-devops-types';

import { InlineComments } from './inline-comments';

export function PrDiffView({
  projectId,
  prId,
  filePath,
  changeType,
  fileThreads,
}: {
  projectId: string;
  prId: number;
  filePath: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  fileThreads: AzureDevOpsCommentThread[];
}) {
  const { data: baseContent, isLoading: baseLoading } = usePullRequestFileContent(
    projectId,
    prId,
    filePath,
    'base',
  );
  const { data: headContent, isLoading: headLoading } = usePullRequestFileContent(
    projectId,
    prId,
    filePath,
    'head',
  );

  if (baseLoading || headLoading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading diff...
      </div>
    );
  }

  const oldString = changeType === 'add' ? '' : (baseContent ?? '');
  const newString = changeType === 'delete' ? '' : (headContent ?? '');

  return (
    <div className="flex h-full flex-col">
      {/* File path header */}
      <div className="border-b border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300">
        {filePath}
      </div>

      {/* Diff */}
      <div className="min-h-0 flex-1">
        <DiffView
          filePath={filePath}
          oldString={oldString}
          newString={newString}
        />
      </div>

      {/* Inline comments */}
      {fileThreads.length > 0 && (
        <div className="border-t border-neutral-700">
          <InlineComments threads={fileThreads} projectId={projectId} prId={prId} />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create InlineComments sub-component**

Create `src/features/pull-request/ui-pr-diff-view/inline-comments.tsx`:

```typescript
// src/features/pull-request/ui-pr-diff-view/inline-comments.tsx

import clsx from 'clsx';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';

import { useAddPullRequestFileComment } from '@/hooks/use-pull-requests';
import { formatRelativeTime } from '@/lib/time';

import type { AzureDevOpsCommentThread } from '../../../../shared/azure-devops-types';

export function InlineComments({
  threads,
  projectId,
  prId,
}: {
  threads: AzureDevOpsCommentThread[];
  projectId: string;
  prId: number;
}) {
  return (
    <div className="max-h-48 overflow-auto p-2">
      <div className="mb-2 flex items-center gap-1 text-xs font-medium text-neutral-400">
        <MessageSquare className="h-3 w-3" />
        File Comments ({threads.length})
      </div>
      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} projectId={projectId} prId={prId} />
        ))}
      </div>
    </div>
  );
}

function ThreadItem({
  thread,
  projectId,
  prId,
}: {
  thread: AzureDevOpsCommentThread;
  projectId: string;
  prId: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const addComment = useAddPullRequestFileComment(projectId, prId);

  const lineNumber = thread.threadContext?.rightFileStart?.line;
  const filePath = thread.threadContext?.filePath ?? '';

  const handleReply = () => {
    if (!replyContent.trim() || !lineNumber) return;

    addComment.mutate(
      { filePath, line: lineNumber, content: replyContent },
      {
        onSuccess: () => {
          setReplyContent('');
          setShowReply(false);
        },
      },
    );
  };

  return (
    <div className="rounded border border-neutral-700 bg-neutral-800/50 p-2">
      {lineNumber && (
        <div className="mb-1 text-xs text-neutral-500">Line {lineNumber}</div>
      )}
      {thread.comments.map((comment) => (
        <div key={comment.id} className="mb-2 last:mb-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-neutral-300">
              {comment.author.displayName}
            </span>
            <span className="text-neutral-500">
              {formatRelativeTime(comment.publishedDate)}
            </span>
          </div>
          <div className="mt-1 text-sm text-neutral-300 whitespace-pre-wrap">
            {comment.content}
          </div>
        </div>
      ))}

      {showReply ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleReply}
              disabled={!replyContent.trim() || addComment.isPending}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              Reply
            </button>
            <button
              onClick={() => setShowReply(false)}
              className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowReply(true)}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          Reply
        </button>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/features/pull-request/ui-pr-diff-view/index.tsx src/features/pull-request/ui-pr-diff-view/inline-comments.tsx
git commit -m "feat: add PR diff view with inline comments"
```

---

## Task 13: Create PR Comments Component

**Files:**
- Create: `src/features/pull-request/ui-pr-comments/index.tsx`

**Step 1: Create component**

```typescript
// src/features/pull-request/ui-pr-comments/index.tsx

import { useState } from 'react';

import { useAddPullRequestComment } from '@/hooks/use-pull-requests';
import { formatRelativeTime } from '@/lib/time';

import type { AzureDevOpsCommentThread } from '../../../../shared/azure-devops-types';

export function PrComments({
  projectId,
  prId,
  threads,
}: {
  projectId: string;
  prId: number;
  threads: AzureDevOpsCommentThread[];
}) {
  const [newComment, setNewComment] = useState('');
  const addComment = useAddPullRequestComment(projectId, prId);

  const handleSubmit = () => {
    if (!newComment.trim()) return;

    addComment.mutate(newComment, {
      onSuccess: () => setNewComment(''),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Comment list */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {threads.length > 0 ? (
          <div className="flex flex-col gap-4">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4"
              >
                {thread.comments.map((comment, index) => (
                  <div
                    key={comment.id}
                    className={index > 0 ? 'mt-4 border-t border-neutral-700 pt-4' : ''}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{comment.author.displayName}</span>
                      <span className="text-sm text-neutral-500">
                        {formatRelativeTime(comment.publishedDate)}
                      </span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-neutral-300">
                      {comment.content}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">
            No comments yet
          </div>
        )}
      </div>

      {/* New comment form */}
      <div className="border-t border-neutral-700 p-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || addComment.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {addComment.isPending ? 'Posting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pull-request/ui-pr-comments/index.tsx
git commit -m "feat: add PR comments component"
```

---

## Task 14: Final Integration & Lint

**Step 1: Run lint to check for issues**

```bash
pnpm lint --fix
```

**Step 2: Fix any lint errors**

Address any lint errors that arise.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: address lint issues"
```

---

## Summary

This plan creates:

1. **Types** (`shared/azure-devops-types.ts`) - PR, commit, file change, comment types
2. **Service functions** - 8 functions for Azure DevOps REST API
3. **IPC handlers** - Bridge between main and renderer
4. **Preload bridge** - Expose methods to renderer
5. **API types** - TypeScript interfaces for renderer
6. **React Query hooks** - Data fetching with caching
7. **UI Components**:
   - `ui-pr-list-item` - Sidebar list item
   - `ui-pr-detail` - Main detail view with tabs
   - `ui-pr-file-tree` - File tree sidebar
   - `ui-pr-diff-view` - Diff viewer with inline comments
   - `ui-pr-comments` - PR-level comments
8. **Route** - `/projects/:projectId/prs/:prId`
9. **Sidebar update** - viewMode toggle for tasks/PRs
