import { FilePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLatestRef } from '@/hooks/use-latest-ref';



export function FileEditorDialog({
  onSave,
  onClose,
}: {
  onSave: (filename: string, content: string) => void;
  onClose: () => void;
}) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const filenameRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    filenameRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    const trimmedFilename = filename.trim();
    if (!trimmedFilename || !content) return;
    onSave(trimmedFilename, content);
  }, [filename, content, onSave]);

  const onCloseRef = useLatestRef(onClose);
  const handleSaveRef = useLatestRef(handleSave);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  return createPortal(
    <div
      className="bg-bg-0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border-glass-border flex w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-glass-border flex items-center gap-2 border-b px-4 py-3">
          <FilePlus className="text-ink-2 h-4 w-4" />
          <span className="text-ink-1 text-sm font-medium">Create file</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filename input */}
        <div className="border-glass-border border-b px-4 py-2">
          <input
            ref={filenameRef}
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="filename.ext"
            className="text-ink-1 placeholder-ink-3 w-full bg-transparent font-mono text-sm outline-none"
          />
        </div>

        {/* Content editor */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="File content..."
          className="text-ink-1 placeholder-ink-3 h-[300px] w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-relaxed outline-none"
        />

        {/* Footer */}
        <div className="border-glass-border flex items-center justify-end gap-2 border-t px-4 py-3">
          <span className="text-ink-3 mr-auto text-xs">
            {content.length > 0 && `${content.length} chars`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-2 hover:text-ink-1 rounded px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!filename.trim() || !content}
            className="bg-acc hover:bg-acc/90 disabled:bg-glass-medium disabled:text-ink-3 rounded px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed"
          >
            Attach file
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
