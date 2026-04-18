import { CheckCircle } from 'lucide-react';

import { Modal } from '@/common/ui/modal';
import { useCompleteTask } from '@/hooks/use-tasks';

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
  const completeTask = useCompleteTask();

  const handleComplete = async () => {
    // After a merge the worktree is already cleaned up, no need for cleanup
    await completeTask.mutateAsync({ id: taskId });
    onClose(true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title="Worktree Merged"
      closeOnClickOutside={!completeTask.isPending}
      closeOnEscape={!completeTask.isPending}
    >
      <div className="text-status-done mb-4 flex items-center gap-3">
        <CheckCircle className="h-6 w-6" />
        <span>Successfully merged into {targetBranch}</span>
      </div>

      <p className="text-ink-1 mb-4">Mark this task as completed?</p>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onClose(false)}
          disabled={completeTask.isPending}
          className="text-ink-1 hover:bg-glass-medium rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Keep Running
        </button>
        <button
          onClick={handleComplete}
          disabled={completeTask.isPending}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          Complete Task
        </button>
      </div>
    </Modal>
  );
}
