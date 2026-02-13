import { ExternalLink, GitBranch, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export function WorktreeBranchMenu({
  branchName,
  onOpenInEditor,
  onDeleteWorktree,
}: {
  branchName: string;
  onOpenInEditor: () => void;
  onDeleteWorktree: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpenInEditor = useCallback(() => {
    setIsOpen(false);
    onOpenInEditor();
  }, [onOpenInEditor]);

  const handleDeleteWorktree = useCallback(() => {
    setIsOpen(false);
    onDeleteWorktree();
  }, [onDeleteWorktree]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
        title="Worktree branch actions"
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{branchName}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
          <button
            onClick={handleOpenInEditor}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Editor
          </button>
          <button
            onClick={handleDeleteWorktree}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-neutral-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Worktree
          </button>
        </div>
      )}
    </div>
  );
}
