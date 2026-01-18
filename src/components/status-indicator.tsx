import type { TaskStatus } from '../../shared/types';

interface StatusIndicatorProps {
  status: TaskStatus;
  className?: string;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: 'bg-green-500',
  waiting: 'bg-yellow-500',
  completed: 'bg-neutral-500',
  errored: 'bg-red-500',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  errored: 'Errored',
};

export function StatusIndicator({ status, className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]} ${className}`}
      title={STATUS_LABELS[status]}
    />
  );
}
