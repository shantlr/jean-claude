import { ArrowRight, Check, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type React from 'react';
import { useNavigate } from '@tanstack/react-router';



import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import {
  getFeedNoteTaskIndex,
  parseFeedNoteLines,
  toggleFeedNoteContentCheckbox,
} from '@/lib/feed-note-checkboxes';
import { useDeleteFeedNote, useUpdateFeedNote } from '@/hooks/use-feed-notes';
import { Checkbox } from '@/common/ui/checkbox';
import type { FeedItem } from '@shared/feed-types';
import { formatRelativeTime } from '@/lib/time';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { useProjects } from '@/hooks/use-projects';



function parseNotePreview(text: string): {
  title: ReturnType<typeof parseFeedNoteLines>[number];
  contentLines: ReturnType<typeof parseFeedNoteLines>;
  hasMore: boolean;
} {
  const lines = parseFeedNoteLines(text);
  const title = lines[0] ?? { lineIndex: 0, text: text.trim().slice(0, 100) };
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

  const handleToggleCheckbox = useCallback(
    (checked: boolean, lineIndex: number) => {
      if (!item.noteId) return;

      updateNote.mutate({
        id: item.noteId,
        content: toggleFeedNoteContentCheckbox({
          content: item.noteContent ?? '',
          taskIndex: getFeedNoteTaskIndex({
            content: item.title,
            lineIndex,
          }),
          checked,
        }),
      });
    },
    [item.noteContent, item.noteId, item.title, updateNote],
  );

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
          data-feed-selected={isSelected ? 'true' : 'false'}
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
              ? 'border-l-[3px] border-l-[var(--color-acc)]'
              : 'border-l-[3px] border-l-transparent',
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
          <div
            className={clsx(
              'flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pr-3.5 pl-0 transition-[padding] duration-150',
              isSelected && 'pl-3',
            )}
          >
            {/* Title */}
            <div className="flex items-start gap-1.5">
              {notePreview.title.task && (
                <Checkbox
                  size="sm"
                  checked={notePreview.title.task.checked}
                  onChange={(checked) =>
                    handleToggleCheckbox(checked, notePreview.title.lineIndex)
                  }
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="mt-0.5"
                  compact
                  ariaLabel={`Toggle ${notePreview.title.text || 'note item'}`}
                />
              )}
              <span
                className={clsx(
                  'min-w-0 flex-1 truncate text-[12.5px] leading-snug',
                  notePreview.title.task?.checked && 'text-ink-3 line-through',
                  isSelected ? 'text-ink-0 font-medium' : 'text-ink-1',
                )}
              >
                {notePreview.title.text}
              </span>
            </div>

            {/* Content preview */}
            {notePreview.contentLines.length > 0 && (
              <div className="text-ink-3 text-[11px] leading-snug">
                {notePreview.contentLines.map((line) => (
                  <div
                    key={line.lineIndex}
                    className="flex items-center gap-1 truncate"
                  >
                    {line.task && (
                      <Checkbox
                        size="sm"
                        checked={line.task.checked}
                        onChange={(checked) =>
                          handleToggleCheckbox(checked, line.lineIndex)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        compact
                        ariaLabel={`Toggle ${line.text || 'note item'}`}
                      />
                    )}
                    <span
                      className={clsx(
                        'truncate',
                        line.task?.checked && 'line-through opacity-70',
                      )}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
                {notePreview.hasMore && (
                  <span className="text-ink-3/60 text-[10px]">…</span>
                )}
              </div>
            )}

            <div className="flex justify-end pt-0.5">
              <span className="text-ink-3/80 font-mono text-[9.5px]">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
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
