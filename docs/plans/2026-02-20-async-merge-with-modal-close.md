# Async Merge with Modal Close — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the merge confirm dialog to fire-and-forget with background job tracking and shrink-to-target animation, matching the new task overlay pattern.

**Architecture:** Add `'merge'` to the background jobs store, add a `contentRef` prop to the Modal component so the merge dialog can provide a ref for the shrink animation, create a toast store + component for error notifications, and rewire `WorktreeActions.handleMerge` from synchronous await to fire-and-forget.

**Tech Stack:** React, Zustand, Framer Motion (existing `useShrinkToTarget` hook), Tailwind CSS

---

### Task 1: Add `'merge'` job type to background jobs store

**Files:**
- Modify: `src/stores/background-jobs.ts`

**Step 1: Add the merge variant to types and input**

In `src/stores/background-jobs.ts`, add a `'merge'` member to `BackgroundJobType`, `BackgroundJob`, and `NewBackgroundJobInput`:

```ts
// BackgroundJobType — add 'merge'
export type BackgroundJobType =
  | 'task-creation'
  | 'summary-generation'
  | 'task-deletion'
  | 'merge';

// BackgroundJob — add merge variant after task-deletion
  | (BackgroundJobBase & {
      type: 'merge';
      details: {
        branchName: string;
        targetBranch: string;
      };
    });

// NewBackgroundJobInput — add merge variant after task-deletion
  | {
      type: 'merge';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        branchName: string;
        targetBranch: string;
      };
    };
```

**Step 2: Update `BackgroundJobsOverlay` to render merge details**

In `src/features/background-jobs/ui-background-jobs-overlay/index.tsx`, add a `'merge'` renderer to the `JobDetails` component's `renderers` record:

```ts
'merge': (typedJob) => {
  if (typedJob.type !== 'merge') return null;

  return (
    <div className="mt-1 space-y-0.5 text-xs text-neutral-400">
      <p>
        {typedJob.details.branchName} → {typedJob.details.targetBranch}
      </p>
    </div>
  );
},
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No type errors.

---

### Task 2: Add `contentRef` prop to Modal component

**Files:**
- Modify: `src/common/ui/modal/index.tsx`

**Step 1: Add optional `contentRef` prop**

Add `contentRef?: RefObject<HTMLDivElement | null>` to Modal's props and forward it to the panel div (the `max-w-md rounded-lg bg-neutral-800` div):

```tsx
import { type ReactNode, useId, type RefObject } from 'react';

