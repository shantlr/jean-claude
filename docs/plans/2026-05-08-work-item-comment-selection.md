# Work Item Comment Selection in New Task

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When creating a task from work items, allow users to select which work item comments to inject into the prompt template (or inject none).

**Architecture:** Add a new Azure DevOps API endpoint for fetching work item comments. In the compose step (step 2) of new task creation, add a collapsible comment selection panel between the breadcrumb header and the two-panel template/preview layout. Selected comments get injected into `expandWorkItem()` as a `<comments>` section inside each `<work_item>` XML block. Comments default to none selected.

**Tech Stack:** Electron IPC, Azure DevOps REST API, React, Zustand, TanStack Query

---

### Task 1: Add Azure DevOps Work Item Comments API

Add backend service function, IPC handler, preload bridge, and API type for fetching work item comments.

**Files:**
- Modify: `src/lib/api.ts` — add `WorkItemComment` type + API method
- Modify: `electron/services/azure-devops-service.ts` — add `getWorkItemComments()` function
- Modify: `electron/ipc/handlers.ts` — add IPC handler
- Modify: `electron/preload.ts` — add preload bridge

**Step 1: Add the `WorkItemComment` type to `src/lib/api.ts`**

After the `AzureDevOpsWorkItem` interface (~line 210), add:

```typescript
export interface WorkItemComment {
  id: number;
  workItemId: number;
  text: string;  // HTML content
  createdBy: string;
  createdDate: string;
}
```

**Step 2: Add `getWorkItemComments` to the API interface**

In `src/lib/api.ts`, inside the `azureDevOps` object in the API interface (~line 516, after `getWorkItemById`), add:

```typescript
getWorkItemComments: (params: {
  providerId: string;
  workItemId: number;
}) => Promise<WorkItemComment[]>;
```

Also add to the mock API section (~line 1209 area):

```typescript
getWorkItemComments: async () => [],
```

**Step 3: Add service function in `electron/services/azure-devops-service.ts`**

After the `getWorkItemById` function (~line 694), add:

```typescript
export async function getWorkItemComments(params: {
  providerId: string;
  workItemId: number;
}): Promise<{
  id: number;
  workItemId: number;
  text: string;
  createdBy: string;
  createdDate: string;
}[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workItems/${params.workItemId}/comments?api-version=7.0-preview.4&$top=50&order=asc`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return [];
    const error = await response.text();
    throw new Error(`Failed to fetch comments for work item ${params.workItemId}: ${error}`);
  }

  const data = await response.json();

  return (data.comments ?? []).map((c: {
    id: number;
    workItemId: number;
    text: string;
    createdBy?: { displayName?: string };
    createdDate?: string;
  }) => ({
    id: c.id,
    workItemId: c.workItemId,
    text: c.text ?? '',
    createdBy: c.createdBy?.displayName ?? 'Unknown',
    createdDate: c.createdDate ?? '',
  }));
}
```

**Step 4: Add IPC handler in `electron/ipc/handlers.ts`**

After the `azureDevOps:getWorkItemById` handler (~line 1774), add:

```typescript
ipcMain.handle(
  'azureDevOps:getWorkItemComments',
  async (_event, params: { providerId: string; workItemId: number }) => {
    const { getWorkItemComments } =
      await import('../services/azure-devops-service');
    return getWorkItemComments(params);
  },
);
```

**Step 5: Add preload bridge in `electron/preload.ts`**

After the `getWorkItemById` line (~line 233), add:

```typescript
getWorkItemComments: (params: { providerId: string; workItemId: number }) =>
  ipcRenderer.invoke('azureDevOps:getWorkItemComments', params),
```

**Step 6: Commit**

```
feat: add Azure DevOps work item comments API endpoint
```

---

### Task 2: Add React Query Hook for Work Item Comments

**Files:**
- Modify: `src/hooks/use-work-items.ts` — add `useWorkItemComments` hook

**Step 1: Add the hook**

After the `useWorkItemById` function, add:

```typescript
export function useWorkItemComments(params: {
  providerId: string | null;
  workItemIds: number[];
}) {
  return useQuery({
    queryKey: ['work-item-comments', params.providerId, params.workItemIds],
    queryFn: async () => {
      if (!params.providerId || params.workItemIds.length === 0) return [];
      const results = await Promise.all(
        params.workItemIds.map((workItemId) =>
          api.azureDevOps.getWorkItemComments({
            providerId: params.providerId!,
            workItemId,
          }),
        ),
      );
      return results.flat();
    },
    enabled: !!params.providerId && params.workItemIds.length > 0,
    staleTime: 60_000,
  });
}
```

Import `WorkItemComment` type:

```typescript
import {
  api,
  type AzureDevOpsWorkItem,
  type AzureDevOpsUser,
  type AzureDevOpsIteration,
  type WorkItemComment,
} from '@/lib/api';
```

**Step 2: Commit**

```
feat: add useWorkItemComments React Query hook
```

---

### Task 3: Add Comment Selection State to Draft Store

**Files:**
- Modify: `src/stores/new-task-draft.ts` — add `selectedCommentIds` field

**Step 1: Add field to `NewTaskDraft` interface**

Add after `workItemsViewMode`:

```typescript
/** Selected work item comment IDs to include in prompt (empty = no comments) */
selectedCommentIds: number[];
```

No other changes needed — the store already handles partial updates via `setDraft`.

**Step 2: Commit**

```
feat: add selectedCommentIds to new task draft store
```

---

### Task 4: Add Comment Selection UI to PromptComposer

The PromptComposer currently shows: breadcrumb header → two-panel (template + preview). Add a collapsible comment selection panel in the breadcrumb/header area.

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx` — add comment selection UI, update `expandWorkItem` to accept comments

