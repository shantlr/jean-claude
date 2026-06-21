import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';



import {
  DiffFileTree,
  FileDiffContent,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import {
  useCommitChanges,
  useCommitFileContent,
} from '@/hooks/use-pull-requests';
import type { DiffFile } from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';



export function PrCommitDiffView({
  projectId,
  commitId,
  selectedFile,
  onSelectFile,
  bottomPadding = 0,
}: {
  projectId: string;
  commitId: string;
  selectedFile: string | null;
  onSelectFile: (filePath: string | null) => void;
  bottomPadding?: number;
}) {
  const { data: files = [], isLoading: isFilesLoading } = useCommitChanges(
    projectId,
    commitId,
  );

  const selectedFileData = files.find((f) => f.path === selectedFile);

  const { data: parentContent = '', isLoading: isParentLoading } =
    useCommitFileContent(projectId, commitId, selectedFile, 'parent');
  const { data: currentContent = '', isLoading: isCurrentLoading } =
    useCommitFileContent(projectId, commitId, selectedFile, 'current');

  const diffFiles: DiffFile[] = useMemo(
    () =>
      files.map((f) => ({
        path: f.path,
        status: normalizeAzureChangeType(f.changeType),
        originalPath: f.originalPath,
      })),
    [files],
  );

  const [fileTreeWidth, setFileTreeWidth] = useState(220);
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: fileTreeWidth,
    minWidth: 160,
    maxWidthFraction: 0.4,
    onWidthChange: setFileTreeWidth,
  });

  if (isFilesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        No changes in this commit
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx('flex h-full', isDragging && 'select-none')}
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      {/* File tree */}
      <div
        className="panel-edge-shadow-r relative flex shrink-0 flex-col"
        style={{ width: fileTreeWidth }}
      >
        <DiffFileTree
          files={diffFiles}
          selectedPath={selectedFile}
          onSelectFile={onSelectFile}
        />
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={clsx(
            'hover:bg-acc/50 absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors',
            isDragging && 'bg-acc/50',
          )}
        />
      </div>

      {/* Diff view */}
      <div className="min-w-0 flex-1 overflow-hidden">
        {selectedFile && selectedFileData ? (
          <FileDiffContent
            file={{
              path: selectedFileData.path,
              status: normalizeAzureChangeType(selectedFileData.changeType),
              originalPath: selectedFileData.originalPath,
            }}
            oldContent={parentContent}
            newContent={currentContent}
            isLoading={isParentLoading || isCurrentLoading}
            headerClassName="h-[40px] shrink-0"
          />
        ) : (
          <div className="text-ink-3 flex h-full items-center justify-center">
            Select a file to view changes
          </div>
        )}
      </div>
    </div>
  );
}