export function Modal({
  isOpen,
  onClose,
  title,
  closeOnClickOutside = true,
  closeOnEscape = true,
  contentRef,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  // ... existing code ...

  // On the panel div, add ref:
  <div
    ref={contentRef}
    className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl"
    onClick={(e) => e.stopPropagation()}
  >
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No type errors. Existing Modal usage is unaffected (prop is optional).

---

### Task 3: Create toast store and component

**Files:**
- Create: `src/stores/toasts.ts`
- Create: `src/common/ui/toast/index.tsx`
- Modify: `src/app.tsx`

**Step 1: Create the toast store**

Create `src/stores/toasts.ts`:

```ts
import { nanoid } from 'nanoid';
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success';
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: { message: string; type: 'error' | 'success' }) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: ({ message, type }) => {
    const id = nanoid();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, createdAt: Date.now() }],
    }));

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
```

**Step 2: Create the toast component**

Create `src/common/ui/toast/index.tsx`:

```tsx
import { CircleAlert, CheckCircle2, X } from 'lucide-react';
import clsx from 'clsx';

import { useToastStore } from '@/stores/toasts';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
            'animate-in slide-in-from-right-full duration-300',
            toast.type === 'error' &&
              'border-red-800 bg-red-950/90 text-red-100',
            toast.type === 'success' &&
              'border-emerald-800 bg-emerald-950/90 text-emerald-100',
          )}
        >
          {toast.type === 'error' ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <p className="text-sm">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 shrink-0 rounded p-0.5 hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Mount Toaster in app.tsx**

In `src/app.tsx`, import and add `<Toaster />` as a sibling after `<RootKeyboardBindings>`:

```tsx
import { Toaster } from './common/ui/toast';

export default function App() {
  return (
    <>
      <DetectKeyboardLayout />
      <RootKeyboardBindings>
        <RootOverlay>
          <QueryClientProvider client={queryClient}>
            <ModalProvider>
              <RouterProvider router={router} />
            </ModalProvider>
          </QueryClientProvider>
        </RootOverlay>
      </RootKeyboardBindings>
      <Toaster />
    </>
  );
}
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: No type errors.

---

### Task 4: Wire up async merge with background job and animation

**Files:**
- Modify: `src/features/agent/ui-worktree-actions/index.tsx`
- Modify: `src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx`

**Step 1: Add `contentRef` to `MergeConfirmDialog`**

In `merge-confirm-dialog.tsx`, add a `contentRef` prop and pass it through to `<Modal>`:

```tsx
import { type RefObject } from 'react';

export function MergeConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  taskId,
  branchName,
  targetBranch,
  isPending,
  defaultCommitMessage,
  contentRef,
}: {
  // ... existing props ...
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  // ... existing code ...

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Worktree"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
      contentRef={contentRef}
    >
```

**Step 2: Rewrite `WorktreeActions` to use fire-and-forget pattern**

In `index.tsx`, replace the synchronous `handleMerge` with the background job + animation pattern:

```tsx
import { GitCommit, GitMerge, GitPullRequest, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { useModal } from '@/common/context/modal';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import {
  useWorktreeStatus,
  useWorktreeBranches,
  useCommitWorktree,
  useMergeWorktree,
} from '@/hooks/use-worktree-diff';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useToastStore } from '@/stores/toasts';

import { CreatePrDialog } from '../ui-create-pr-dialog';

import { CommitModal } from './commit-modal';
import { MergeConfirmDialog } from './merge-confirm-dialog';
```

Add `projectId` to the component props (threaded from parent):

```ts
export function WorktreeActions({
  taskId,
  projectId,
  branchName,
  // ... rest of existing props ...
}: {
  taskId: string;
  projectId: string;
  branchName: string;
  // ... rest of existing props ...
})
```

Inside the component body, add the new hooks and refs:

```ts
const mergeDialogRef = useRef<HTMLDivElement>(null);
const { triggerAnimation } = useShrinkToTarget({
  panelRef: mergeDialogRef,
  targetSelector: '[data-animation-target="jobs-button"]',
});

const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
const addToast = useToastStore((s) => s.addToast);
```

Replace `handleMerge`:

```ts
const handleMerge = (params: { squash: boolean; commitMessage?: string }) => {
  // 1. Create background job
  const jobId = addRunningJob({
    type: 'merge',
    title: `Merging ${branchName} → ${selectedBranch}`,
    taskId,
    projectId,
    details: {
      branchName,
      targetBranch: selectedBranch,
    },
  });

  // 2. Animate the modal shrinking to jobs button
  void triggerAnimation();

  // 3. Close dialog and diff view immediately
  setIsMergeConfirmOpen(false);
  onMergeComplete();

  // 4. Fire-and-forget merge
  void mergeMutation
    .mutateAsync({
      taskId,
      targetBranch: selectedBranch,
      squash: params.squash,
      commitMessage: params.commitMessage,
    })
    .then((result) => {
      if (result.success) {
        markJobSucceeded(jobId);
      } else {
        markJobFailed(jobId, result.error ?? 'Merge failed');
        addToast({
          type: 'error',
          message: result.error ?? 'An error occurred while merging.',
        });
      }
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Merge failed';
      markJobFailed(jobId, message);
      addToast({ type: 'error', message });
    });
};
```

Note: `handleMerge` is no longer `async` and no longer returns a `Promise`.

Pass `mergeDialogRef` to the dialog:

```tsx
<MergeConfirmDialog
  isOpen={isMergeConfirmOpen}
  onClose={() => setIsMergeConfirmOpen(false)}
  onConfirm={handleMerge}
  taskId={taskId}
  branchName={branchName}
  targetBranch={selectedBranch}
  isPending={mergeMutation.isPending}
  defaultCommitMessage={taskName ?? undefined}
  contentRef={mergeDialogRef}
/>
```

**Step 3: Update `MergeConfirmDialog`'s `onConfirm` type**

Since `handleMerge` no longer returns a Promise, update the prop type in `merge-confirm-dialog.tsx`:

```ts
onConfirm: (params: {
  squash: boolean;
  commitMessage?: string;
}) => void;
```

(Change from `=> Promise<void>` to `=> void`)

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: No type errors.

---

### Task 5: Thread `projectId` through parent components

**Files:**
- Modify: `src/features/agent/ui-worktree-diff-view/index.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Add `projectId` prop to `WorktreeDiffView`**

In `src/features/agent/ui-worktree-diff-view/index.tsx`, add `projectId: string` to the props type and pass it through to `<WorktreeActions>`:

```ts
export function WorktreeDiffView({
  taskId,
  projectId,
  // ... existing props ...
}: {
  taskId: string;
  projectId: string;
  // ... existing props ...
})
```

And in the JSX:

```tsx
<WorktreeActions
  taskId={taskId}
  projectId={projectId}
  branchName={branchName}
  // ... rest of existing props ...
/>
```

**Step 2: Pass `projectId` from `ui-task-panel`**

In `src/features/task/ui-task-panel/index.tsx`, where `<WorktreeDiffView>` is rendered, add the `projectId` prop. The `project` variable is already available (via `useProject`):

```tsx
<WorktreeDiffView
  taskId={taskId}
  projectId={project.id}
  selectedFilePath={diffSelectedFile}
  // ... rest of existing props ...
/>
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No type errors.

---

### Task 6: Final verification

**Step 1: Run lint**

Run: `pnpm lint --fix`
Expected: No errors (warnings OK).

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No type errors.
