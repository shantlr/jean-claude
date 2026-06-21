import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';



import {
  synthesizeFileCommentsPrompt,
  useComposerFileCommentActions,
  useComposerFileCommentCount,
  useComposerFileComments,
} from '@/stores/composer-file-comments';
import type { ComposerFileComment } from '@/stores/composer-file-comments';
import { useComposerFileExplorerState } from '@/stores/composer-file-explorer';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useNewTaskDraft } from '@/stores/new-task-draft';



export function ComposerCommentsChip({
  projectId,
  projectRoot,
}: {
  projectId: string;
  projectRoot: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const comments = useComposerFileComments(projectId);
  const commentCount = useComposerFileCommentCount(projectId);
  const { removeComment } = useComposerFileCommentActions(projectId);
  const { selectFile } = useComposerFileExplorerState(projectId);
  const { updateDraft } = useNewTaskDraft();

  const synthesizedParts = useMemo(
    () => synthesizeFileCommentsPrompt(comments, projectRoot),
    [comments, projectRoot],
  );
  const synthesizedPrompt = useMemo(() => {
    if (!synthesizedParts) return null;
    const textPart = synthesizedParts.find((p) => p.type === 'text');
    return textPart?.type === 'text' ? textPart.text : null;
  }, [synthesizedParts]);

  const position = useDropdownPosition({
    isOpen,
    triggerRef,
    side: 'bottom',
    align: 'left',
    autoAlign: true,
  });

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Close when all comments removed
  useEffect(() => {
    if (commentCount === 0) startTransition(() => setIsOpen(false));
  }, [commentCount]);

  // Group comments by file
  const byFile = useMemo(() => {
    const map = new Map<string, ComposerFileComment[]>();
    for (const c of comments) {
      const list = map.get(c.anchor.filePath) ?? [];
      list.push(c);
      map.set(c.anchor.filePath, list);
    }
    return map;
  }, [comments]);

  const handleCommentClick = useCallback(
    (comment: ComposerFileComment) => {
      // Open file explorer if not open
      updateDraft({ showFileExplorer: true });
      // Navigate to file
      selectFile(comment.anchor.filePath);
      setIsOpen(false);
    },
    [updateDraft, selectFile],
  );

  const relPath = useCallback(
    (filePath: string) =>
      filePath.startsWith(projectRoot)
        ? filePath.slice(projectRoot.length).replace(/^\//, '')
        : filePath,
    [projectRoot],
  );

  if (!synthesizedPrompt || commentCount === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bg-acc/10 text-acc-ink border-acc/20 inline-flex cursor-default items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="font-mono text-[10px]">&lt;comments&gt;</span>
        <span className="text-ink-3 text-[10px]">
          {commentCount} file {commentCount !== 1 ? 'comments' : 'comment'}
        </span>
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className="border-glass-border bg-bg-1 fixed z-50 flex max-h-[400px] w-[420px] flex-col overflow-hidden rounded-lg border shadow-xl"
            style={{
              top: position.actualSide === 'bottom' ? position.top : undefined,
              bottom:
                position.actualSide === 'top'
                  ? window.innerHeight - position.top
                  : undefined,
              left: position.actualAlign === 'left' ? position.left : undefined,
              right:
                position.actualAlign === 'right'
                  ? window.innerWidth - position.left
                  : undefined,
              maxWidth: position.maxWidth,
            }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <span className="text-ink-1 text-xs font-medium">
                File comments ({commentCount})
              </span>
              <button
                type="button"
                className="text-ink-3 hover:text-ink-1"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Comment list */}
            <div className="flex-1 overflow-y-auto px-1 pb-2">
              {[...byFile.entries()].map(([filePath, fileComments]) => (
                <div key={filePath}>
                  <div className="text-ink-3 truncate px-2 pt-1.5 pb-0.5 font-mono text-[10px]">
                    {relPath(filePath)}
                  </div>
                  {fileComments.map((comment) => {
                    const lineLabel = comment.anchor.lineEnd
                      ? `L${comment.anchor.lineStart}-${comment.anchor.lineEnd}`
                      : `L${comment.anchor.lineStart}`;
                    return (
                      <div
                        key={comment.id}
                        className="hover:bg-glass-medium/50 group flex items-start gap-2 rounded px-2 py-1"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-1.5 text-left"
                          onClick={() => handleCommentClick(comment)}
                        >
                          <span className="text-ink-4 shrink-0 font-mono text-[10px]">
                            {lineLabel}
                          </span>
                          <span className="text-ink-1 truncate text-xs">
                            {comment.body}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="text-ink-4 hover:text-ink-1 mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => removeComment(comment.id)}
                          aria-label="Remove comment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Prompt preview */}
            <div
              className="shrink-0 overflow-auto px-3 py-2"
              style={{
                maxHeight: 120,
                borderTop: '1px solid oklch(1 0 0 / 0.06)',
              }}
            >
              <pre className="text-ink-3 text-[10px] leading-[1.5] whitespace-pre-wrap">
                {synthesizedPrompt}
              </pre>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
