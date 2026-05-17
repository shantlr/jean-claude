# PR Approval & Auto-Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PR vote (all 5 levels) and auto-complete (merge strategy, delete branch, transition work items, commit message) controls to the PR detail header.

**Architecture:** Two new Azure DevOps API calls (`votePullRequest`, `setPullRequestAutoComplete`) wired through service → IPC → preload → API → hooks. Two new UI components (`ui-pr-vote-dropdown`, `ui-pr-auto-complete`) rendered in `PrHeader`. `getCurrentUser` already exists end-to-end. PR response mapping updated to capture `autoCompleteSetBy` and `completionOptions`.

**Tech Stack:** TypeScript, React, TanStack Query, Electron IPC, Azure DevOps REST API 7.0, Zustand (existing Dropdown component for menus)

---

### Task 1: Update Types — Add auto-complete fields to PR details

**Files:**
- Modify: `shared/azure-devops-types.ts:66-69`

**Step 1: Add `autoCompleteSetBy` and `completionOptions` to `AzureDevOpsPullRequestDetails`**

In `shared/azure-devops-types.ts`, add after the existing `mergeStatus` field on line 68:

```ts
export interface AzureDevOpsPullRequestDetails extends AzureDevOpsPullRequest {
  description: string;
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet';
  autoCompleteSetBy?: {
    displayName: string;
    id: string;
  };
  completionOptions?: {
    mergeStrategy: 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge';
    deleteSourceBranch: boolean;
    transitionWorkItems: boolean;
    mergeCommitMessage?: string;
  };
}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: PASS (no consumers of the new fields yet)

**Step 3: Commit**

```bash
git add shared/azure-devops-types.ts
git commit -m "feat: add autoComplete types to AzureDevOpsPullRequestDetails"
```

---

### Task 2: Update `PullRequestResponse` and `getPullRequest` mapping

**Files:**
- Modify: `electron/services/azure-devops-service.ts:1271-1293` (PullRequestResponse interface)
- Modify: `electron/services/azure-devops-service.ts:1562-1586` (getPullRequest return mapping)

**Step 1: Add `autoCompleteSetBy` and `completionOptions` to `PullRequestResponse`**

In `electron/services/azure-devops-service.ts`, add to the `PullRequestResponse` interface (after line 1285 `mergeStatus`):

```ts
interface PullRequestResponse {
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
  description?: string;
  mergeStatus?: string;
  autoCompleteSetBy?: {
    displayName: string;
    id: string;
  };
  completionOptions?: {
    mergeStrategy?: string;
    deleteSourceBranch?: boolean;
    transitionWorkItems?: boolean;
    mergeCommitMessage?: string;
  };
  reviewers?: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    vote: number;
    isContainer?: boolean;
  }>;
}
```

**Step 2: Update `getPullRequest` return mapping to include new fields**

In the `getPullRequest` function return object (around line 1562-1586), add the new fields:

```ts
  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: mapPrStatus(pr.status),
    isDraft: pr.isDraft,
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
    description: pr.description ?? '',
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequestDetails['mergeStatus'],
    autoCompleteSetBy: pr.autoCompleteSetBy
      ? {
          displayName: pr.autoCompleteSetBy.displayName,
          id: pr.autoCompleteSetBy.id,
        }
      : undefined,
    completionOptions: pr.completionOptions
      ? {
          mergeStrategy: (pr.completionOptions.mergeStrategy ?? 'noFastForward') as AzureDevOpsPullRequestDetails['completionOptions'] extends infer T ? T extends { mergeStrategy: infer M } ? M : never : never,
          deleteSourceBranch: pr.completionOptions.deleteSourceBranch ?? false,
          transitionWorkItems: pr.completionOptions.transitionWorkItems ?? false,
          mergeCommitMessage: pr.completionOptions.mergeCommitMessage,
        }
      : undefined,
    reviewers: (pr.reviewers ?? []).map((r) => ({
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  };
```

Note: The `mergeStrategy` cast is verbose. Simpler alternative — just cast the whole thing:

```ts
    completionOptions: pr.completionOptions
      ? {
          mergeStrategy: (pr.completionOptions.mergeStrategy ?? 'noFastForward') as 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge',
          deleteSourceBranch: pr.completionOptions.deleteSourceBranch ?? false,
          transitionWorkItems: pr.completionOptions.transitionWorkItems ?? false,
          mergeCommitMessage: pr.completionOptions.mergeCommitMessage,
        }
      : undefined,
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: capture autoCompleteSetBy and completionOptions from PR API response"
```

---

### Task 3: Add `votePullRequest` service function

**Files:**
- Modify: `electron/services/azure-devops-service.ts` (add new export after `getPullRequest`)

**Step 1: Add `votePullRequest` function**

Add after the `getPullRequest` function (after line ~1586):

```ts
export async function votePullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  reviewerId: string;
  vote: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/reviewers/${params.reviewerId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ vote: params.vote }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to vote on pull request: ${error}`);
  }
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add votePullRequest service function"
```

---

### Task 4: Add `setPullRequestAutoComplete` service function

**Files:**
- Modify: `electron/services/azure-devops-service.ts` (add after `votePullRequest`)

**Step 1: Add `setPullRequestAutoComplete` function**

```ts
export async function setPullRequestAutoComplete(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  enabled: boolean;
  autoCompleteSetById?: string;
  completionOptions?: {
    mergeStrategy: string;
    deleteSourceBranch: boolean;
    transitionWorkItems: boolean;
    mergeCommitMessage?: string;
  };
}): Promise<AzureDevOpsPullRequestDetails> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const body = params.enabled
    ? {
        autoCompleteSetBy: { id: params.autoCompleteSetById },
        completionOptions: params.completionOptions,
      }
    : {
        autoCompleteSetBy: { id: '00000000-0000-0000-0000-000000000000' },
      };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set auto-complete: ${error}`);
  }

  const pr: PullRequestResponse = await response.json();

  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: mapPrStatus(pr.status),
    isDraft: pr.isDraft,
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
    description: pr.description ?? '',
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequestDetails['mergeStatus'],
    autoCompleteSetBy: pr.autoCompleteSetBy
      ? {
          displayName: pr.autoCompleteSetBy.displayName,
          id: pr.autoCompleteSetBy.id,
        }
      : undefined,
    completionOptions: pr.completionOptions
      ? {
          mergeStrategy: (pr.completionOptions.mergeStrategy ?? 'noFastForward') as 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge',
          deleteSourceBranch: pr.completionOptions.deleteSourceBranch ?? false,
          transitionWorkItems: pr.completionOptions.transitionWorkItems ?? false,
          mergeCommitMessage: pr.completionOptions.mergeCommitMessage,
        }
      : undefined,
    reviewers: (pr.reviewers ?? []).map((r) => ({
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  };
}
```

Note: The PR mapping is duplicated with `getPullRequest`. Consider extracting a `mapPullRequestResponse` helper to DRY this up. Extract if you'd like, or leave duplication — it's 2 call sites.

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add setPullRequestAutoComplete service function"
```

---

### Task 5: Wire IPC handlers for vote and auto-complete

**Files:**
- Modify: `electron/ipc/handlers.ts:98` (add imports)
- Modify: `electron/ipc/handlers.ts:2081` (add handlers after `requeuePolicyEvaluation`)

**Step 1: Add imports**

Add `votePullRequest` and `setPullRequestAutoComplete` to the import from `azure-devops-service.ts` (around line 76-98):

```ts
import {
  // ... existing imports ...
  votePullRequest,
  setPullRequestAutoComplete,
} from '../services/azure-devops-service';
```

**Step 2: Add IPC handlers**

After the `requeuePolicyEvaluation` handler (around line 2081), add:

```ts
  ipcMain.handle(
    'azureDevOps:votePullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        reviewerId: string;
        vote: number;
      },
    ) => votePullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:setPullRequestAutoComplete',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        enabled: boolean;
        autoCompleteSetById?: string;
        completionOptions?: {
          mergeStrategy: string;
          deleteSourceBranch: boolean;
          transitionWorkItems: boolean;
          mergeCommitMessage?: string;
        };
      },
    ) => setPullRequestAutoComplete(params),
  );
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handlers for votePullRequest and setPullRequestAutoComplete"
```

---

### Task 6: Wire preload bridge

**Files:**
- Modify: `electron/preload.ts:343-347` (add after `requeuePolicyEvaluation`)

**Step 1: Add preload methods**

After the `requeuePolicyEvaluation` method (around line 347), add:

```ts
    votePullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      reviewerId: string;
      vote: number;
    }) => ipcRenderer.invoke('azureDevOps:votePullRequest', params),
    setPullRequestAutoComplete: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
      };
    }) => ipcRenderer.invoke('azureDevOps:setPullRequestAutoComplete', params),
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add preload bridge for votePullRequest and setPullRequestAutoComplete"
```

---

### Task 7: Wire renderer API types

**Files:**
- Modify: `src/lib/api.ts:646-656` (add after `requeuePolicyEvaluation` in azureDevOps section)

**Step 1: Add API type declarations**

After the `requeuePolicyEvaluation` method type (around line 655), add:

```ts
    votePullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      reviewerId: string;
      vote: number;
    }) => Promise<void>;
    setPullRequestAutoComplete: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
      };
    }) => Promise<AzureDevOpsPullRequestDetails>;
```

Also add the same stubs in the mock/fallback API object if one exists (check for the pattern around line 1279-1285).

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add renderer API types for votePullRequest and setPullRequestAutoComplete"
```

---

### Task 8: Add React Query hooks

**Files:**
- Modify: `src/hooks/use-pull-requests.ts` (add at end of file)

**Step 1: Add `useCurrentAzureUser` hook**

```ts
export function useCurrentAzureUser(projectId: string) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery({
    queryKey: ['azure-current-user', repoInfo?.providerId],
    queryFn: () => api.azureDevOps.getCurrentUser(repoInfo!.providerId),
    enabled: !!repoInfo,
    staleTime: Infinity, // User ID never changes
  });
}
```

**Step 2: Add `useVotePullRequest` hook**

```ts
export function useVotePullRequest(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: { reviewerId: string; vote: number }) =>
      api.azureDevOps.votePullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
    },
  });
}
```

**Step 3: Add `useSetAutoComplete` hook**

```ts
export function useSetAutoComplete(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: {
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
      };
    }) =>
      api.azureDevOps.setPullRequestAutoComplete({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
    },
  });
}
```

**Step 4: Add `useAllowedMergeStrategies` (not a hook, a pure function — lives in same file)**

```ts
import type { AzureDevOpsPolicyEvaluation } from '@/lib/api';

