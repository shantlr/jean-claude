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
          'bg-bg-1/50 flex items-center gap-2 overflow-hidden px-4 py-2',
          className,
        )}
      >
        <DiffStatusBadge status={file.status} />
        <div className="text-ink-1 shrink overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap">
          {file.path}
        </div>
        {file.status === 'renamed' && file.originalPath && (
          <span className="text-ink-3 text-xs">← {file.originalPath}</span>
        )}
        {hasAnnotations && (
          <span
            className="text-status-run/70 flex items-center gap-1"
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
