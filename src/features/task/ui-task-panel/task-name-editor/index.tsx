import { memo, useCallback, useState } from 'react';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';



import { useToastStore } from '@/stores/toasts';
import { useUpdateTask } from '@/hooks/use-tasks';


export function getTaskTitle({
  name,
  prompt,
}: {
  name: string | null | undefined;
  prompt: string;
}) {
  return name ?? prompt.split('\n')[0];
}

const taskTitleTextClassName =
  'text-ink-1 min-w-0 shrink truncate text-sm font-semibold';

export const TaskNameEditor = memo(function TaskNameEditor({
  taskId,
  name,
  prompt,
}: {
  taskId: string;
  name: string | null | undefined;
  prompt: string;
}) {
  const updateTask = useUpdateTask();
  const addToast = useToastStore((state) => state.addToast);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getTaskTitle({ name, prompt }).trim());

  const resetAndClose = useCallback(() => {
    setDraft(getTaskTitle({ name, prompt }).trim());
    setIsEditing(false);
  }, [name, prompt]);

  const handleStartEdit = useCallback(() => {
    setDraft(getTaskTitle({ name, prompt }).trim());
    setIsEditing(true);
  }, [name, prompt]);

  const handleCancel = useCallback(() => {
    resetAndClose();
  }, [resetAndClose]);

  const handleSave = useCallback(async () => {
    const currentTaskName = name?.trim() || null;
    const fallbackTaskName = prompt.split('\n')[0]?.trim() || '';
    const normalizedDraft = draft.trim();

    if (
      (currentTaskName === null && normalizedDraft === fallbackTaskName) ||
      normalizedDraft === currentTaskName
    ) {
      setIsEditing(false);
      return;
    }

    try {
      await updateTask.mutateAsync({
        id: taskId,
        data: {
          name: normalizedDraft.length > 0 ? normalizedDraft : null,
        },
      });
      setIsEditing(false);
    } catch (error) {
      addToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to update task name',
      });
    }
  }, [addToast, draft, name, prompt, taskId, updateTask]);

  const taskTitle = getTaskTitle({ name, prompt });

  return (
    <div className="flex min-w-0 flex-auto items-center gap-1">
      {isEditing ? (
        <form
          className="flex min-w-0 flex-auto items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          onBlur={(event) => {
            const relatedTarget = event.relatedTarget as Node | null;
            if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
              return;
            }

            handleCancel();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
              }
            }}
            disabled={updateTask.isPending}
            className={clsx(
              taskTitleTextClassName,
              'flex-1 bg-transparent p-0 outline-none',
            )}
            aria-label="Task name"
          />
        </form>
      ) : (
        <>
          <h1 className={taskTitleTextClassName}>{taskTitle}</h1>
          <button
            type="button"
            onClick={handleStartEdit}
            className="text-ink-2 hover:bg-glass-light hover:text-ink-1 shrink-0 rounded border border-transparent p-1 transition-colors"
            aria-label="Edit task name"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
});
