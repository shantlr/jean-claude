import { CheckCircle } from 'lucide-react';

import { Modal } from '@/common/ui/modal';
import { useToggleTaskUserCompleted } from '@/hooks/use-tasks';

export function MergeSuccessDialog({
  isOpen,
  onClose,
  targetBranch,
  taskId,
}: {
  isOpen: boolean;
  onClose: (markComplete: boolean) => void;
  targetBranch: string;
  taskId: string;
}) {
  const toggleCompleted = useToggleTaskUserCompleted();

  const handleComplete = async () => {
    await toggleCompleted.mutateAsync(taskId);
    onClose(true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title="Worktree Merged"
      closeOnClickOutside={!toggleCompleted.isPending}
      closeOnEscape={!toggleCompleted.isPending}
    >
      <div className="mb-4 flex items-center gap-3 text-green-400">
        <CheckCircle className="h-6 w-6" />
        <span>Successfully merged into {targetBranch}</span>
      </div>

      <p className="mb-4 text-neutral-300">Mark this task as completed?</p>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onClose(false)}
          disabled={toggleCompleted.isPending}
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Keep Running
        </button>
        <button
          onClick={handleComplete}
          disabled={toggleCompleted.isPending}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          Complete Task
        </button>
      </div>
    </Modal>
  );
}
