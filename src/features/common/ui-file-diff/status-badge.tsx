import { Chip } from '@/common/ui/chip';

import type { DiffFileStatus } from './types';

const statusConfig: Record<
  DiffFileStatus,
  { label: string; color: 'green' | 'orange' | 'red' | 'yellow' }
> = {
  added: { label: 'Added', color: 'green' },
  modified: { label: 'Modified', color: 'orange' },
  deleted: { label: 'Deleted', color: 'red' },
  renamed: { label: 'Renamed', color: 'yellow' },
};

export function DiffStatusBadge({ status }: { status: DiffFileStatus }) {
  const { label, color } = statusConfig[status];

  return (
    <Chip size="sm" color={color}>
      {label}
    </Chip>
  );
}

// Compact indicator for file tree views
export function getStatusIndicator(status: DiffFileStatus) {
  switch (status) {
    case 'added':
      return { label: '+', color: 'text-green-400' };
    case 'deleted':
      return { label: '-', color: 'text-red-400' };
    case 'modified':
      return { label: 'M', color: 'text-orange-400' };
    case 'renamed':
      return { label: 'R', color: 'text-yellow-400' };
  }
}
