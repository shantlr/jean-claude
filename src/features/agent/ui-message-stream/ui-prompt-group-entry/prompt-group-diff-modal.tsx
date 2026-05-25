import { Check, Copy, File, FileText } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Modal } from '@/common/ui/modal';
import { DiffView } from '@/features/agent/ui-diff-view';
import { parseUnifiedPatchToStrings } from '@/features/agent/ui-diff-view/diff-utils';
import { DiffFileTree } from '@/features/common/ui-file-diff/file-tree';
import type {
  DiffFile,
  DiffFileStatus,
} from '@/features/common/ui-file-diff/types';
import type {
  NormalizedEntry,
  ToolUseByName,
} from '@shared/normalized-message-v2';

import type { DisplayMessage } from '../message-merger';

interface FileChange {
  path: string;
  /** Display path (relative or full for external) */
  displayPath: string;
  status: DiffFileStatus;
  /** Whether this file is outside rootPath */
  external: boolean;
  /** Concatenated old strings (edit) or empty (write) */
  oldContent: string;
  /** Concatenated new strings (edit) or full content (write) */
  newContent: string;
  rawPatch?: string;
  hasStructuredDiff: boolean;
}

function relativizePath(
  filePath: string,
  rootPath: string | null | undefined,
): { displayPath: string; external: boolean } {
  if (!rootPath) return { displayPath: filePath, external: false };
  const normalized = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
  if (filePath.startsWith(normalized)) {
    return { displayPath: filePath.slice(normalized.length), external: false };
  }
  return { displayPath: filePath, external: true };
}

function extractFileChanges(
  childMessages: DisplayMessage[],
  rootPath: string | null | undefined,
): FileChange[] {
  const fileMap = new Map<
    string,
    {
      edits: Array<{ old: string; new: string }>;
      status: DiffFileStatus;
      rawPatches: string[];
      hasStructuredDiff: boolean;
    }
  >();

  function processEntries(entries: NormalizedEntry[]) {
    for (const entry of entries) {
      if (entry.type !== 'tool-use') continue;

      if (entry.name === 'edit') {
        const e = entry as ToolUseByName<'edit'>;
        const files = e.input.files ?? [
          {
            filePath: e.input.filePath,
            type: 'update' as const,
            before: e.input.oldString,
            after: e.input.newString,
          },
        ];
        for (const file of files) {
          const existing = fileMap.get(file.filePath);
          const status: DiffFileStatus =
            file.type === 'add'
              ? 'added'
              : file.type === 'delete'
                ? 'deleted'
                : 'modified';
          const hasStructuredDiff =
            file.before !== undefined || file.after !== undefined;
          const oldContent = file.before ?? '';
          const newContent = file.after ?? '';
          if (existing) {
            if (hasStructuredDiff) {
              existing.edits.push({ old: oldContent, new: newContent });
            }
            existing.status = status;
            if (file.patch) existing.rawPatches.push(file.patch);
            existing.hasStructuredDiff =
              existing.hasStructuredDiff || hasStructuredDiff;
          } else {
            fileMap.set(file.filePath, {
              edits: hasStructuredDiff
                ? [{ old: oldContent, new: newContent }]
                : [],
              status,
              rawPatches: file.patch ? [file.patch] : [],
              hasStructuredDiff,
            });
          }
        }
      } else if (entry.name === 'write') {
        const w = entry as ToolUseByName<'write'>;
        const files = w.input.files ?? [
          {
            filePath: w.input.filePath,
            type: 'add' as const,
            after: w.input.value,
          },
        ];
        for (const file of files) {
          const existing = fileMap.get(file.filePath);
          const status: DiffFileStatus =
            file.type === 'delete'
              ? 'deleted'
              : file.type === 'update'
                ? 'modified'
                : 'added';
          const hasStructuredDiff =
            file.before !== undefined || file.after !== undefined;
          const oldContent = file.before ?? '';
          const newContent = file.after ?? '';
          if (existing) {
            if (hasStructuredDiff) {
              existing.edits = [{ old: oldContent, new: newContent }];
            }
            existing.status = status;
            if (file.patch) existing.rawPatches.push(file.patch);
            existing.hasStructuredDiff =
              existing.hasStructuredDiff || hasStructuredDiff;
          } else {
            fileMap.set(file.filePath, {
              edits: hasStructuredDiff
                ? [{ old: oldContent, new: newContent }]
                : [],
              status,
              rawPatches: file.patch ? [file.patch] : [],
              hasStructuredDiff,
            });
          }
        }
      }
    }
  }

  for (const dm of childMessages) {
    if (dm.kind === 'entry') processEntries([dm.entry]);
    if (dm.kind === 'subagent') processEntries(dm.childEntries);
    if (dm.kind === 'skill') processEntries(dm.childEntries);
  }

  const changes: FileChange[] = [];
  for (const [path, data] of fileMap) {
    const separator = '\n⋯\n';
    const oldContent = data.edits.map((e) => e.old).join(separator);
    const newContent = data.edits.map((e) => e.new).join(separator);
    const rawPatch = data.rawPatches.join(`\n${separator}\n`);
    const { displayPath, external } = relativizePath(path, rootPath);
    changes.push({
      path,
      displayPath,
      status: data.status,
      external,
      oldContent,
      newContent,
      rawPatch: rawPatch || undefined,
      hasStructuredDiff: data.hasStructuredDiff,
    });
  }

  // Sort: project files first, then external; alphabetical within each group
  changes.sort((a, b) => {
    if (a.external !== b.external) return a.external ? 1 : -1;
    return a.displayPath.localeCompare(b.displayPath);
  });
  return changes;
}