// Policy type ID for "Limit merge types"
const MERGE_TYPE_POLICY_ID = 'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab';

export type MergeStrategy = 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge';

const ALL_MERGE_STRATEGIES: MergeStrategy[] = [
  'noFastForward',
  'squash',
  'rebase',
  'rebaseMerge',
];

export function getAllowedMergeStrategies(
  evaluations: AzureDevOpsPolicyEvaluation[],
): MergeStrategy[] {
  const mergePolicy = evaluations.find(
    (e) => e.configuration.type.id === MERGE_TYPE_POLICY_ID,
  );

  if (!mergePolicy) {
    // No merge type policy — all strategies allowed
    return ALL_MERGE_STRATEGIES;
  }

  const settings = mergePolicy.configuration.settings;
  const allowed: MergeStrategy[] = [];
  if (settings.allowNoFastForward) allowed.push('noFastForward');
  if (settings.allowSquash) allowed.push('squash');
  if (settings.allowRebase) allowed.push('rebase');
  if (settings.allowRebaseMerge) allowed.push('rebaseMerge');

  return allowed.length > 0 ? allowed : ALL_MERGE_STRATEGIES;
}

export const MERGE_STRATEGY_LABELS: Record<MergeStrategy, string> = {
  noFastForward: 'Merge (no fast-forward)',
  squash: 'Squash commit',
  rebase: 'Rebase',
  rebaseMerge: 'Rebase and merge',
};
```

Note: `AzureDevOpsPolicyEvaluation` is already imported at the top of `use-pull-requests.ts`.

**Step 5: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add src/hooks/use-pull-requests.ts
git commit -m "feat: add hooks for vote, auto-complete, current user, and merge strategy helpers"
```

