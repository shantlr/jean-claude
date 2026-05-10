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

function parseNotePreview(text: string): {
  title: string;
  contentLines: string[];
  hasMore: boolean;
} {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const title = lines[0] ?? text.trim().slice(0, 100);
  const contentLines = lines.slice(1, 3);
  const hasMore = lines.length > 3;
  return { title, contentLines, hasMore };
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

  const notePreview = useMemo(() => parseNotePreview(item.title), [item.title]);

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
          role="link"
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
            'group/row relative flex cursor-pointer border-b transition-colors',
            'border-line-soft',
            isSelected
              ? 'border-l-2 border-l-[var(--color-acc)]'
              : 'border-l-2 border-l-transparent',
            !isSelected && 'hover:bg-glass-light',
          )}
          style={{ minHeight: 50 }}
        >
          {/* Icon column */}
          <div
            className="flex shrink-0 items-center justify-center"
            style={{ width: 32 }}
          >
            <StickyNote className="text-ink-3 h-3.5 w-3.5" />
          </div>

          {/* Content column */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pr-3.5">
            {/* Title + time */}
            <div className="flex items-start gap-1.5">
              <span
                className={clsx(
                  'min-w-0 flex-1 truncate text-[12.5px] leading-snug',
                  isSelected ? 'text-ink-0 font-medium' : 'text-ink-1',
                )}
              >
                {notePreview.title}
              </span>
              <span className="text-ink-3 mt-0.5 shrink-0 font-mono text-[9.5px]">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>

            {/* Content preview */}
            {notePreview.contentLines.length > 0 && (
              <div className="text-ink-3 text-[11px] leading-snug">
                {notePreview.contentLines.map((line, i) => (
                  <div key={i} className="truncate">
                    {line}
                  </div>
                ))}
                {notePreview.hasMore && (
                  <span className="text-ink-3/60 text-[10px]">…</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      dropdownRef={menuRef}
      className="min-w-[180px]"
    >
      <DropdownItem onClick={openNote} icon={<Pencil className="text-ink-2" />}>
        Edit
      </DropdownItem>
      <DropdownItem
        onClick={handleMarkDone}
        icon={<Check className="text-ink-2" />}
      >
        Mark done
      </DropdownItem>
      <DropdownDivider />
      {!showProjectPicker ? (
        <DropdownItem
          onClick={() => {
            setShowProjectPicker(true);
          }}
          icon={<ArrowRight className="text-ink-2" />}
        >
          Convert to task…
        </DropdownItem>
      ) : (
        <>
          <div className="text-ink-3 px-3 py-1.5 text-xs font-medium">
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
        icon={<Trash2 className="text-status-fail" />}
      >
        Delete
      </DropdownItem>
    </Dropdown>
  );
}
