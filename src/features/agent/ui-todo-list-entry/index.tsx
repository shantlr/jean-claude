import { Check, Circle, Loader2 } from 'lucide-react';

import type { TodoItem } from '@shared/agent-types';

/**
 * Determine which items changed status between old and new todo lists.
 * Returns a Set of indices (in newTodos) that changed.
 */
function getChangedIndices(
  oldTodos: TodoItem[],
  newTodos: TodoItem[],
): Set<number> {
  const changed = new Set<number>();

  for (let i = 0; i < newTodos.length; i++) {
    const oldItem = oldTodos[i];
    const newItem = newTodos[i];

    if (!oldItem) {
      // New item that didn't exist before
      changed.add(i);
    } else if (oldItem.status !== newItem.status) {
      // Status changed
      changed.add(i);
    }
  }

  return changed;
}

function TodoCheckbox({
  item,
  isChanged,
}: {
  item: TodoItem;
  isChanged: boolean;
}) {
  const isCompleted = item.status === 'completed';
  const isInProgress = item.status === 'in_progress';

  return (
    <div
      className={`flex items-start gap-2 rounded px-2 py-1 ${
        isChanged
          ? isCompleted
            ? 'bg-green-500/10'
            : isInProgress
              ? 'bg-blue-500/10'
              : 'bg-neutral-500/10'
          : ''
      }`}
    >
      {/* Checkbox icon */}
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {isCompleted ? (
          <div
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm ${
              isChanged ? 'bg-green-500' : 'bg-neutral-600'
            }`}
          >
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </div>
        ) : isInProgress ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-neutral-600" />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-xs leading-relaxed ${
          isCompleted
            ? 'text-neutral-500 line-through'
            : isInProgress
              ? 'text-blue-300'
              : 'text-neutral-400'
        }`}
      >
        {item.content}
      </span>
    </div>
  );
}

export function TodoListEntry({
  oldTodos,
  newTodos,
  isPending = false,
}: {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
  isPending?: boolean;
}) {
  const changedIndices = getChangedIndices(oldTodos, newTodos);
  const completedCount = newTodos.filter(
    (t) => t.status === 'completed',
  ).length;

  return (
    <div className="relative pl-6">
      {/* Dot - indigo for TodoWrite, with pulse if pending */}
      <div
        className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-indigo-500 ${isPending ? 'animate-pulse' : ''}`}
      />

      <div className="py-1.5 pr-3">
        {/* Summary header */}
        <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-400">
          {isPending && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
          <span>
            {isPending
              ? `Updating todo list (${newTodos.length} items)...`
              : `Updated todo list (${completedCount}/${newTodos.length} completed)`}
          </span>
        </div>

        {/* Checkbox list */}
        <div className="space-y-0.5">
          {newTodos.map((item, i) => (
            <TodoCheckbox
              key={i}
              item={item}
              isChanged={changedIndices.has(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
