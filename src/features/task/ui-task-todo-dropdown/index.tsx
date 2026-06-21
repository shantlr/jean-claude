import { GripVertical, ListTodo, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';


import { useTask, useUpdateTask } from '@/hooks/use-tasks';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Dropdown } from '@/common/ui/dropdown';
import { Input } from '@/common/ui/input';
import type { TaskTodoItem } from '@shared/types';



const EMPTY_TODO_ITEMS: TaskTodoItem[] = [];

function reorderTodoItems({
  items,
  sourceId,
  targetId,
}: {
  items: TaskTodoItem[];
  sourceId: string;
  targetId: string;
}) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return items;
  next.splice(targetIndex, 0, moved);
  return next;
}

export function TaskTodoDropdown({ taskId }: { taskId: string }) {
  const { data: task } = useTask(taskId);
  const updateTask = useUpdateTask();
  const [draftTitle, setDraftTitle] = useState('');
  const dragItemId = useRef<string | null>(null);
  const todoItems = task?.todoItems ?? EMPTY_TODO_ITEMS;
  const completedCount = todoItems.filter((item) => item.checked).length;

  const saveTodoItems = useCallback(
    (nextTodoItems: TaskTodoItem[]) => {
      updateTask.mutate({
        id: taskId,
        data: { todoItems: nextTodoItems },
      });
    },
    [taskId, updateTask],
  );

  const handleAddTodo = useCallback(() => {
    const title = draftTitle.trim();
    if (!title) return;

    saveTodoItems([
      ...todoItems,
      {
        id: crypto.randomUUID(),
        title,
        checked: false,
      },
    ]);
    setDraftTitle('');
  }, [draftTitle, saveTodoItems, todoItems]);

  const handleToggleTodo = useCallback(
    (todoId: string, checked: boolean) => {
      saveTodoItems(
        todoItems.map((item) =>
          item.id === todoId ? { ...item, checked } : item,
        ),
      );
    },
    [saveTodoItems, todoItems],
  );

  const handleTitleChange = useCallback(
    (todoId: string, title: string) => {
      saveTodoItems(
        todoItems.map((item) =>
          item.id === todoId ? { ...item, title } : item,
        ),
      );
    },
    [saveTodoItems, todoItems],
  );

  const handleDeleteTodo = useCallback(
    (todoId: string) => {
      saveTodoItems(todoItems.filter((item) => item.id !== todoId));
    },
    [saveTodoItems, todoItems],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = dragItemId.current;
      dragItemId.current = null;
      if (!sourceId || sourceId === targetId) return;
      saveTodoItems(reorderTodoItems({ items: todoItems, sourceId, targetId }));
    },
    [saveTodoItems, todoItems],
  );

  return (
    <Dropdown
      align="left"
      className="w-[320px] p-0"
      trigger={
        <Button
          variant="ghost"
          size="xs"
          icon={<ListTodo />}
          title="Task todos"
          className="shrink-0"
        >
          {todoItems.length > 0
            ? `${completedCount}/${todoItems.length}`
            : null}
        </Button>
      }
    >
      <div className="flex flex-col">
        <div className="border-glass-border flex items-center justify-between border-b px-3 py-2">
          <div>
            <div className="text-ink-1 text-sm font-medium">Todos</div>
            <div className="text-ink-3 text-xs">
              {todoItems.length > 0
                ? `${completedCount}/${todoItems.length} done`
                : 'No todos yet'}
            </div>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto px-1.5 py-1.5">
          {todoItems.length === 0 ? (
            <div className="text-ink-3 px-2 py-6 text-center text-sm">
              Add task todo.
            </div>
          ) : (
            <div className="space-y-0.5">
              {todoItems.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => {
                    dragItemId.current = item.id;
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={() => {
                    dragItemId.current = null;
                  }}
                  className="hover:bg-glass-medium border-glass-border flex items-center gap-1 rounded-md border px-1.5 py-1"
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={() => {
                      dragItemId.current = item.id;
                    }}
                    className="text-ink-4 cursor-grab p-0 active:cursor-grabbing"
                    aria-label="Drag todo"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <Checkbox
                    size="sm"
                    checked={item.checked}
                    onChange={(checked) => handleToggleTodo(item.id, checked)}
                    ariaLabel={`Toggle todo ${item.title}`}
                    compact
                  />
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      handleTitleChange(item.id, event.target.value)
                    }
                    size="xs"
                    className={clsx(
                      'min-w-0 flex-1 border-none bg-transparent px-0 text-xs',
                      item.checked && 'text-ink-3 line-through',
                    )}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDeleteTodo(item.id)}
                    title="Delete todo"
                    className="h-5 min-h-5 px-1"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-glass-border flex items-center gap-2 border-t px-3 py-2">
          <Input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddTodo();
              }
            }}
            size="sm"
            placeholder="Add todo..."
            className="flex-1"
          />
          <Button variant="secondary" size="xs" onClick={handleAddTodo}>
            Add
          </Button>
        </div>
      </div>
    </Dropdown>
  );
}
