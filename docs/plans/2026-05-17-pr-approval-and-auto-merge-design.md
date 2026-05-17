# PR Approval & Auto-Merge Design

## Overview

Add PR vote (approve/reject) and auto-complete (auto-merge with merge strategy selection) controls to the PR detail header. Azure DevOps backend only.

## Decisions

- **Controls location**: All in PR header bar (alongside existing buttons)
- **Vote levels**: All 5 — approve, approve-with-suggestions, wait-for-author, reject, reset
- **Auto-complete options**: All 4 — merge strategy, delete source branch, transition work items, merge commit message
- **Branch policy**: Respect "Limit merge types" policy to filter allowed strategies

## Backend

### New Service Functions (`azure-devops-service.ts`)

**`votePullRequest`**
- API: `PUT /_apis/git/repositories/{repoId}/pullrequests/{prId}/reviewers/{reviewerId}?api-version=7.0`
- Body: `{ vote: number }` — values: 10 (approve), 5 (approve-with-suggestions), 0 (reset), -5 (wait), -10 (reject)
- Requires current user ID

**`setPullRequestAutoComplete`**
- API: `PATCH /_apis/git/repositories/{repoId}/pullrequests/{prId}?api-version=7.0`
- Body: `{ autoCompleteSetBy: { id: userId }, completionOptions: { mergeStrategy, deleteSourceBranch, transitionWorkItems, mergeCommitMessage } }`
- To cancel: `autoCompleteSetBy: { id: "00000000-0000-0000-0000-000000000000" }`

**`getCurrentUserId`**
- API: `GET https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0` (already exists as `getProfile`)
- Cache result — user ID doesn't change

**`getPullRequest` update**
- Capture `autoCompleteSetBy` and `completionOptions` from API response (currently dropped)

### Merge Strategy from Branch Policy

Policy type ID `fa4e907d-c16b-4a4c-9dfa-4916e5d171ab` = "Limit merge types".
Settings contain: `allowSquash`, `allowNoFastForward`, `allowRebase`, `allowRebaseMerge`.
Already fetched via `getPullRequestPolicyEvaluations`. Parse on frontend.

## Types (`shared/azure-devops-types.ts`)

Add to `AzureDevOpsPullRequestDetails`:

```ts
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
```

## IPC Channels

- `azureDevOps:votePullRequest` — `{ providerId, projectId, repoId, pullRequestId, vote }` → `void`
- `azureDevOps:setPullRequestAutoComplete` — `{ providerId, projectId, repoId, pullRequestId, enabled, completionOptions? }` → updated PR details
- `azureDevOps:getCurrentUserId` — `{ providerId }` → `{ id, displayName }`

## React Query Hooks (`use-pull-requests.ts`)

- `useVotePullRequest(projectId, prId)` — mutation, invalidates `['pull-request', projectId, prId]`
- `useSetAutoComplete(projectId, prId)` — mutation, invalidates `['pull-request', projectId, prId]`
- `useCurrentAzureUser(projectId)` — query, long staleTime

Helper: `useAllowedMergeStrategies(evaluations)` — extracts allowed strategies from policy evaluations

## UI — PR Header

Only visible when `pr.status === 'active'`.

### Vote Dropdown

- Button group: primary action + chevron dropdown
- Primary button shows current user's vote state (color-coded) or "Vote" if none
- Dropdown lists all 5 options:
  - ✅ Approve (green)
  - 👍 Approve with suggestions (light green)
  - ⏳ Wait for author (orange)
  - ❌ Reject (red)
  - ↩️ Reset vote (neutral)
- Current vote highlighted

### Auto-Complete Controls

- **Not set**: "Set auto-complete" button
- **Set**: Green "Auto-complete" chip with ✕ to cancel
- Clicking opens popover:
  - Merge strategy dropdown (filtered by branch policy; disabled if only 1 allowed)
  - Delete source branch checkbox
  - Transition work items checkbox
  - Merge commit message textarea (collapsible, pre-filled with PR title)
  - "Enable" button

### Layout

Vote + auto-complete sit in same button row as existing "New Task", "Review", "Open in Editor", "Open in Azure DevOps".

## File Changes

| File | Change |
|------|--------|
| `shared/azure-devops-types.ts` | Add autoComplete fields to PR details type |
| `electron/services/azure-devops-service.ts` | Add `votePullRequest`, `setPullRequestAutoComplete`, `getCurrentUserId`; update `getPullRequest` mapping |
| `electron/preload.ts` | Add 3 new IPC bridge methods |
| `electron/ipc/handlers.ts` | Add 3 new IPC handlers |
| `src/lib/api.ts` | Add 3 new API methods |
| `src/hooks/use-pull-requests.ts` | Add `useVotePullRequest`, `useSetAutoComplete`, `useCurrentAzureUser`, `useAllowedMergeStrategies` |
| `src/features/pull-request/ui-pr-header/index.tsx` | Add vote dropdown + auto-complete controls |
| `src/features/pull-request/ui-pr-vote-dropdown/index.tsx` | **New** — vote button+dropdown component |
| `src/features/pull-request/ui-pr-auto-complete/index.tsx` | **New** — auto-complete button+popover component |