---

### Task 9: Create `ui-pr-vote-dropdown` component

**Files:**
- Create: `src/features/pull-request/ui-pr-vote-dropdown/index.tsx`

**Step 1: Create directory and component**

```bash
mkdir -p src/features/pull-request/ui-pr-vote-dropdown
```

```tsx
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  Hand,
  ThumbsUp,
  RotateCcw,
  X,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Dropdown, DropdownItem, DropdownDivider } from '@/common/ui/dropdown';
import {
  useVotePullRequest,
  useCurrentAzureUser,
} from '@/hooks/use-pull-requests';
import type { ReviewerVoteStatus } from '@shared/azure-devops-types';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';

const VOTE_OPTIONS = [
  { vote: 10, label: 'Approve', status: 'approved' as const, icon: Check, color: 'text-green-400' },
  { vote: 5, label: 'Approve with suggestions', status: 'approved-with-suggestions' as const, icon: ThumbsUp, color: 'text-emerald-400' },
  { vote: -5, label: 'Wait for author', status: 'waiting' as const, icon: Hand, color: 'text-amber-400' },
  { vote: -10, label: 'Reject', status: 'rejected' as const, icon: X, color: 'text-red-400' },
] as const;

const VOTE_BUTTON_STYLES: Record<ReviewerVoteStatus, string> = {
  approved: 'bg-green-600 hover:bg-green-700 text-white',
  'approved-with-suggestions': 'bg-emerald-600 hover:bg-emerald-700 text-white',
  waiting: 'bg-amber-600 hover:bg-amber-700 text-white',
  rejected: 'bg-red-600 hover:bg-red-700 text-white',
  none: 'bg-glass-medium hover:bg-bg-3 text-ink-1',
};

const VOTE_LABELS: Record<ReviewerVoteStatus, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved',
  waiting: 'Waiting',
  rejected: 'Rejected',
  none: 'Vote',
};

export function PrVoteDropdown({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const voteMutation = useVotePullRequest(projectId, pr.id);

  // Find current user's vote from reviewers
  const currentVote: ReviewerVoteStatus = useMemo(() => {
    if (!currentUser) return 'none';
    const reviewer = pr.reviewers.find(
      (r) => !r.isContainer && r.uniqueName === currentUser.emailAddress,
    );
    return reviewer?.voteStatus ?? 'none';
  }, [pr.reviewers, currentUser]);

  const handleVote = useCallback(
    (vote: number) => {
      if (!currentUser) return;
      voteMutation.mutate({ reviewerId: currentUser.id, vote });
    },
    [currentUser, voteMutation],
  );

  const handleReset = useCallback(() => {
    if (!currentUser) return;
    voteMutation.mutate({ reviewerId: currentUser.id, vote: 0 });
  }, [currentUser, voteMutation]);

  if (!currentUser) return null;

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className={clsx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            VOTE_BUTTON_STYLES[currentVote],
            voteMutation.isPending && 'opacity-50',
          )}
          disabled={voteMutation.isPending}
        >
          {VOTE_LABELS[currentVote]}
          <ChevronDown className="h-3 w-3" />
        </button>
      }
    >
      {VOTE_OPTIONS.map((option) => (
        <DropdownItem
          key={option.vote}
          onClick={() => handleVote(option.vote)}
          icon={<option.icon className={clsx('h-4 w-4', option.color)} />}
          checked={currentVote === option.status}
        >
          {option.label}
        </DropdownItem>
      ))}
      {currentVote !== 'none' && (
        <>
          <DropdownDivider />
          <DropdownItem
            onClick={handleReset}
            icon={<RotateCcw className="h-4 w-4 text-ink-3" />}
          >
            Reset vote
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/pull-request/ui-pr-vote-dropdown/
git commit -m "feat: create PrVoteDropdown component with all 5 vote levels"
```