export function PromptGroupDiffModal({
  isOpen,
  onClose,
  childMessages,
  rootPath,
}: {
  isOpen: boolean;
  onClose: () => void;
  childMessages: DisplayMessage[];
  rootPath?: string | null;
}) {
  const fileChanges = useMemo(
    () => extractFileChanges(childMessages, rootPath),
    [childMessages, rootPath],
  );

  const { projectFiles, externalFiles } = useMemo(() => {
    const project: FileChange[] = [];
    const external: FileChange[] = [];
    for (const fc of fileChanges) {
      if (fc.external) external.push(fc);
      else project.push(fc);
    }
    return { projectFiles: project, externalFiles: external };
  }, [fileChanges]);

  const projectDiffFiles: DiffFile[] = useMemo(
    () =>
      projectFiles.map((fc) => ({ path: fc.displayPath, status: fc.status })),
    [projectFiles],
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(
    () => fileChanges[0]?.path ?? null,
  );
  const [rawDiffOpen, setRawDiffOpen] = useState(false);
  const [rawDiffCopied, setRawDiffCopied] = useState(false);

  const selectedChange = useMemo(
    () => fileChanges.find((fc) => fc.path === selectedPath) ?? null,
    [fileChanges, selectedPath],
  );

  const selectedPatchDiff = useMemo(
    () =>
      selectedChange?.rawPatch
        ? parseUnifiedPatchToStrings(selectedChange.rawPatch)
        : null,
    [selectedChange?.rawPatch],
  );

  const handleSelectFile = (displayPath: string) => {
    // Find original path from displayPath
    const found = fileChanges.find((fc) => fc.displayPath === displayPath);
    if (found) setSelectedPath(found.path);
  };

  const handleCopyRawDiff = useCallback(async () => {
    if (!selectedChange?.rawPatch) return;
    await navigator.clipboard.writeText(selectedChange.rawPatch);
    setRawDiffCopied(true);
    window.setTimeout(() => setRawDiffCopied(false), 1200);
  }, [selectedChange?.rawPatch]);

  const selectedDisplayPath = selectedChange?.displayPath ?? null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Changes" size="xl">
        <div className="flex h-[70vh] min-h-0 gap-0">
          {/* File tree sidebar */}
          <div className="border-glass-border w-56 shrink-0 overflow-y-auto border-r">
            {/* Project files tree */}
            <DiffFileTree
              files={projectDiffFiles}
              selectedPath={selectedDisplayPath}
              onSelectFile={handleSelectFile}
            />

            {/* External files section */}
            {externalFiles.length > 0 && (
              <div className="mt-2 border-t border-white/[0.06] pt-2">
                <div className="text-ink-4 px-3 pb-1 font-mono text-[10px] tracking-wider uppercase">
                  External files
                </div>
                {externalFiles.map((fc) => (
                  <button
                    key={fc.path}
                    type="button"
                    onClick={() => setSelectedPath(fc.path)}
                    className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-sm transition-colors ${
                      selectedPath === fc.path
                        ? 'text-ink-0 bg-glass-medium'
                        : 'text-ink-1 hover:bg-glass-medium/50'
                    }`}
                  >
                    <File className="text-ink-3 h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate" title={fc.path}>
                      {fc.displayPath.split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Diff content */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selectedChange?.rawPatch && (
              <div className="border-glass-border flex shrink-0 items-center justify-between border-b px-3 py-2">
                <span className="text-ink-4 truncate font-mono text-[10px]">
                  Raw patch available for {selectedChange.displayPath}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRawDiffOpen(true)}
                    className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors"
                  >
                    <FileText className="h-3 w-3" aria-hidden />
                    Raw diff
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyRawDiff()}
                    className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors"
                  >
                    {rawDiffCopied ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden />
                    )}
                    {rawDiffCopied ? 'Copied' : 'Copy raw'}
                  </button>
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden">
              {selectedChange ? (
                selectedChange.hasStructuredDiff ? (
                  <DiffView
                    filePath={selectedChange.displayPath}
                    oldString={selectedChange.oldContent}
                    newString={selectedChange.newContent}
                    withMinimap
                  />
                ) : selectedPatchDiff ? (
                  <DiffView
                    filePath={selectedChange.displayPath}
                    oldString={selectedPatchDiff.oldString}
                    newString={selectedPatchDiff.newString}
                    withMinimap
                  />
                ) : selectedChange.rawPatch ? (
                  <div className="h-full overflow-auto p-4">
                    <pre className="text-ink-1 overflow-auto rounded bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap">
                      {selectedChange.rawPatch}
                    </pre>
                  </div>
                ) : (
                  <div className="text-ink-3 flex h-full items-center justify-center text-sm">
                    No structured diff available for this file
                  </div>
                )
              ) : (
                <div className="text-ink-3 flex h-full items-center justify-center text-sm">
                  Select a file to view changes
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={rawDiffOpen && !!selectedChange?.rawPatch}
        onClose={() => setRawDiffOpen(false)}
        title="Raw Diff"
        size="xl"
        contentClassName="min-h-0 p-0"
      >
        <div className="flex h-[70vh] min-h-0 flex-col">
          <div className="border-glass-border flex shrink-0 items-center justify-between border-b px-3 py-2">
            <span className="text-ink-3 truncate font-mono text-xs">
              {selectedChange?.displayPath}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyRawDiff()}
              className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors"
            >
              {rawDiffCopied ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : (
                <Copy className="h-3 w-3" aria-hidden />
              )}
              {rawDiffCopied ? 'Copied' : 'Copy raw'}
            </button>
          </div>
          <pre className="text-ink-1 min-h-0 flex-1 overflow-auto bg-black/40 p-4 font-mono text-xs leading-5 whitespace-pre-wrap">
            {selectedChange?.rawPatch}
          </pre>
        </div>
      </Modal>
    </>
  );
}
