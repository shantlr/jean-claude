import clsx from 'clsx';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTask, useUpdateTask } from '@/hooks/use-tasks';

export function PendingMessageInput({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId);
  const updateTask = useUpdateTask();

  const [draft, setDraft] = useState(task?.pendingMessage ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync draft when task data changes (and input isn't focused)
  useEffect(() => {
    if (!isFocused) {
      setDraft(task?.pendingMessage ?? '');
    }
  }, [task?.pendingMessage, isFocused]);

  const save = useCallback(() => {
    if (!task) return;
    const trimmed = draft.trim();
    const newValue = trimmed || null;
    if (newValue !== (task.pendingMessage ?? null)) {
      updateTask.mutate({
        id: task.id,
        data: { pendingMessage: newValue },
      });
    }
  }, [task, draft, updateTask]);

  if (!task) return null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <MessageSquare
        className={clsx(
          'h-3.5 w-3.5 shrink-0',
          draft ? 'text-amber-400' : 'text-neutral-600',
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(task.pendingMessage ?? '');
            e.currentTarget.blur();
          }
        }}
        placeholder="Add a note…"
        className="min-w-0 flex-1 border-none bg-transparent px-1 py-0.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:text-neutral-200"
      />
    </div>
  );
}