---

### Task 10: Create `ui-pr-auto-complete` component

**Files:**
- Create: `src/features/pull-request/ui-pr-auto-complete/index.tsx`

**Step 1: Create directory and component**

```bash
mkdir -p src/features/pull-request/ui-pr-auto-complete
```

```tsx
import clsx from 'clsx';
import { GitMerge, Loader2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Dropdown } from '@/common/ui/dropdown';
import {
  useSetAutoComplete,
  useCurrentAzureUser,
  usePullRequestPolicyEvaluations,
  getAllowedMergeStrategies,
  MERGE_STRATEGY_LABELS,
} from '@/hooks/use-pull-requests';
import type { MergeStrategy } from '@/hooks/use-pull-requests';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';

export function PrAutoComplete({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const autoCompleteMutation = useSetAutoComplete(projectId, pr.id);
  const { data: evaluations = [] } = usePullRequestPolicyEvaluations(
    projectId,
    pr.id,
  );

  const allowedStrategies = useMemo(
    () => getAllowedMergeStrategies(evaluations),
    [evaluations],
  );

  const isAutoCompleteSet = !!pr.autoCompleteSetBy;

  // Form state for the popover
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>(
    pr.completionOptions?.mergeStrategy ?? allowedStrategies[0] ?? 'noFastForward',
  );
  const [deleteSourceBranch, setDeleteSourceBranch] = useState(
    pr.completionOptions?.deleteSourceBranch ?? true,
  );
  const [transitionWorkItems, setTransitionWorkItems] = useState(
    pr.completionOptions?.transitionWorkItems ?? true,
  );
  const [mergeCommitMessage, setMergeCommitMessage] = useState(
    pr.completionOptions?.mergeCommitMessage ?? '',
  );
  const [showCommitMessage, setShowCommitMessage] = useState(
    !!pr.completionOptions?.mergeCommitMessage,
  );

  const handleEnable = useCallback(() => {
    if (!currentUser) return;
    autoCompleteMutation.mutate({
      enabled: true,
      autoCompleteSetById: currentUser.id,
      completionOptions: {
        mergeStrategy,
        deleteSourceBranch,
        transitionWorkItems,
        mergeCommitMessage: mergeCommitMessage || undefined,
      },
    });
  }, [
    currentUser,
    autoCompleteMutation,
    mergeStrategy,
    deleteSourceBranch,
    transitionWorkItems,
    mergeCommitMessage,
  ]);

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      autoCompleteMutation.mutate({ enabled: false });
    },
    [autoCompleteMutation],
  );

  if (!currentUser) return null;

  // When auto-complete is already set, show status chip with cancel button
  if (isAutoCompleteSet) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400">
        <GitMerge className="h-3.5 w-3.5" />
        <span>Auto-complete</span>
        {pr.completionOptions && (
          <span className="text-green-400/70">
            ({MERGE_STRATEGY_LABELS[pr.completionOptions.mergeStrategy]})
          </span>
        )}
        <button
          onClick={handleCancel}
          className="ml-1 rounded p-0.5 hover:bg-green-600/30"
          title="Cancel auto-complete"
          disabled={autoCompleteMutation.isPending}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      </div>
    );
  }

  // Show button that opens configuration dropdown
  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className="bg-glass-medium hover:bg-bg-3 text-ink-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          disabled={autoCompleteMutation.isPending}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitMerge className="h-3.5 w-3.5" />
          )}
          Set auto-complete
        </button>
      }
    >
      <div className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-ink-1 mb-3 text-sm font-medium">
          Auto-complete settings
        </h3>

        {/* Merge strategy */}
        <label className="text-ink-2 mb-1 block text-xs">Merge strategy</label>
        <select
          value={mergeStrategy}
          onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
          disabled={allowedStrategies.length <= 1}
          className="bg-bg-2 border-glass-border text-ink-1 mb-3 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
        >
          {allowedStrategies.map((strategy) => (
            <option key={strategy} value={strategy}>
              {MERGE_STRATEGY_LABELS[strategy]}
            </option>
          ))}
        </select>

        {/* Checkboxes */}
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={deleteSourceBranch}
            onChange={(e) => setDeleteSourceBranch(e.target.checked)}
            className="accent-acc rounded"
          />
          <span className="text-ink-1">Delete source branch</span>
        </label>

        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={transitionWorkItems}
            onChange={(e) => setTransitionWorkItems(e.target.checked)}
            className="accent-acc rounded"
          />
          <span className="text-ink-1">Transition work items</span>
        </label>

        {/* Commit message toggle */}
        <button
          onClick={() => setShowCommitMessage(!showCommitMessage)}
          className="text-acc-ink mb-2 text-xs hover:underline"
        >
          {showCommitMessage ? 'Hide' : 'Custom'} merge commit message
        </button>

        {showCommitMessage && (
          <textarea
            value={mergeCommitMessage}
            onChange={(e) => setMergeCommitMessage(e.target.value)}
            placeholder={pr.title}
            rows={3}
            className="bg-bg-2 border-glass-border text-ink-1 placeholder:text-ink-4 mb-3 w-full resize-none rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
          />
        )}

        {/* Enable button */}
        <button
          onClick={handleEnable}
          disabled={autoCompleteMutation.isPending}
          className={clsx(
            'bg-acc text-ink-0 hover:bg-acc w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            autoCompleteMutation.isPending && 'opacity-50',
          )}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            'Enable auto-complete'
          )}
        </button>
      </div>
    </Dropdown>
  );
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/pull-request/ui-pr-auto-complete/
git commit -m "feat: create PrAutoComplete component with merge strategy selection"
```

