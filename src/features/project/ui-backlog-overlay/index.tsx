import clsx from 'clsx';
import {
  ArrowRight,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useModal } from '@/common/context/modal';
import { useCommands } from '@/common/hooks/use-commands';
import { Dropdown, DropdownItem } from '@/common/ui/dropdown';
import { Kbd } from '@/common/ui/kbd';
import { Select } from '@/common/ui/select';
import {
  useProjectTodos,
  useCreateProjectTodo,
  useUpdateProjectTodo,
  useDeleteProjectTodo,
  useReorderProjectTodos,
} from '@/hooks/use-project-todos';
import { useProjects } from '@/hooks/use-projects';
import { useBackgroundNewTaskJobForBacklogItem } from '@/stores/background-jobs';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import type { ProjectTodo } from '@shared/types';

function BacklogTodoRow({
  todo,
  isSelected,
  isEditing,
  editValue,
  dragOverId,
  triggerRefs,
  onSelect,
  onEditChange,
  onEditBlur,
  onStartEdit,
  onConvertToTask,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  todo: ProjectTodo;
  isSelected: boolean;
  isEditing: boolean;
  editValue: string;
  dragOverId: string | null;
  triggerRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  onSelect: () => void;
  onEditChange: (value: string) => void;
  onEditBlur: () => void;
  onStartEdit: () => void;
  onConvertToTask: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isCreating = useBackgroundNewTaskJobForBacklogItem({
    itemId: todo.id,
  });

  return (
    <div
      data-selected={isSelected}
      draggable={!isEditing && !isCreating}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={clsx(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        dragOverId === todo.id
          ? 'border-t-2 border-blue-500'
          : 'border-t-2 border-transparent',
        isSelected ? 'bg-neutral-700' : 'hover:bg-neutral-700/50',
        isCreating && 'opacity-60',
      )}
    >
      {/* Drag handle or creating spinner */}
      {isCreating ? (
        <span className="text-blue-400">
          <Loader2 size={14} className="animate-spin" />
        </span>
      ) : (
        <span className="cursor-grab text-neutral-600 opacity-0 group-hover:opacity-100">
          <GripVertical size={14} />
        </span>
      )}

      {/* Content or edit textarea */}
      {isEditing ? (
        <textarea
          autoFocus
          rows={1}
          value={editValue}
          onChange={(e) => {
            onEditChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          ref={(el) => {
            // Auto-resize on mount to fit existing content
            if (el) {
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          onBlur={onEditBlur}
          className="max-h-32 flex-1 resize-none bg-transparent text-sm text-neutral-200 outline-none"
        />
      ) : (
        <span className="flex-1 truncate text-neutral-300">{todo.content}</span>
      )}

      {/* Context menu (hidden while creating) */}
      {!isEditing && !isCreating && (
        <Dropdown
          trigger={
            <button
              ref={(node: HTMLButtonElement | null) => {
                if (node) {
                  triggerRefs.current.set(todo.id, node);
                } else {
                  triggerRefs.current.delete(todo.id);
                }
              }}
              className={clsx(
                'rounded p-0.5 hover:bg-neutral-600 hover:text-neutral-300',
                isSelected
                  ? 'text-neutral-400 opacity-100'
                  : 'text-neutral-500 opacity-0 group-hover:opacity-100',
              )}
            >
              <MoreHorizontal size={14} />
            </button>
          }
          align="right"
        >
          <DropdownItem onClick={onStartEdit} icon={<Pencil size={14} />}>
            Edit
          </DropdownItem>
          <DropdownItem
            onClick={onConvertToTask}
            icon={<ArrowRight size={14} />}
          >
            Convert to task
          </DropdownItem>
          <DropdownItem
            onClick={onDelete}
            icon={<Trash2 size={14} />}
            variant="danger"
          >
            Delete
          </DropdownItem>
        </Dropdown>
      )}
    </div>
  );
}

export function BacklogOverlay({
  initialProjectId,
  onClose,
}: {
  initialProjectId: string;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const { data: projects = [] } = useProjects();

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const handleProjectChange = useCallback(
    (nextProjectId: string) => {
      setProjectId(nextProjectId);
      setSelectedIndex(-1);
      setInputValue('');
      // Re-focus input after project switch
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    // setSelectedIndex and setInputValue are stable setState dispatchers

    [],
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const lastSelectedIndexRef = useRef(0);
  const dragItemId = useRef<string | null>(null);

  const { data: todos = [] } = useProjectTodos(projectId);
  const createTodo = useCreateProjectTodo();
  const updateTodo = useUpdateProjectTodo();
  const deleteTodo = useDeleteProjectTodo();
  const reorderTodos = useReorderProjectTodos();
  const modal = useModal();
  const openOverlay = useOverlaysStore((s) => s.open);
  const setDraft = useNewTaskDraftStore((s) => s.setDraft);
  const setSelectedProjectId = useNewTaskDraftStore(
    (s) => s.setSelectedProjectId,
  );

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const selectedItem = listRef.current?.querySelector<HTMLDivElement>(
      '[data-selected="true"]',
    );
    selectedItem?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });
  }, [selectedIndex]);

  const selectedTodo =
    selectedIndex >= 0 && selectedIndex < todos.length
      ? todos[selectedIndex]
      : null;

  // Register keyboard shortcuts (Cmd+B is handled by the container's toggle).
  useCommands('backlog-overlay', [
    {
      label: 'Close Backlog',
      shortcut: 'escape',
      handler: () => {
        if (editingId) {
          cancelEdit();
          return;
        }
        onClose();
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Open Todo Actions',
      shortcut: 'enter',
      handler: () => {
        // If editing, save the edit
        if (editingId) {
          saveEdit();
          return;
        }
        // If an item is selected, open its dropdown
        if (selectedTodo) {
          triggerRefs.current.get(selectedTodo.id)?.click();
          return;
        }

        return false;
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Edit Selected Item',
      shortcut: 'shift+enter',
      handler: () => {
        if (editingId) {
          return false;
        }
        if (!selectedTodo) {
          return false;
        }

        startEdit(selectedTodo);
      },
      hideInCommandPalette: true,
    },
    {
      label: selectedTodo
        ? 'Convert Selected Item to Task'
        : 'Add Backlog Item',
      shortcut: 'cmd+enter',
      handler: () => {
        if (editingId) {
          saveEdit();
          return;
        }

        if (selectedTodo) {
          handleConvertToTask(selectedTodo);
          return;
        }

        if (inputValue.trim()) {
          handleAdd();
          return;
        }

        return false;
      },
      hideInCommandPalette: true,
    },
  ]);

  // Navigation bindings: up/down skip when typing in an input (ignoreIfInput),
  // cmd+up/cmd+down reorder the selected item, tab toggles focus.
  useRegisterKeyboardBindings('backlog-overlay-navigation', {
    up: {
      handler: () => {
        if (selectedIndex <= 0) {
          if (!inputValue.trim()) {
            lastSelectedIndexRef.current = 0;
            setSelectedIndex(-1);
            inputRef.current?.focus();
          }
          return;
        }
        setSelectedIndex((i) => i - 1);
      },
      ignoreIfInput: true,
    },
    down: {
      handler: () => {
        setSelectedIndex((i) => Math.min(todos.length - 1, i + 1));
      },
      ignoreIfInput: true,
    },
    'cmd+up': {
      handler: () => {
        if (selectedIndex <= 0 || todos.length < 2) return;
        const ids = todos.map((t) => t.id);
        const newIds = [...ids];
        [newIds[selectedIndex - 1], newIds[selectedIndex]] = [
          newIds[selectedIndex],
          newIds[selectedIndex - 1],
        ];
        reorderTodos.mutate({ projectId, orderedIds: newIds });
        setSelectedIndex(selectedIndex - 1);
      },
      ignoreIfInput: true,
    },
    'cmd+down': {
      handler: () => {
        if (selectedIndex < 0 || selectedIndex >= todos.length - 1) return;
        const ids = todos.map((t) => t.id);
        const newIds = [...ids];
        [newIds[selectedIndex], newIds[selectedIndex + 1]] = [
          newIds[selectedIndex + 1],
          newIds[selectedIndex],
        ];
        reorderTodos.mutate({ projectId, orderedIds: newIds });
        setSelectedIndex(selectedIndex + 1);
      },
      ignoreIfInput: true,
    },
    tab: () => {
      if (todos.length === 0) return;
      if (selectedIndex >= 0) {
        // List → Input: remember position, focus textarea
        lastSelectedIndexRef.current = selectedIndex;
        setSelectedIndex(-1);
        inputRef.current?.focus();
      } else {
        // Input → List: restore last position (or first item)
        const idx = Math.min(lastSelectedIndexRef.current, todos.length - 1);
        setSelectedIndex(idx >= 0 ? idx : 0);
        inputRef.current?.blur();
      }
    },
    'cmd+backspace': {
      handler: () => {
        if (!selectedTodo || editingId) {
          return false;
        }
        handleDelete(selectedTodo);
      },
      ignoreIfInput: true,
    },
  });

  // Add todo
  const handleAdd = useCallback(() => {
    const content = inputValue.trim();
    if (!content) return;
    createTodo.mutate({ projectId, content });
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, projectId, createTodo]);

  // Start inline edit
  const startEdit = useCallback((todo: ProjectTodo) => {
    setEditingId(todo.id);
    setEditValue(todo.content);
  }, []);

  // Save inline edit
  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const content = editValue.trim();
    if (content) {
      updateTodo.mutate({ id: editingId, content });
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, updateTodo]);

  // Cancel inline edit
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  // Delete todo
  const handleDelete = useCallback(
    (todo: ProjectTodo) => {
      modal.confirm({
        title: 'Delete backlog item?',
        content: `This will permanently delete "${todo.content}" from your backlog.`,
        confirmLabel: 'Delete',
        variant: 'danger',
        onConfirm: () => {
          deleteTodo.mutate(todo.id);
        },
      });
    },
    [deleteTodo, modal],
  );

  // Convert to task
  const handleConvertToTask = useCallback(
    (todo: ProjectTodo) => {
      // Pre-fill new task draft with todo content, track the todo ID for
      // cleanup after task creation, and select the project tab
      setSelectedProjectId(projectId);
      setDraft(projectId, {
        prompt: todo.content,
        inputMode: 'prompt',
        backlogTodoId: todo.id,
      });
      // Close backlog first, then open new-task overlay
      onClose();
      openOverlay('new-task');
    },
    [projectId, setDraft, setSelectedProjectId, onClose, openOverlay],
  );

  // Drag-and-drop handlers
  const handleDragStart = useCallback((todoId: string) => {
    dragItemId.current = todoId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, todoId: string) => {
    e.preventDefault();
    if (dragItemId.current && dragItemId.current !== todoId) {
      setDragOverId(todoId);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      const sourceId = dragItemId.current;
      dragItemId.current = null;

      if (!sourceId || sourceId === targetId) return;

      const currentIds = todos.map((t) => t.id);
      const sourceIndex = currentIds.indexOf(sourceId);
      const targetIndex = currentIds.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const newIds = [...currentIds];
      newIds.splice(sourceIndex, 1);
      newIds.splice(targetIndex, 0, sourceId);

      reorderTodos.mutate({ projectId, orderedIds: newIds });
    },
    [todos, projectId, reorderTodos],
  );

  const handleDragEnd = useCallback(() => {
    dragItemId.current = null;
    setDragOverId(null);
  }, []);

  // Handle backdrop click
  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={handleOverlayClick}
    >
      <div
        className="flex max-h-[60svh] w-[90svw] max-w-[720px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
        onClick={handleModalClick}
      >
        {/* Project selector header */}
        <div className="flex items-center border-b border-neutral-700 px-4 py-2">
          <Select
            value={projectId}
            options={projectOptions}
            onChange={handleProjectChange}
            label="Project"
            className="border-none bg-transparent px-1 py-0.5 text-neutral-300 hover:border-none hover:bg-neutral-700"
          />
        </div>

        {/* Quick-add input */}
        <div className="flex items-center border-b border-neutral-700 px-4 py-3">
          <textarea
            ref={inputRef}
            placeholder="Add a todo..."
            autoFocus
            rows={1}
            value={inputValue}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') return;
              if (inputValue.trim()) return;
              if (todos.length === 0) return;

              e.preventDefault();
              setSelectedIndex(0);
              inputRef.current?.blur();
            }}
            onFocus={() => {
              if (selectedIndex < 0) return;
              lastSelectedIndexRef.current = selectedIndex;
              setSelectedIndex(-1);
            }}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            className="placeholder:text-muted-foreground max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
          />
        </div>

        {/* Todo list */}
        <div ref={listRef} className="overflow-y-auto p-2">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">
              No backlog items yet. Type above and press Cmd+Enter to add one.
            </div>
          ) : (
            todos.map((todo, index) => (
              <BacklogTodoRow
                key={todo.id}
                todo={todo}
                isSelected={index === selectedIndex}
                isEditing={editingId === todo.id}
                editValue={editValue}
                dragOverId={dragOverId}
                triggerRefs={triggerRefs}
                onSelect={() => setSelectedIndex(index)}
                onEditChange={setEditValue}
                onEditBlur={saveEdit}
                onStartEdit={() => startEdit(todo)}
                onConvertToTask={() => handleConvertToTask(todo)}
                onDelete={() => handleDelete(todo)}
                onDragStart={() => handleDragStart(todo.id)}
                onDragOver={(e) => handleDragOver(e, todo.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, todo.id)}
                onDragEnd={handleDragEnd}
              />
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-700 px-4 py-2 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <Kbd shortcut="tab" /> Switch Input/List Focus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd shortcut="cmd+enter" />
            {selectedTodo ? 'Convert Selected Item To Task' : 'Add Item'}
          </span>
          {selectedTodo && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Kbd shortcut="shift+enter" /> Edit Selected Item
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd shortcut="enter" /> Open Selected Item Actions
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd shortcut="cmd+backspace" /> Delete Selected Item
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
