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
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';



import { Dropdown, DropdownItem } from '@/common/ui/dropdown';
import {
  useBacklogOverlayDraftStore,
  useBacklogSelectedProjectId,
  useSetBacklogSelectedProjectId,
} from '@/stores/backlog-overlay-draft';
import {
  useCreateProjectTodo,
  useDeleteProjectTodo,
  useProjectTodos,
  useReorderProjectTodos,
  useUpdateProjectTodo,
} from '@/hooks/use-project-todos';
import {
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
import type { ProjectTodo } from '@shared/types';
import { Select } from '@/common/ui/select';
import { useBackgroundNewTaskJobForBacklogItem } from '@/stores/background-jobs';
import { useCommands } from '@/common/hooks/use-commands';
import { useModal } from '@/common/context/modal';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { useProjects } from '@/hooks/use-projects';



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
  onSelect: (e: React.MouseEvent) => void;
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
      onDoubleClick={(e) => {
        if (isEditing || isCreating) return;
        if (e.target instanceof Element && e.target.closest('button')) return;
        onStartEdit();
      }}
      className={clsx(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        dragOverId === todo.id
          ? 'border-acc border-t-2'
          : 'border-t-2 border-transparent',
        isSelected ? 'bg-glass-medium' : 'hover:bg-glass-medium/50',
        isCreating && 'opacity-60',
      )}
    >
      {/* Drag handle or creating spinner */}
      {isCreating ? (
        <span className="text-acc-ink">
          <Loader2 size={14} className="animate-spin" />
        </span>
      ) : (
        <span className="text-ink-4 cursor-grab opacity-0 group-hover:opacity-100">
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
          className="text-ink-1 max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
        />
      ) : (
        <span className="text-ink-1 flex-1 truncate">{todo.content}</span>
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
                'hover:bg-bg-3 hover:text-ink-1 rounded p-0.5',
                isSelected
                  ? 'text-ink-2 opacity-100'
                  : 'text-ink-3 opacity-0 group-hover:opacity-100',
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

/** Build a range set from `from` to `to` inclusive. */
function rangeSet(from: number, to: number): Set<number> {
  const min = Math.min(from, to);
  const max = Math.max(from, to);
  const s = new Set<number>();
  for (let i = min; i <= max; i++) s.add(i);
  return s;
}

export function BacklogOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });
  const { data: projects = [] } = useProjects();
  const selectedProjectId = useBacklogSelectedProjectId();
  const setSelectedBacklogProjectId = useSetBacklogSelectedProjectId();

  const projectId =
    selectedProjectId &&
    projects.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : (projects[0]?.id ?? '');

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Selection state: selectedIndex is the cursor (for keyboard nav / scroll),
  // selectedIndices tracks all selected items for multi-select.
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );
  const anchorIndexRef = useRef<number>(-1);

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
  const {
    draft: inputValue,
    setDraft: setInputValue,
    clearDraft: clearInputValue,
  } = useBacklogOverlayDraftStore(projectId);
  const modal = useModal();
  const openOverlay = useOverlaysStore((s) => s.open);
  const setDraft = useNewTaskDraftStore((s) => s.setDraft);
  const setSelectedProjectId = useNewTaskDraftStore(
    (s) => s.setSelectedProjectId,
  );

  // --- Selection helpers ---
  const selectSingle = useCallback((index: number) => {
    setSelectedIndex(index);
    setSelectedIndices(index >= 0 ? new Set([index]) : new Set());
    anchorIndexRef.current = index;
  }, []);

  const selectRange = useCallback((toIndex: number) => {
    const from = anchorIndexRef.current;
    if (from < 0) {
      setSelectedIndex(toIndex);
      setSelectedIndices(new Set([toIndex]));
      anchorIndexRef.current = toIndex;
      return;
    }
    setSelectedIndices(rangeSet(from, toIndex));
    setSelectedIndex(toIndex);
  }, []);

  const toggleSelect = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setSelectedIndex(index);
    anchorIndexRef.current = index;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIndex(-1);
    setSelectedIndices(new Set());
    anchorIndexRef.current = -1;
  }, []);

  const handleProjectChange = useCallback(
    (nextProjectId: string) => {
      setSelectedBacklogProjectId(nextProjectId);
      clearSelection();
      // Re-focus input after project switch
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [clearSelection, setSelectedBacklogProjectId],
  );

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
  }, [inputValue]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const selectedItem = listRef.current?.querySelector<HTMLDivElement>(
      `[data-selected="true"]`,
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

  const hasSelection = selectedIndices.size > 0;
  const multiSelected = selectedIndices.size > 1;

  // Get all selected todos in their original order
  const selectedTodos = useMemo(
    () => todos.filter((_, i) => selectedIndices.has(i)),
    [todos, selectedIndices],
  );

  // Register keyboard shortcuts (Cmd+B is handled by the container's toggle).
  useCommands(
    'backlog-overlay',
    [
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
          // If a single item is selected, open its dropdown
          if (selectedTodo && !multiSelected) {
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
          // Only allow editing a single selected item
          if (!selectedTodo || multiSelected) {
            return false;
          }

          startEdit(selectedTodo);
        },
        hideInCommandPalette: true,
      },
      {
        label: hasSelection
          ? multiSelected
            ? `Convert ${selectedIndices.size} Items to Task`
            : 'Convert Selected Item to Task'
          : 'Add Backlog Item',
        shortcut: 'cmd+enter',
        handler: () => {
          if (editingId) {
            saveEdit();
            return;
          }

          if (hasSelection && selectedTodos.length > 0) {
            handleConvertSelectedToTask();
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
    ],
    { layer },
  );

  // Navigation bindings: up/down skip when typing in an input (ignoreIfInput),
  // cmd+up/cmd+down reorder the selected item, tab toggles focus.
  // shift+up/shift+down extend selection range.
  useRegisterKeyboardBindings(
    'backlog-overlay-navigation',
    {
      up: {
        handler: () => {
          if (selectedIndex <= 0) {
            if (!inputValue.trim()) {
              lastSelectedIndexRef.current = 0;
              selectSingle(-1);
              inputRef.current?.focus();
            }
            return;
          }
          selectSingle(selectedIndex - 1);
        },
        ignoreIfInput: true,
      },
      down: {
        handler: () => {
          const next = Math.min(todos.length - 1, selectedIndex + 1);
          selectSingle(next);
        },
        ignoreIfInput: true,
      },
      'shift+up': {
        handler: () => {
          if (selectedIndex <= 0) return;
          const next = selectedIndex - 1;
          setSelectedIndex(next);
          if (anchorIndexRef.current < 0) {
            anchorIndexRef.current = selectedIndex;
          }
          setSelectedIndices(rangeSet(anchorIndexRef.current, next));
        },
        ignoreIfInput: true,
      },
      'shift+down': {
        handler: () => {
          if (selectedIndex >= todos.length - 1) return;
          const next = selectedIndex + 1;
          setSelectedIndex(next);
          if (anchorIndexRef.current < 0) {
            anchorIndexRef.current = selectedIndex;
          }
          setSelectedIndices(rangeSet(anchorIndexRef.current, next));
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
          selectSingle(selectedIndex - 1);
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
          selectSingle(selectedIndex + 1);
        },
        ignoreIfInput: true,
      },
      tab: () => {
        if (todos.length === 0) return;
        if (selectedIndex >= 0) {
          // List → Input: remember position, focus textarea
          lastSelectedIndexRef.current = selectedIndex;
          clearSelection();
          inputRef.current?.focus();
        } else {
          // Input → List: restore last position (or first item)
          const idx = Math.min(lastSelectedIndexRef.current, todos.length - 1);
          selectSingle(idx >= 0 ? idx : 0);
          inputRef.current?.blur();
        }
      },
      'cmd+backspace': {
        handler: () => {
          if (editingId) {
            return false;
          }
          if (hasSelection && selectedTodos.length > 0) {
            handleDeleteSelected();
            return;
          }
          return false;
        },
        ignoreIfInput: true,
      },
    },
    { layer },
  );

  // Add todo
  const handleAdd = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !projectId) return;
    createTodo.mutate({ projectId, content });
    clearInputValue();
    inputRef.current?.focus();
  }, [clearInputValue, createTodo, inputValue, projectId]);

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

  // Delete selected todos (single or multi)
  const handleDeleteSelected = useCallback(() => {
    if (selectedTodos.length === 0) return;

    const isBulk = selectedTodos.length > 1;
    modal.confirm({
      title: isBulk
        ? `Delete ${selectedTodos.length} backlog items?`
        : 'Delete backlog item?',
      content: isBulk
        ? `This will permanently delete ${selectedTodos.length} items from your backlog.`
        : `This will permanently delete "${selectedTodos[0].content}" from your backlog.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        for (const todo of selectedTodos) {
          deleteTodo.mutate(todo.id);
        }
        clearSelection();
      },
    });
  }, [selectedTodos, deleteTodo, modal, clearSelection]);

  // Delete single todo (from context menu)
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

  // Convert selected todos to task (single or multi)
  const handleConvertSelectedToTask = useCallback(() => {
    if (selectedTodos.length === 0 || !projectId) return;
    const prompt = selectedTodos.map((t) => t.content).join('\n\n');
    const ids = selectedTodos.map((t) => t.id);
    setSelectedProjectId(projectId);
    setDraft(projectId, {
      prompt,
      inputMode: 'prompt',
      backlogTodoIds: ids,
    });
    onClose();
    openOverlay('new-task');
  }, [
    selectedTodos,
    projectId,
    setDraft,
    setSelectedProjectId,
    onClose,
    openOverlay,
  ]);

  // Convert single todo to task (from context menu)
  const handleConvertToTask = useCallback(
    (todo: ProjectTodo) => {
      if (!projectId) return;
      setSelectedProjectId(projectId);
      setDraft(projectId, {
        prompt: todo.content,
        inputMode: 'prompt',
        backlogTodoIds: [todo.id],
      });
      onClose();
      openOverlay('new-task');
    },
    [projectId, setDraft, setSelectedProjectId, onClose, openOverlay],
  );

  // Click handler for todo rows
  const handleRowClick = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (e.metaKey || e.ctrlKey) {
        toggleSelect(index);
      } else if (e.shiftKey) {
        selectRange(index);
      } else {
        selectSingle(index);
      }
    },
    [toggleSelect, selectRange, selectSingle],
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

  // Derive label for cmd+enter footer hint
  const convertLabel = hasSelection
    ? multiSelected
      ? `Convert ${selectedIndices.size} Items to Task`
      : 'Convert Selected Item To Task'
    : 'Add Item';

  return createPortal(
    <FocusLock returnFocus>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        onClick={handleOverlayClick}
      >
        <div
          className="border-glass-border bg-bg-1 flex max-h-[60svh] w-[90svw] max-w-[720px] flex-col overflow-hidden rounded-lg border shadow-2xl"
          onClick={handleModalClick}
        >
          {/* Project selector header */}
          <div className="border-glass-border flex items-center border-b px-4 py-2">
            <Select
              value={projectId}
              options={projectOptions}
              onChange={handleProjectChange}
              label="Project"
              className="text-ink-1 hover:bg-glass-medium border-none bg-transparent px-1 py-0.5 hover:border-none"
            />
          </div>

          {/* Quick-add input */}
          <div className="border-glass-border flex items-center border-b px-4 py-3">
            <textarea
              ref={inputRef}
              placeholder="Add a todo..."
              autoFocus
              rows={1}
              value={inputValue}
              disabled={!projectId}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') return;
                if (inputValue.trim()) return;
                if (todos.length === 0) return;

                e.preventDefault();
                selectSingle(0);
                inputRef.current?.blur();
              }}
              onFocus={() => {
                if (selectedIndex < 0) return;
                lastSelectedIndexRef.current = selectedIndex;
                clearSelection();
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
              <div className="text-ink-3 py-8 text-center text-sm">
                {projectId
                  ? 'No backlog items yet. Type above and press Cmd+Enter to add one.'
                  : 'No projects available.'}
              </div>
            ) : (
              todos.map((todo, index) => (
                <BacklogTodoRow
                  key={todo.id}
                  todo={todo}
                  isSelected={selectedIndices.has(index)}
                  isEditing={editingId === todo.id}
                  editValue={editValue}
                  dragOverId={dragOverId}
                  triggerRefs={triggerRefs}
                  onSelect={(e) => handleRowClick(e, index)}
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

          <div className="border-glass-border text-ink-2 flex flex-wrap items-center gap-3 border-t px-4 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Kbd shortcut="tab" /> Switch Input/List Focus
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd shortcut="cmd+enter" />
              {convertLabel}
            </span>
            {hasSelection && (
              <>
                {!multiSelected && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <Kbd shortcut="shift+enter" /> Edit Selected Item
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Kbd shortcut="enter" /> Open Selected Item Actions
                    </span>
                  </>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Kbd shortcut="cmd+backspace" />{' '}
                  {multiSelected
                    ? `Delete ${selectedIndices.size} Items`
                    : 'Delete Selected Item'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </FocusLock>,
    document.body,
  );
}
