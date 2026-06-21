import { Plus, Trash2 } from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import type { WorktreeFileCopyEntry } from '@shared/permission-types';


/**
 * Normalize an entry to a display-friendly [source, destination] tuple.
 */
function entryToTuple(entry: WorktreeFileCopyEntry): [string, string] {
  return Array.isArray(entry) ? entry : [entry, entry];
}

/**
 * Convert a [source, destination] tuple back to the storage format.
 * If source === destination, store as a plain string.
 */
function tupleToEntry(src: string, dest: string): WorktreeFileCopyEntry {
  return src === dest ? src : [src, dest];
}

export function ProjectWorktreeSettings({
  projectPath,
}: {
  projectPath: string;
}) {
  const [entries, setEntries] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const currentEntriesRef = useRef(entries);
  const savingEntriesRef = useRef(false);
  const pendingEntriesSaveRef = useRef<[string, string][] | null>(null);

  useEffect(() => {
    currentEntriesRef.current = entries;
  }, [entries]);

  // Load entries on mount
  useEffect(() => {
    let cancelled = false;
    startTransition(() => setLoading(true));
    api.worktreeConfig.getCopyEntries(projectPath).then((result) => {
      if (cancelled) return;
      setEntries(result.map(entryToTuple));
      setDirty(false);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const handleAdd = useCallback(() => {
    setEntries((prev) => [...prev, ['', '']]);
  }, []);

  const handleRemove = useCallback((index: number) => {
    setEntries((prev) => {
      const removedEntry = prev[index];
      if (removedEntry?.[0].trim() !== '') setDirty(true);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleChange = useCallback(
    (index: number, field: 'src' | 'dest', value: string) => {
      setEntries((prev) =>
        prev.map((entry, i) => {
          if (i !== index) return entry;
          return field === 'src' ? [value, entry[1]] : [entry[0], value];
        }),
      );
      setDirty(true);
    },
    [],
  );

  const saveEntries = useCallback(
    async (entriesToSave: [string, string][]) => {
      pendingEntriesSaveRef.current = entriesToSave;
      if (savingEntriesRef.current) return;

      savingEntriesRef.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        while (pendingEntriesSaveRef.current) {
          const nextEntries = pendingEntriesSaveRef.current;
          pendingEntriesSaveRef.current = null;
          const storageEntries: WorktreeFileCopyEntry[] = nextEntries
            .filter(([src]) => src.trim() !== '')
            .map(([src, dest]) =>
              tupleToEntry(src.trim(), dest.trim() || src.trim()),
            );

          const result = await api.worktreeConfig.setCopyEntries(
            projectPath,
            storageEntries,
          );

          const currentEntries = currentEntriesRef.current;
          const savedCurrentDraft =
            JSON.stringify(nextEntries) === JSON.stringify(currentEntries);
          if (
            savedCurrentDraft &&
            currentEntries.every(([src]) => src.trim() !== '')
          ) {
            setEntries(result.map(entryToTuple));
          }
          if (savedCurrentDraft) setDirty(false);
        }
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : 'Failed to save worktree settings',
        );
      } finally {
        savingEntriesRef.current = false;
        setSaving(false);
      }
    },
    [projectPath],
  );

  useEffect(() => {
    if (!dirty || loading) return;

    const saveTimeout = window.setTimeout(async () => {
      await saveEntries(entries);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [dirty, entries, loading, saveEntries]);

  if (loading) {
    return (
      <div className="text-ink-3 text-sm">Loading worktree settings...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Worktree</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Configure files to copy from the project into new worktrees. Useful
          for environment files, local databases, or other untracked files that
          agents need.
        </p>
      </div>

      <div>
        <h3 className="text-ink-1 mb-2 text-sm font-medium">
          Files to copy on worktree creation
        </h3>
        <div className="space-y-2">
          {entries.map(([src, dest], index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                size="sm"
                value={src}
                onChange={(e) => handleChange(index, 'src', e.target.value)}
                placeholder="Source path (e.g. .env)"
                className="min-w-0 flex-1"
              />
              <span className="text-ink-3 shrink-0 text-xs">&rarr;</span>
              <Input
                size="sm"
                value={dest}
                onChange={(e) => handleChange(index, 'dest', e.target.value)}
                placeholder="Destination (same if empty)"
                className="min-w-0 flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(index)}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              />
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          icon={<Plus className="h-3.5 w-3.5" />}
          className="mt-2"
        >
          Add file
        </Button>
      </div>

      {(dirty || saving) && (
        <div className="text-ink-3 text-xs">
          {saving ? 'Saving...' : 'Changes save automatically'}
        </div>
      )}
      {saveError && <div className="text-status-fail text-xs">{saveError}</div>}
    </div>
  );
}
