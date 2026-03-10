import clsx from 'clsx';
import { ArrowRight, Check, Pencil, StickyNote, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import { useDeleteFeedNote, useUpdateFeedNote } from '@/hooks/use-feed-notes';
import { useProjects } from '@/hooks/use-projects';
import { formatRelativeTime } from '@/lib/time';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import type { FeedItem } from '@shared/feed-types';

export function FeedNoteCard({
  item,
  isSelected,
  isDraggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  item: FeedItem;
  isSelected?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const updateNote = useUpdateFeedNote();
  const deleteNote = useDeleteFeedNote();
  const menuRef = useRef<{ toggle: () => void } | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.title);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const { data: projects } = useProjects();
  const setDraft = useNewTaskDraftStore((s) => s.setDraft);
  const setSelectedProjectId = useNewTaskDraftStore(
    (s) => s.setSelectedProjectId,
  );
  const openOverlay = useOverlaysStore((s) => s.open);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const openMenu = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    menuRef.current?.toggle();
  }, []);

  const startEdit = useCallback(() => {
    setEditValue(item.title);
    setIsEditing(true);
    menuRef.current?.toggle();
  }, [item.title]);

  const saveEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.title && item.noteId) {
      updateNote.mutate({ id: item.noteId, content: trimmed });
    }
    setIsEditing(false);
  }, [editValue, item.title, item.noteId, updateNote]);

  const cancelEdit = useCallback(() => {
    setEditValue(item.title);
    setIsEditing(false);
  }, [item.title]);

  const handleDelete = useCallback(() => {
    if (item.noteId) {
      deleteNote.mutate({ id: item.noteId });
    }
    menuRef.current?.toggle();
  }, [item.noteId, deleteNote]);

  const handleMarkDone = useCallback(() => {
    if (item.noteId) {
      updateNote.mutate({
        id: item.noteId,
        completedAt: new Date().toISOString(),
      });
    }
    menuRef.current?.toggle();
  }, [item.noteId, updateNote]);

  const handleConvertToTask = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setDraft(projectId, {
        prompt: item.title,
        inputMode: 'prompt',
      });
      setShowProjectPicker(false);
      menuRef.current?.toggle();
      openOverlay('new-task');
    },
    [item.title, setSelectedProjectId, setDraft, openOverlay],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit],
  );

  if (isEditing) {
    return (
      <div
        className={clsx(
          'flex flex-col gap-1 rounded-lg border border-yellow-500/30 bg-neutral-800 px-3.5 py-2.5',
        )}
      >
        <textarea
          ref={editInputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={saveEdit}
          rows={2}
          className="w-full resize-none bg-transparent text-sm text-neutral-100 placeholder-neutral-500 outline-none"
        />
        <div className="flex items-center justify-end gap-1">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelEdit}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X size={12} />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveEdit}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <Check size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dropdown
      trigger={({ triggerRef }) => (
        <div
          ref={triggerRef as React.Ref<HTMLDivElement>}
          tabIndex={0}
          draggable={isDraggable}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onClick={startEdit}
          onContextMenu={openMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEdit();
              return;
            }
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              openMenu(e);
            }
          }}
          className={clsx(
            'flex cursor-pointer flex-col gap-1 rounded-lg px-3.5 py-2.5 transition-all duration-200 ease-out',
            isSelected
              ? 'border border-yellow-500/40 bg-neutral-800 shadow-sm'
              : 'border border-transparent hover:translate-x-0.5 hover:bg-neutral-800/80',
          )}
        >
          <div className="flex items-center gap-2">
            <StickyNote className="h-3.5 w-3.5 shrink-0 text-yellow-500/70" />
            <span className="min-w-0 flex-1 text-sm text-neutral-200">
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>
        </div>
      )}
      dropdownRef={menuRef}
      className="min-w-[180px]"
    >
      <DropdownItem
        onClick={startEdit}
        icon={<Pencil className="text-neutral-400" />}
      >
        Edit
      </DropdownItem>
      <DropdownItem
        onClick={handleMarkDone}
        icon={<Check className="text-neutral-400" />}
      >
        Mark done
      </DropdownItem>
      <DropdownDivider />
      {!showProjectPicker ? (
        <DropdownItem
          onClick={() => {
            setShowProjectPicker(true);
          }}
          icon={<ArrowRight className="text-neutral-400" />}
        >
          Convert to task…
        </DropdownItem>
      ) : (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
            Select project
          </div>
          {projects?.map((project) => (
            <DropdownItem
              key={project.id}
              onClick={() => handleConvertToTask(project.id)}
              icon={
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
              }
            >
              {project.name}
            </DropdownItem>
          ))}
        </>
      )}
      <DropdownDivider />
      <DropdownItem
        onClick={handleDelete}
        icon={<Trash2 className="text-red-400" />}
      >
        Delete
      </DropdownItem>
    </Dropdown>
  );
}
