import { useEffect, useRef, useState } from 'react';

import { Input } from '@/common/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUpdateTaskPendingMessage } from '@/hooks/use-tasks';

/**
 * Self-contained pending-note input. Use with `key={taskId}` at the call site
 * so React remounts on task change — no internal task-switch sync needed.
 */
export function TaskPendingNoteInput({
  taskId,
  pendingMessage,
}: {
  taskId: string;
  pendingMessage: string | null;
}) {
  const { mutate: updatePendingMessage, isPending: isUpdatingPendingMessage } =
    useUpdateTaskPendingMessage();
  const [value, setValue] = useState(pendingMessage ?? '');
  const debouncedValue = useDebouncedValue(value, 500);
  const lastSubmittedValueRef = useRef(pendingMessage ?? '');
  const lastSyncedValueRef = useRef(pendingMessage ?? '');
  const isDebouncing = value !== debouncedValue;

  useEffect(() => {
    lastSyncedValueRef.current = pendingMessage ?? '';
  }, [pendingMessage]);

  useEffect(() => {
    const currentPendingMessage = pendingMessage ?? '';
    if (debouncedValue !== value) {
      return;
    }

    if (debouncedValue === currentPendingMessage) {
      lastSubmittedValueRef.current = debouncedValue;
      return;
    }

    if (debouncedValue === lastSubmittedValueRef.current) {
      return;
    }

    lastSubmittedValueRef.current = debouncedValue;
    updatePendingMessage({
      id: taskId,
      pendingMessage: debouncedValue.length > 0 ? debouncedValue : null,
    });
  }, [debouncedValue, pendingMessage, taskId, updatePendingMessage, value]);

  return (
    <Input
      size="xs"
      value={value}
      onBlur={() => {
        if (isDebouncing || isUpdatingPendingMessage) {
          return;
        }

        if (
          value === lastSubmittedValueRef.current &&
          value !== lastSyncedValueRef.current
        ) {
          return;
        }

        setValue(lastSyncedValueRef.current);
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      placeholder="Add note..."
      className="w-full max-w-40 flex-none"
      title="Task note"
      aria-label="Task note"
    />
  );
}
