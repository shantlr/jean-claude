import { ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  useCreatePullRequest,
  usePushBranch,
} from '@/hooks/use-create-pull-request';
import { useUpdateTask } from '@/hooks/use-tasks';

export function CreatePrDialog({
  isOpen,
  onClose,
  taskId,
  taskName,
  taskPrompt,
  branchName,
  targetBranch,
  workItemId,
  // Project repo link fields
  repoProviderId,
  repoProjectId,
  repoId,
}: {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskName: string | null;
  taskPrompt: string;
  branchName: string;
  targetBranch: string;
  workItemId: string | null;
  repoProviderId: string;
  repoProjectId: string;
  repoId: string;
}) {
  const [title, setTitle] = useState(
    taskName ?? taskPrompt.split('\n')[0].slice(0, 100),
  );
  const [description, setDescription] = useState(
    workItemId ? `AB#${workItemId}\n\n${taskPrompt}` : taskPrompt,
  );
  const [isDraft, setIsDraft] = useState(true);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pushBranch = usePushBranch();
  const createPr = useCreatePullRequest();
  const updateTask = useUpdateTask();

  const isPending =
    pushBranch.isPending || createPr.isPending || updateTask.isPending;

  async function handleCreate() {
    setError(null);
    try {
      // Step 1: Push branch
      await pushBranch.mutateAsync(taskId);

      // Step 2: Create PR
      const result = await createPr.mutateAsync({
        providerId: repoProviderId,
        projectId: repoProjectId,
        repoId,
        sourceBranch: branchName,
        targetBranch,
        title,
        description,
        isDraft,
      });

      // Step 3: Save PR info to task
      await updateTask.mutateAsync({
        id: taskId,
        data: {
          pullRequestId: String(result.id),
          pullRequestUrl: result.url,
        },
      });

      setPrUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    }
  }

  if (!isOpen) return null;

  // Success state
  if (prUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-green-400">
            Pull Request Created
          </h2>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex items-center gap-2 text-sm text-blue-400 hover:underline"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in Azure DevOps
          </a>
          <button
            type="button"
            onClick={() => {
              setPrUrl(null);
              onClose();
            }}
            className="w-full cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-neutral-200">
          Create Pull Request
        </h2>
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label
              htmlFor="pr-title"
              className="mb-1 block text-xs font-medium text-neutral-400"
            >
              Title
            </label>
            <input
              id="pr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/50"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="pr-description"
              className="mb-1 block text-xs font-medium text-neutral-400"
            >
              Description
            </label>
            <textarea
              id="pr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              autoComplete="off"
              className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/50"
            />
          </div>

          {/* Target branch */}
          <div className="text-xs text-neutral-500">
            {branchName} &rarr; {targetBranch}
          </div>

          {/* Draft toggle */}
          <div className="flex items-center gap-2">
            <input
              id="isDraft"
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label
              htmlFor="isDraft"
              className="cursor-pointer text-sm text-neutral-300"
            >
              Create as draft
            </label>
          </div>

          {/* Work item reference */}
          {workItemId && (
            <div className="text-xs text-neutral-500">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !title.trim()}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isPending ? 'Creating…' : 'Create PR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
