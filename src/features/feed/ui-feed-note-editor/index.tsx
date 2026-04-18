import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  useDeleteFeedNote,
  useFeedNoteById,
  useUpdateFeedNote,
} from '@/hooks/use-feed-notes';

export function FeedNoteEditor({ noteId }: { noteId: string }) {
  const navigate = useNavigate();
  const { note, isLoading } = useFeedNoteById(noteId);
  const updateNote = useUpdateFeedNote();
  const deleteNote = useDeleteFeedNote();

  const [value, setValue] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const lastSavedRef = useRef('');
  const isDeletedRef = useRef(false);

  // Stable ref for mutate so cleanup effect doesn't re-fire every render
  const mutateRef = useRef(updateNote.mutate);
  mutateRef.current = updateNote.mutate;

  // Initialize value from note content
  useEffect(() => {
    if (note && !hasInitialized) {
      setValue(note.title);
      lastSavedRef.current = note.title;
      setHasInitialized(true);
    }
  }, [note, hasInitialized]);

  // Auto-save via debounced value
  const debouncedValue = useDebouncedValue(value, 500);

  useEffect(() => {
    if (!hasInitialized || isDeletedRef.current) return;
    const trimmed = debouncedValue.trim();
    if (trimmed && trimmed !== lastSavedRef.current) {
      lastSavedRef.current = trimmed;
      mutateRef.current({ id: noteId, content: trimmed });
    }
  }, [debouncedValue, hasInitialized, noteId]);

  // Keep refs for unmount flush
  const valueRef = useRef(value);
  valueRef.current = value;

  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Flush pending save on unmount only
  useEffect(() => {
    return () => {
      if (isDeletedRef.current) return;
      const trimmed = valueRef.current.trim();
      if (trimmed && trimmed !== lastSavedRef.current) {
        lastSavedRef.current = trimmed;
        mutateRef.current({ id: noteIdRef.current, content: trimmed });
      }
    };
  }, []);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handleDelete = useCallback(() => {
    isDeletedRef.current = true;
    deleteNote.mutate(
      { id: noteId },
      {
        onSuccess: () => {
          navigate({ to: '/all' });
        },
      },
    );
  }, [noteId, deleteNote, navigate]);

  const handleClose = useCallback(() => {
    navigate({ to: '/all' });
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="text-ink-3 flex h-full w-full flex-1 items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!note) {
    return (
      <div className="text-ink-3 flex h-full w-full flex-1 items-center justify-center">
        Note not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-line-soft flex shrink-0 items-center justify-between border-b px-4 py-3">
        <span className="text-ink-1 text-sm font-medium">Note</span>
        <div className="flex items-center gap-2">
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Delete
          </Button>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={handleClose}
            icon={<X />}
            tooltip="Close"
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4">
        <textarea
          value={value}
          onChange={handleChange}
          placeholder="Write your note..."
          autoFocus
          className="text-ink-1 placeholder-ink-4 h-full w-full resize-none bg-transparent font-mono text-sm leading-relaxed outline-none"
        />
      </div>
    </div>
  );
}
