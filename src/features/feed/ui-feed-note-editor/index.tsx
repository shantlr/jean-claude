import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import {
  FormattingToolbar,
  FormattingToolbarController,
  type FormattingToolbarProps,
  getFormattingToolbarItems,
  useComponentsContext,
  useCreateBlockNote,
} from '@blocknote/react';
import { Highlighter, ListChecks, X } from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import type { KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';



import {
  useDeleteFeedNote,
  useFeedNoteById,
  useUpdateFeedNote,
} from '@/hooks/use-feed-notes';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';


import { useLatestRef } from '@/hooks/use-latest-ref';
const CHECKBOX_MARKER_PATTERN = /^\s*-\s+\[([ xX])\]\s*/;
const HIGHLIGHT_COLOR = 'oklch(0.72 0.2 295 / 0.16)';
const MAX_STORED_SCROLL_POSITIONS = 100;

class LruCache<Key, Value> {
  private items = new Map<Key, Value>();

  constructor(private readonly maxSize: number) {}

  get(key: Key) {
    const value = this.items.get(key);
    if (value === undefined) return undefined;

    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  set(key: Key, value: Value) {
    this.items.delete(key);
    this.items.set(key, value);

    if (this.items.size > this.maxSize) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) this.items.delete(oldestKey);
    }
  }

  delete(key: Key) {
    this.items.delete(key);
  }
}

const scrollPositionsByNoteId = new LruCache<string, number>(
  MAX_STORED_SCROLL_POSITIONS,
);

function saveFeedNoteScroll(noteId: string, container: HTMLDivElement) {
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );

  if (container.scrollTop === 0 && maxScrollTop === 0) {
    return;
  }

  scrollPositionsByNoteId.set(noteId, container.scrollTop);
}

function getCheckboxMarkdownState(content: unknown): boolean | null {
  const text = getFirstTextSegment(content);
  const match = text?.match(CHECKBOX_MARKER_PATTERN);
  if (!match) return null;
  return match[1].toLowerCase() === 'x';
}

function getFirstTextSegment(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
  }

  return null;
}

function hasInlineContent(content: unknown): boolean {
  return Array.isArray(content);
}

function stripCheckboxMarkdownMarker(content: unknown): unknown {
  if (typeof content === 'string') {
    return content.replace(CHECKBOX_MARKER_PATTERN, '');
  }
  if (!Array.isArray(content)) return content;

  let didStrip = false;
  return content.map((item) => {
    if (didStrip) return item;
    if (typeof item === 'string') {
      didStrip = true;
      return item.replace(CHECKBOX_MARKER_PATTERN, '');
    }
    if (!item || typeof item !== 'object') return item;

    const record = item as Record<string, unknown>;
    if (typeof record.text !== 'string') return item;

    didStrip = true;
    return {
      ...record,
      text: record.text.replace(CHECKBOX_MARKER_PATTERN, ''),
    };
  });
}

function FeedNoteFormattingToolbar({
  blockTypeSelectItems,
  onTurnSelectionIntoCheckboxes,
  onToggleHighlight,
}: FormattingToolbarProps & {
  onTurnSelectionIntoCheckboxes: () => void;
  onToggleHighlight: () => void;
}) {
  const Components = useComponentsContext();
  const ToolbarButton = Components?.FormattingToolbar.Button;

  return (
    <FormattingToolbar blockTypeSelectItems={blockTypeSelectItems}>
      {getFormattingToolbarItems(blockTypeSelectItems)}
      {ToolbarButton ? (
        <>
          <ToolbarButton
            label="Checklist"
            mainTooltip="Turn selected blocks into checkbox items"
            icon={<ListChecks />}
            onClick={onTurnSelectionIntoCheckboxes}
          />
          <ToolbarButton
            label="Highlight"
            mainTooltip="Toggle highlight"
            icon={<Highlighter />}
            onClick={onToggleHighlight}
          />
        </>
      ) : null}
    </FormattingToolbar>
  );
}

