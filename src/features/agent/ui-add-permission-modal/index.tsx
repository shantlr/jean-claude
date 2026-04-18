import { Shield } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Modal } from '@/common/ui/modal';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toasts';
import { parseCompoundCommand } from '@shared/shell-parse';

type PermissionScope = 'project' | 'worktree' | 'global';

export function AddPermissionModal({
  isOpen,
  onClose,
  command,
  taskId,
  hasWorktree,
}: {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  taskId: string;
  hasWorktree: boolean;
}) {
  const parsedCommands = useMemo(
    () => parseCompoundCommand(command),
    [command],
  );
  const addToast = useToastStore((s) => s.addToast);

  const [entries, setEntries] = useState(() =>
    parsedCommands.map((cmd) => ({ checked: true, value: cmd })),
  );
  const [scope, setScope] = useState<PermissionScope>('project');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset entries whenever the modal opens (handles same-command reopen)
  useEffect(() => {
    if (isOpen) {
      setEntries(parsedCommands.map((cmd) => ({ checked: true, value: cmd })));
      setScope('project');
      setIsSubmitting(false);
    }
  }, [isOpen, parsedCommands]);

  const handleToggle = useCallback((index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, checked: !e.checked } : e)),
    );
  }, []);

  const handleValueChange = useCallback((index: number, value: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, value } : e)),
    );
  }, []);

  const checkedCount = useMemo(
    () => entries.filter((e) => e.checked && e.value.trim()).length,
    [entries],
  );

  const handleSubmit = useCallback(async () => {
    const toAdd = entries.filter((e) => e.checked && e.value.trim());
    if (toAdd.length === 0) return;

    setIsSubmitting(true);
    try {
      const addFn =
        scope === 'global'
          ? api.tasks.allowGlobally
          : scope === 'worktree'
            ? api.tasks.allowForProjectWorktrees
            : api.tasks.allowForProject;

      await Promise.all(
        toAdd.map((entry) =>
          addFn(taskId, 'Bash', { command: entry.value.trim() }),
        ),
      );
      addToast({
        message: `Added ${toAdd.length} permission${toAdd.length !== 1 ? 's' : ''}`,
        type: 'success',
      });
      onClose();
    } catch (error) {
      console.error('Failed to add permissions:', error);
      addToast({
        message: 'Failed to add permissions',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [entries, scope, taskId, onClose, addToast]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add to Permissions"
      size="lg"
    >
      <div className="space-y-4">
        {/* Commands list */}
        <div>
          <label className="text-ink-2 mb-2 block text-xs font-medium">
            Commands
          </label>
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div key={index} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={entry.checked}
                  onChange={() => handleToggle(index)}
                  className="border-glass-border bg-glass-medium text-acc focus:ring-acc/30 mt-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded"
                />
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  className="border-glass-border bg-bg-0 text-ink-1 focus:border-acc-line focus:ring-acc/30 w-full rounded border px-2.5 py-1.5 font-mono text-xs focus:ring-1 focus:outline-none"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Scope selector */}
        <div>
          <label className="text-ink-2 mb-2 block text-xs font-medium">
            Scope
          </label>
          <div className="flex gap-4">
            <label className="text-ink-1 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="permission-scope"
                value="project"
                checked={scope === 'project'}
                onChange={() => setScope('project')}
                className="border-glass-border bg-glass-medium text-acc focus:ring-acc/30 h-3.5 w-3.5"
              />
              Project
            </label>
            {hasWorktree && (
              <label className="text-ink-1 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="permission-scope"
                  value="worktree"
                  checked={scope === 'worktree'}
                  onChange={() => setScope('worktree')}
                  className="border-glass-border bg-glass-medium text-acc focus:ring-acc/30 h-3.5 w-3.5"
                />
                Worktree
              </label>
            )}
            <label className="text-ink-1 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="permission-scope"
                value="global"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
                className="border-glass-border bg-glass-medium text-acc focus:ring-acc/30 h-3.5 w-3.5"
              />
              Global
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="border-glass-border flex items-center justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={checkedCount === 0 || isSubmitting}
            className="bg-acc hover:bg-acc flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            {isSubmitting
              ? 'Adding…'
              : `Add ${checkedCount} permission${checkedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
