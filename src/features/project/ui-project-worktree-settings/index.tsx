import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { api } from '@/lib/api';
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

  // Load entries on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.worktreeConfig.getCopyEntries(projectPath).then((result) => {
      if (cancelled) return;
      setEntries(result.map(entryToTuple));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const handleAdd = useCallback(() => {
    setEntries((prev) => [...prev, ['', '']]);
    setDirty(true);
  }, []);

  const handleRemove = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const storageEntries: WorktreeFileCopyEntry[] = entries
        .filter(([src]) => src.trim() !== '')
        .map(([src, dest]) =>
          tupleToEntry(src.trim(), dest.trim() || src.trim()),
        );
      const result = await api.worktreeConfig.setCopyEntries(
        projectPath,
        storageEntries,
      );
      setEntries(result.map(entryToTuple));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [entries, projectPath]);

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

      {dirty && (
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
          className="w-full"
        >
          {saving ? 'Saving...' : 'Save Worktree Settings'}
        </Button>
      )}
    </div>
  );
}
