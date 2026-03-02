import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  useLegacySkillMigrationExecute,
  useLegacySkillMigrationPreview,
} from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type {
  LegacySkillMigrationExecuteResult,
  LegacySkillMigrationPreviewItem,
} from '@shared/skill-types';

function backendLabel(backendType: string): string {
  return backendType === 'claude-code' ? 'Claude Code' : 'OpenCode';
}

function StatusBadge({
  status,
}: {
  status: LegacySkillMigrationPreviewItem['status'];
}) {
  if (status === 'migrate') {
    return (
      <span className="rounded bg-green-900/30 px-2 py-0.5 text-[11px] text-green-400">
        Migrate
      </span>
    );
  }

  if (status === 'skip-conflict') {
    return (
      <span className="rounded bg-amber-900/30 px-2 py-0.5 text-[11px] text-amber-400">
        Skip conflict
      </span>
    );
  }

  return (
    <span className="rounded bg-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
      Skip invalid
    </span>
  );
}

export function LegacySkillMigrationDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const previewMutation = useLegacySkillMigrationPreview();
  const executeMutation = useLegacySkillMigrationExecute();
  const addToast = useToastStore((s) => s.addToast);
  const previewMutateAsync = previewMutation.mutateAsync;

  const [previewItems, setPreviewItems] = useState<
    LegacySkillMigrationPreviewItem[]
  >([]);
  const [result, setResult] =
    useState<LegacySkillMigrationExecuteResult | null>(null);

  useEffect(() => {
    previewMutateAsync()
      .then((data) => setPreviewItems(data.items))
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to preview legacy skills migration';
        addToast({ message, type: 'error' });
      });
  }, [addToast, previewMutateAsync]);

  const groupedItems = useMemo(() => {
    return {
      'claude-code': previewItems.filter(
        (item) => item.backendType === 'claude-code',
      ),
      opencode: previewItems.filter((item) => item.backendType === 'opencode'),
    } as const;
  }, [previewItems]);

  const counts = useMemo(() => {
    const migrate = previewItems.filter(
      (item) => item.status === 'migrate',
    ).length;
    const conflict = previewItems.filter(
      (item) => item.status === 'skip-conflict',
    ).length;
    const invalid = previewItems.filter(
      (item) => item.status === 'skip-invalid',
    ).length;
    return { migrate, conflict, invalid };
  }, [previewItems]);

  const migratableIds = useMemo(
    () =>
      previewItems
        .filter((item) => item.status === 'migrate')
        .map((item) => item.id),
    [previewItems],
  );

  const executeCounts = useMemo(() => {
    if (!result) return null;
    const migrated = result.results.filter(
      (r) => r.status === 'migrated',
    ).length;
    const skipped = result.results.filter((r) => r.status === 'skipped').length;
    const failed = result.results.filter((r) => r.status === 'failed').length;
    return { migrated, skipped, failed };
  }, [result]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleExecute = useCallback(async () => {
    try {
      const next = await executeMutation.mutateAsync({
        itemIds: migratableIds,
      });
      setResult(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to execute migration';
      addToast({ message, type: 'error' });
    }
  }, [executeMutation, migratableIds, addToast]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/55">
      <div className="flex h-[75svh] w-[78svw] max-w-[1100px] flex-col rounded-lg border border-neutral-700 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">
              Migrate Legacy Skills
            </h3>
            <p className="text-xs text-neutral-400">
              Move manually installed skills into Jean-Claude canonical storage.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {previewMutation.isPending && (
            <div className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800/40 p-3 text-sm text-neutral-300">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Preparing migration preview...
            </div>
          )}

          {!previewMutation.isPending && result && executeCounts && (
            <div className="space-y-3">
              <div className="rounded border border-neutral-700 bg-neutral-800/40 p-3 text-sm text-neutral-300">
                <div className="font-medium text-neutral-100">
                  Migration Results
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  Migrated: {executeCounts.migrated} · Skipped:{' '}
                  {executeCounts.skipped} · Failed: {executeCounts.failed}
                </div>
              </div>

              {result.results
                .filter((entry) => entry.status === 'failed')
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded border border-red-900/50 bg-red-950/30 p-3"
                  >
                    <div className="flex items-center gap-2 text-sm text-red-200">
                      <TriangleAlert className="h-4 w-4" />
                      {entry.name || entry.id}
                    </div>
                    <div className="mt-1 text-xs text-red-300">
                      {entry.reason}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {!previewMutation.isPending && !result && (
            <div className="space-y-4">
              <div className="rounded border border-neutral-700 bg-neutral-800/40 p-3 text-xs text-neutral-300">
                Ready: {counts.migrate} · Conflicts: {counts.conflict} ·
                Invalid: {counts.invalid}
              </div>

              {(['claude-code', 'opencode'] as const).map((backendType) => {
                const items = groupedItems[backendType];
                if (items.length === 0) return null;

                return (
                  <div key={backendType} className="space-y-2">
                    <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                      {backendLabel(backendType)}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded border border-neutral-700 bg-neutral-900/70 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-neutral-100">
                              {item.name}
                            </div>
                            <StatusBadge status={item.status} />
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {item.legacyPath}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            to {item.targetCanonicalPath}
                          </div>
                          {item.reason && (
                            <div className="mt-2 text-xs text-amber-300">
                              {item.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={migratableIds.length === 0 || executeMutation.isPending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Migrating...' : 'Confirm Migration'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