**Step 1: Update PromptComposer props**

Add to the props interface:

```typescript
comments?: WorkItemComment[];
selectedCommentIds?: number[];
onCommentToggle?: (commentId: number) => void;
onSelectAllComments?: () => void;
onDeselectAllComments?: () => void;
isLoadingComments?: boolean;
```

Import `WorkItemComment`:

```typescript
import type { AzureDevOpsWorkItem, WorkItemComment } from '@/lib/api';
```

Import `MessageSquare` from lucide-react (add to existing import).

**Step 2: Update `expandWorkItem` to accept comments**

Change signature:

```typescript
function expandWorkItem(
  workItem: AzureDevOpsWorkItem,
  comments?: WorkItemComment[],
): string {
```

After the `reproSteps` section, add:

```typescript
const workItemComments = comments?.filter((c) => c.workItemId === workItem.id);
if (workItemComments && workItemComments.length > 0) {
  bodySections.push('  <comments>');
  for (const comment of workItemComments) {
    const cleanComment = simplifyHtml(comment.text);
    bodySections.push(`    <comment by="${escapeXml(comment.createdBy)}" date="${comment.createdDate}">`);
    bodySections.push(`      ${cleanComment}`);
    bodySections.push('    </comment>');
  }
  bodySections.push('  </comments>');
}
```

**Step 3: Update `expandTemplate` to pass comments through**

```typescript
export function expandTemplate(
  template: string,
  workItems: AzureDevOpsWorkItem[],
  comments?: WorkItemComment[],
): string {
  const workItemMap = new Map(workItems.map((wi) => [wi.id.toString(), wi]));

  return template.replace(/\{#(\d+)\}/g, (match, id) => {
    const workItem = workItemMap.get(id);
    if (!workItem) return match;
    return expandWorkItem(workItem, comments);
  });
}
```

**Step 4: Add collapsible comment selection panel inside PromptComposer**

Between the breadcrumb header and the two-panel layout, add a collapsible section. Use local state `const [showComments, setShowComments] = useState(false)`:

```tsx
{/* Comment selection toggle */}
{comments && comments.length > 0 && (
  <div style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}>
    <button
      type="button"
      onClick={() => setShowComments(!showComments)}
      className="flex w-full items-center gap-2 px-[18px] py-2 text-left"
      style={{ background: showComments ? 'oklch(1 0 0 / 0.02)' : 'transparent' }}
    >
      <MessageSquare className="text-ink-3 h-3.5 w-3.5" />
      <span className="text-ink-2 text-xs font-medium">
        Comments
      </span>
      <span className="text-ink-3 font-mono text-[10.5px]">
        {selectedCommentIds?.length ?? 0}/{comments.length} selected
      </span>
      <div className="flex-1" />
      <ChevronRight
        className="text-ink-3 h-3 w-3 transition-transform"
        style={{ transform: showComments ? 'rotate(90deg)' : undefined }}
      />
    </button>

    {showComments && (
      <div className="max-h-[200px] overflow-y-auto px-[18px] pb-3">
        {/* Select all / none buttons */}
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={onSelectAllComments}
            className="text-ink-3 hover:text-ink-1 text-[10.5px] font-medium"
          >
            Select all
          </button>
          <span className="text-ink-3 text-[10.5px]">·</span>
          <button
            type="button"
            onClick={onDeselectAllComments}
            className="text-ink-3 hover:text-ink-1 text-[10.5px] font-medium"
          >
            Select none
          </button>
        </div>

        {comments.map((comment) => {
          const isSelected = selectedCommentIds?.includes(comment.id) ?? false;
          const cleanText = simplifyHtml(comment.text);
          const truncated = cleanText.length > 120 ? cleanText.slice(0, 120) + '…' : cleanText;
          return (
            <label
              key={comment.id}
              className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 hover:bg-white/[0.03]"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onCommentToggle?.(comment.id)}
                className="accent-acc mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-ink-2 text-[11px] font-medium">
                    {comment.createdBy}
                  </span>
                  <span className="text-ink-3 text-[10px]">
                    {new Date(comment.createdDate).toLocaleDateString()}
                  </span>
                  <span className="text-ink-3 font-mono text-[10px]">
                    #{comment.workItemId}
                  </span>
                </div>
                <p className="text-ink-3 mt-0.5 text-[11px] leading-snug">
                  {truncated}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    )}
  </div>
)}

{isLoadingComments && (
  <div
    className="flex items-center gap-2 px-[18px] py-2"
    style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
  >
    <span className="border-glass-border-strong border-t-ink-1 inline-block h-3 w-3 animate-spin rounded-full border-2" />
    <span className="text-ink-3 text-xs">Loading comments…</span>
  </div>
)}
```

