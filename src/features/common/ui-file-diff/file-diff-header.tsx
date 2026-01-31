import clsx from 'clsx';

import { DiffStatusBadge } from './status-badge';
import type { DiffFile } from './types';

export function FileDiffHeader({
  file,
  className,
  commentCount,
}: {
  file: DiffFile;
  className?: string;
  commentCount?: number;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 overflow-hidden border-b border-neutral-700 bg-neutral-800/50 px-4 py-2',
        className,
      )}
    >
      <DiffStatusBadge status={file.status} />
      <div className="shrink overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm text-neutral-300">
        {file.path}
      </div>
      {file.status === 'renamed' && file.originalPath && (
        <span className="text-xs text-neutral-500">← {file.originalPath}</span>
      )}
      {commentCount !== undefined && commentCount > 0 && (
        <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-400">
          {commentCount} comment{commentCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
