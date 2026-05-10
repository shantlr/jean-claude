import { File } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Modal } from '@/common/ui/modal';
import { DiffView } from '@/features/agent/ui-diff-view';
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
    { edits: Array<{ old: string; new: string }>; status: DiffFileStatus }
  >();

  function processEntries(entries: NormalizedEntry[]) {
    for (const entry of entries) {
      if (entry.type !== 'tool-use') continue;

      if (entry.name === 'edit') {
        const e = entry as ToolUseByName<'edit'>;
        const existing = fileMap.get(e.input.filePath);
        if (existing) {
          existing.edits.push({
            old: e.input.oldString,
            new: e.input.newString,
          });
        } else {
          fileMap.set(e.input.filePath, {
            edits: [{ old: e.input.oldString, new: e.input.newString }],
            status: 'modified',
          });
        }
      } else if (entry.name === 'write') {
        const w = entry as ToolUseByName<'write'>;
        const existing = fileMap.get(w.input.filePath);
        if (existing) {
          // Write after edit = full rewrite, keep status as modified
          existing.edits = [{ old: '', new: w.input.value }];
        } else {
          fileMap.set(w.input.filePath, {
            edits: [{ old: '', new: w.input.value }],
            status: 'added',
          });
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
    const { displayPath, external } = relativizePath(path, rootPath);
    changes.push({
      path,
      displayPath,
      status: data.status,
      external,
      oldContent,
      newContent,
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

  const selectedChange = useMemo(
    () => fileChanges.find((fc) => fc.path === selectedPath) ?? null,
    [fileChanges, selectedPath],
  );

  const handleSelectFile = (displayPath: string) => {
    // Find original path from displayPath
    const found = fileChanges.find((fc) => fc.displayPath === displayPath);
    if (found) setSelectedPath(found.path);
  };

  const selectedDisplayPath = selectedChange?.displayPath ?? null;

  return (
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
        <div className="min-w-0 flex-1 overflow-auto">
          {selectedChange ? (
            <DiffView
              filePath={selectedChange.displayPath}
              oldString={selectedChange.oldContent}
              newString={selectedChange.newContent}
            />
          ) : (
            <div className="text-ink-3 flex h-full items-center justify-center text-sm">
              Select a file to view changes
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