**Step 5: Update preview to use selected comments**

In the PromptComposer component body, filter comments to selected and pass to expandTemplate:

```typescript
const selectedComments = useMemo(
  () => comments?.filter((c) => selectedCommentIds?.includes(c.id)) ?? [],
  [comments, selectedCommentIds],
);

const preview = useMemo(
  () => expandTemplate(template, workItems, selectedComments),
  [template, workItems, selectedComments],
);
```

**Step 6: Commit**

```
feat: add comment selection UI to prompt composer
```

---

### Task 5: Wire Everything Together in New Task Overlay

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` — fetch comments, pass to PromptComposer, handle selection

**Step 1: Import and fetch comments**

Import the hook:

```typescript
import { useWorkItems, useWorkItemComments } from '@/hooks/use-work-items';
```

Import the type:

```typescript
import type { AzureDevOpsWorkItem, WorkItemComment } from '@/lib/api';
```

Inside the component, after `selectedWorkItems` memo (~line 238), fetch comments:

```typescript
const workItemIdNumbers = useMemo(
  () => (draft?.workItemIds ?? []).map(Number).filter((n) => !isNaN(n)),
  [draft?.workItemIds],
);

const { data: workItemComments = [], isLoading: isLoadingComments } =
  useWorkItemComments({
    providerId: selectedProject?.workItemProviderId ?? null,
    workItemIds: workItemIdNumbers,
  });
```

**Step 2: Add comment selection handlers**

After `backToSelect` callback (~line 596):

```typescript
const handleCommentToggle = useCallback(
  (commentId: number) => {
    const current = draft?.selectedCommentIds ?? [];
    const next = current.includes(commentId)
      ? current.filter((id) => id !== commentId)
      : [...current, commentId];
    updateDraft({ selectedCommentIds: next });
  },
  [draft?.selectedCommentIds, updateDraft],
);

const handleSelectAllComments = useCallback(() => {
  updateDraft({ selectedCommentIds: workItemComments.map((c) => c.id) });
}, [workItemComments, updateDraft]);

const handleDeselectAllComments = useCallback(() => {
  updateDraft({ selectedCommentIds: [] });
}, [updateDraft]);
```

**Step 3: Pass to PromptComposer**

Update the PromptComposer render (~line 1118):

```tsx
<PromptComposer
  template={promptTemplate}
  workItems={selectedWorkItems}
  onTemplateChange={setPromptTemplate}
  onBack={backToSelect}
  images={draft?.images}
  isFetchingImages={isFetchingWorkItemImages}
  onImageAttach={handleImageAttach}
  onImageRemove={handleImageRemove}
  comments={workItemComments}
  selectedCommentIds={draft?.selectedCommentIds ?? []}
  onCommentToggle={handleCommentToggle}
  onSelectAllComments={handleSelectAllComments}
  onDeselectAllComments={handleDeselectAllComments}
  isLoadingComments={isLoadingComments}
/>
```

**Step 4: Update `handleStartTask` to pass selected comments**

In `handleStartTask` (~line 610), change the `expandTemplate` call:

```typescript
const selectedComments = workItemComments.filter((c) =>
  (draft.selectedCommentIds ?? []).includes(c.id),
);
finalPrompt = expandTemplate(promptTemplate, selectedWorkItems, selectedComments);
```

**Step 5: Commit**

```
feat: wire work item comments into new task creation flow
```

---

### Task 6: Lint & Type Check

**Step 1:** Run `pnpm install`
**Step 2:** Run `pnpm lint --fix`
**Step 3:** Run `pnpm ts-check`
**Step 4:** Run `pnpm lint`
**Step 5:** Fix any remaining issues
**Step 6:** Final commit

```
chore: fix lint and type errors
```