---

### Task 11: Integrate into PrHeader

**Files:**
- Modify: `src/features/pull-request/ui-pr-header/index.tsx`

**Step 1: Add imports**

```ts
import { PrVoteDropdown } from '../ui-pr-vote-dropdown';
import { PrAutoComplete } from '../ui-pr-auto-complete';
```

**Step 2: Add vote dropdown and auto-complete to the button row**

In the header button row (around line 161-207), add the new components right before the "New Task" button. The section with `pr.status === 'active'` already exists for the Review button. Place both new controls inside that same conditional:

Replace the button row area (lines 161-207) with:

```tsx
            <div className="flex items-center gap-2">
              <span className="text-ink-3">#{pr.id}</span>
              <div className="flex">
                {getStatusBadge(pr.status, pr.isDraft)}
              </div>
              <div className="grow" />
              {pr.status === 'active' && (
                <>
                  <PrVoteDropdown pr={pr} projectId={projectId} />
                  <PrAutoComplete pr={pr} projectId={projectId} />
                </>
              )}
              <button
                onClick={handleCreateTaskFromPrBranch}
                className="bg-status-done text-ink-0 hover:bg-status-done flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
              {pr.status === 'active' && (
                <button
                  onClick={handleReview}
                  disabled={isCreating}
                  className="bg-acc text-ink-0 hover:bg-acc flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  Review
                </button>
              )}
              {project?.path && (
                <button
                  onClick={handleOpenInEditor}
                  className="hover:bg-bg-3 bg-glass-medium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <FolderOpen className="h-4 w-4" />
                  Open in{' '}
                  {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
                </button>
              )}
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-bg-3 bg-glass-medium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Azure DevOps
              </a>
            </div>
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Run lint**

Run: `pnpm lint --fix`
Expected: PASS (or auto-fixable warnings only)

**Step 5: Final lint check**

Run: `pnpm lint`
Expected: PASS

**Step 6: Commit**

```bash
git add src/features/pull-request/ui-pr-header/index.tsx
git commit -m "feat: integrate vote dropdown and auto-complete into PR header"
```

---

### Task 12: Final verification

**Step 1: Full type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 2: Full lint**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 3: Install dependencies (in case any were added)**

Run: `pnpm install`
Expected: PASS (no new deps needed — all lucide icons and components already available)
