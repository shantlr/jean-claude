import { useEffect, useRef, useState } from 'react';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUpdateTask } from '@/hooks/use-tasks';

export function TaskPendingNoteInput({
  taskId,
  pendingMessage,
}: {
  taskId: string;
  pendingMessage: string | null;
}) {
  const { mutate: updatePendingMessage, isPending: isUpdatingPendingMessage } =
    useUpdateTask();
  const [value, setValue] = useState(pendingMessage ?? '');
  const debouncedValue = useDebouncedValue(value, 500);
  const previousTaskIdRef = useRef(taskId);
  // Refs prevent race-related flicker/dup saves: one tracks the latest submitted
  // debounced value, the other tracks the latest value confirmed from props.
  const lastSubmittedValueRef = useRef(pendingMessage ?? '');
  const lastSyncedValueRef = useRef(pendingMessage ?? '');
  const isDebouncing = value !== debouncedValue;

  useEffect(() => {
    const nextSyncedValue = pendingMessage ?? '';
    lastSyncedValueRef.current = nextSyncedValue;

    if (previousTaskIdRef.current !== taskId) {
      previousTaskIdRef.current = taskId;
      setValue(nextSyncedValue);
      lastSubmittedValueRef.current = nextSyncedValue;
    }
  }, [taskId, pendingMessage]);

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
      data: {
        pendingMessage: debouncedValue.length > 0 ? debouncedValue : null,
      },
    });
  }, [debouncedValue, pendingMessage, taskId, updatePendingMessage, value]);

  return (
    <input
      type="text"
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
      className="h-7 w-72 max-w-full rounded border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
      title="Task note"
      aria-label="Task note"
    />
  );
}
