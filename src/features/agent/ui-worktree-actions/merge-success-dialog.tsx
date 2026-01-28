import { CheckCircle, X } from 'lucide-react';

import { useToggleTaskUserCompleted } from '@/hooks/use-tasks';

interface MergeSuccessDialogProps {
  isOpen: boolean;
  onClose: (markComplete: boolean) => void;
  targetBranch: string;
  taskId: string;
}

export function MergeSuccessDialog({
  isOpen,
  onClose,
  targetBranch,
  taskId,
}: MergeSuccessDialogProps) {
  const toggleCompleted = useToggleTaskUserCompleted();

  if (!isOpen) return null;

  const handleComplete = async () => {
    await toggleCompleted.mutateAsync(taskId);
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">
            Worktree Merged
          </h2>
          <button
            onClick={() => onClose(false)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center gap-3 text-green-400">
            <CheckCircle className="h-6 w-6" />
            <span>Successfully merged into {targetBranch}</span>
          </div>

          <p className="mb-4 text-neutral-300">Mark this task as completed?</p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Keep Running
            </button>
            <button
              onClick={handleComplete}
              disabled={toggleCompleted.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            >
              Complete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