export function FeedNoteEditor({ noteId }: { noteId: string }) {
  const navigate = useNavigate();
  const { note, isLoading } = useFeedNoteById(noteId);
  const updateNote = useUpdateFeedNote();
  const deleteNote = useDeleteFeedNote();
  const editor = useCreateBlockNote({ tabBehavior: 'prefer-indent' });

  const [value, setValue] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const lastSavedRef = useRef('');
  const isDeletedRef = useRef(false);
  const isLoadingEditorRef = useRef(false);
  const isRestoringScrollRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Stable ref for mutate so cleanup effect doesn't re-fire every render
  const mutateRef = useLatestRef(updateNote.mutate);

  // Initialize value from note content
  useEffect(() => {
    if (note && !hasInitialized) {
      const content = note.noteContent ?? note.title;
      const blocks = JSON.parse(content) as Parameters<
        typeof editor.replaceBlocks
      >[1];

      isLoadingEditorRef.current = true;
      editor.replaceBlocks(editor.document, blocks);
      isLoadingEditorRef.current = false;
      startTransition(() => setValue(content));
      lastSavedRef.current = content;
      startTransition(() => setHasInitialized(true));
    }
  }, [editor, note, hasInitialized, noteId]);

  useEffect(() => {
    if (!hasInitialized) return;

    const scrollTop = scrollPositionsByNoteId.get(noteId);
    if (scrollTop === undefined) return;

    let frameId = 0;
    let attempts = 0;
    isRestoringScrollRef.current = true;

    const restoreScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) {
        isRestoringScrollRef.current = false;
        return;
      }

      const maxScrollTop = Math.max(
        0,
        container.scrollHeight - container.clientHeight,
      );
      container.scrollTop = Math.min(scrollTop, maxScrollTop);

      attempts += 1;
      if (container.scrollTop !== scrollTop && attempts < 20) {
        frameId = requestAnimationFrame(restoreScroll);
      } else {
        isRestoringScrollRef.current = false;
      }
    };

    frameId = requestAnimationFrame(restoreScroll);
    return () => {
      cancelAnimationFrame(frameId);
      isRestoringScrollRef.current = false;
    };
  }, [hasInitialized, noteId]);

  // Keep refs for unmount flush and auto-save
  const valueRef = useLatestRef(value);

  const noteIdRef = useLatestRef(noteId);

  // Auto-save via debounced value
  const debouncedValue = useDebouncedValue(value, 500);

  useEffect(() => {
    if (!hasInitialized || isDeletedRef.current) return;
    if (debouncedValue && debouncedValue !== lastSavedRef.current) {
      lastSavedRef.current = debouncedValue;
      mutateRef.current({
        id: noteIdRef.current,
        content: debouncedValue,
      });
    }
  }, [debouncedValue, hasInitialized, mutateRef, noteIdRef]);

  const flushPendingSave = useCallback(
    (scrollContainer: HTMLDivElement | null) => {
      if (isDeletedRef.current) return;

      if (scrollContainer) {
        saveFeedNoteScroll(noteIdRef.current, scrollContainer);
      }

      if (valueRef.current && valueRef.current !== lastSavedRef.current) {
        lastSavedRef.current = valueRef.current;
        mutateRef.current({
          id: noteIdRef.current,
          content: valueRef.current,
        });
      }
    },
    [mutateRef, noteIdRef, valueRef],
  );

  // Flush pending save on unmount only
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    return () => {
      flushPendingSave(scrollContainer);
    };
  }, [flushPendingSave]);

  const handleScroll = useCallback(() => {
    if (isRestoringScrollRef.current) return;
    if (!scrollContainerRef.current) return;
    saveFeedNoteScroll(noteId, scrollContainerRef.current);
  }, [noteId]);

  const handleEditorChange = useCallback(() => {
    if (isLoadingEditorRef.current) return;

    let didNormalize = false;
    editor.forEachBlock((block) => {
      const checked = getCheckboxMarkdownState(block.content);
      if (checked === null) return true;

      didNormalize = true;
      editor.updateBlock(block, {
        type: 'checkListItem',
        props: { checked },
        content: stripCheckboxMarkdownMarker(block.content),
      } as Parameters<typeof editor.updateBlock>[1]);
      return true;
    });

    if (didNormalize) return;

    setValue(JSON.stringify(editor.document));
  }, [editor]);

  const syncEditorValue = useCallback(() => {
    setValue(JSON.stringify(editor.document));
  }, [editor]);

  const handleTurnSelectionIntoCheckboxes = useCallback(() => {
    editor.focus();

    const selectedBlocks = editor.getSelection()?.blocks ?? [
      editor.getTextCursorPosition().block,
    ];
    const inlineBlocks = selectedBlocks.filter((block) =>
      hasInlineContent(block.content),
    );

    if (inlineBlocks.length === 0) return;

    editor.transact(() => {
      for (const block of inlineBlocks) {
        if (block.type === 'checkListItem') continue;

        editor.updateBlock(block, {
          type: 'checkListItem',
          props: { checked: false },
        } as Parameters<typeof editor.updateBlock>[1]);
      }
    });

    syncEditorValue();
  }, [editor, syncEditorValue]);

  const handleToggleHighlight = useCallback(() => {
    editor.focus();
    editor.toggleStyles({ backgroundColor: HIGHLIGHT_COLOR });
    syncEditorValue();
  }, [editor, syncEditorValue]);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleDelete = useCallback(() => {
    isDeletedRef.current = true;
    deleteNote.mutate(
      { id: noteId },
      {
        onSuccess: () => {
          scrollPositionsByNoteId.delete(noteId);
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

      <div
        ref={scrollContainerRef}
        className="feed-note-blocknote flex-1 overflow-y-auto px-2 py-3"
        onKeyDown={handleEditorKeyDown}
        onScroll={handleScroll}
      >
        <BlockNoteView
          editor={editor}
          theme="dark"
          onChange={handleEditorChange}
          formattingToolbar={false}
          className="h-full"
        >
          <FormattingToolbarController
            formattingToolbar={(props) => (
              <FeedNoteFormattingToolbar
                {...props}
                onTurnSelectionIntoCheckboxes={
                  handleTurnSelectionIntoCheckboxes
                }
                onToggleHighlight={handleToggleHighlight}
              />
            )}
          />
        </BlockNoteView>
      </div>
    </div>
  );
}
