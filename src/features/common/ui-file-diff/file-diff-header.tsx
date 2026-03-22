import clsx from 'clsx';
import { MessageCircle } from 'lucide-react';

import { Chip } from '@/common/ui/chip';
import { Separator } from '@/common/ui/separator';

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
    <>
      <div
        className={clsx(
          'flex items-center gap-2 overflow-hidden bg-neutral-800/50 px-4 py-2',
          className,
        )}
      >
        <DiffStatusBadge status={file.status} />
        <div className="shrink overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-neutral-300">
          {file.path}
        </div>
        {file.status === 'renamed' && file.originalPath && (
          <span className="text-xs text-neutral-500">
            ← {file.originalPath}
          </span>
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
          <Chip size="xs" color="blue" pill>
            {commentCount} comment{commentCount !== 1 ? 's' : ''}
          </Chip>
        )}
      </div>
      <Separator />
    </>
  );
}
