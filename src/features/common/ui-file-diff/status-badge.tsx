import type { DiffFileStatus } from './types';

const statusConfig: Record<
  DiffFileStatus,
  { label: string; bg: string; text: string }
> = {
  added: { label: 'Added', bg: 'bg-green-500/20', text: 'text-green-400' },
  modified: {
    label: 'Modified',
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
  },
  deleted: { label: 'Deleted', bg: 'bg-red-500/20', text: 'text-red-400' },
  renamed: { label: 'Renamed', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
};

export function DiffStatusBadge({ status }: { status: DiffFileStatus }) {
  const { label, bg, text } = statusConfig[status];

  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {label}
    </span>
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
