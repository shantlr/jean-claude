import clsx from 'clsx';
import { MessageCircle } from 'lucide-react';

import { DiffStatusBadge } from './status-badge';
import type { DiffFile } from './types';

export function FileDiffHeader({
  file,
  className,
  commentCount,
  hasAnnotations,
}: {
  file: DiffFile;
  className?: string;
  commentCount?: number;
  hasAnnotations?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 overflow-hidden border-b border-neutral-700 bg-neutral-800/50 px-4 py-2',
        className,
      )}
    >
      <DiffStatusBadge status={file.status} />
      <div className="shrink overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-neutral-300">
        {file.path}
      </div>
      {file.status === 'renamed' && file.originalPath && (
        <span className="text-xs text-neutral-500">← {file.originalPath}</span>
      )}
      {hasAnnotations && (
        <span
          className="flex items-center gap-1 text-amber-400/70"
          title="Has AI annotations"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      {commentCount !== undefined && commentCount > 0 && (
        <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-400">
          {commentCount} comment{commentCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
