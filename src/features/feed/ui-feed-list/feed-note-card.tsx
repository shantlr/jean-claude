import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowRight, Check, Pencil, StickyNote, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import { useDeleteFeedNote, useUpdateFeedNote } from '@/hooks/use-feed-notes';
import { useProjects } from '@/hooks/use-projects';
import { formatRelativeTime } from '@/lib/time';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import type { FeedItem } from '@shared/feed-types';

function getFirstLine(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return firstLine || text.trim().slice(0, 100);
}

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
  const navigate = useNavigate();
  const updateNote = useUpdateFeedNote();
  const deleteNote = useDeleteFeedNote();
  const menuRef = useRef<{ toggle: () => void } | null>(null);

  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const { data: projects } = useProjects();
  const setDraft = useNewTaskDraftStore((s) => s.setDraft);
  const setSelectedProjectId = useNewTaskDraftStore(
    (s) => s.setSelectedProjectId,
  );
  const openOverlay = useOverlaysStore((s) => s.open);

  const firstLine = useMemo(() => getFirstLine(item.title), [item.title]);

  const openNote = useCallback(() => {
    if (item.noteId) {
      navigate({
        to: '/all/notes/$noteId',
        params: { noteId: item.noteId },
      });
    }
  }, [item.noteId, navigate]);

  const openMenu = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    menuRef.current?.toggle();
  }, []);

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
          onClick={openNote}
          onContextMenu={openMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openNote();
              return;
            }
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              openMenu(e);
            }
          }}
          className={clsx(
            'flex cursor-pointer flex-col gap-1 rounded-lg px-3.5 py-2.5 transition-all duration-200 ease-out',
            isSelected
              ? 'bg-surface-bright border-r-primary border-r-2 shadow-sm'
              : 'hover:bg-surface-bright border border-transparent hover:translate-x-0.5',
          )}
        >
          <div className="flex items-center gap-2">
            <StickyNote className="h-3.5 w-3.5 shrink-0 text-yellow-500/70" />
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
              {firstLine}
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
        onClick={openNote}
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
