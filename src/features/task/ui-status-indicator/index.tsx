import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { ComponentProps, MouseEvent } from 'react';

import type { TaskStatus } from '@shared/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: 'bg-blue-500 animate-pulse',
  waiting: 'bg-yellow-500',
  completed: 'bg-neutral-500',
  errored: 'bg-red-500',
  interrupted: 'bg-orange-500',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  errored: 'Errored',
  interrupted: 'Interrupted',
};

export function StatusIndicator({
  status,
  ...props
}: {
  status: TaskStatus;
} & ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        `inline-block h-2 w-2 rounded-full`,
        STATUS_COLORS[status],
        props.className,
      )}
      title={STATUS_LABELS[status]}
    />
  );
}

export const ToggleableStatusIndicator = ({
  status,
  isChecked,
  onClick,
}: {
  status: TaskStatus;
  isChecked: boolean;
  onClick: (event: MouseEvent) => void;
}) => {
  const disabled = status === 'running' || status === 'waiting';
  return (
    <button
      disabled={disabled}
      className={clsx(
        'flex h-4 w-3 items-center justify-center',
        'group/status-indicator',
        status === 'running' ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <CheckCircle2
        className={clsx('status-checked h-3 w-3 transition-all', {
          hidden: !isChecked && disabled,
          'group-[:not(:hover)]/status-indicator:hidden':
            !isChecked && !disabled,
          'text-green-500': isChecked,
          'group-hover/status-indicator:text-inherit': !disabled,
        })}
      />
      {!isChecked && (
        <StatusIndicator
          className={clsx('status-indicator', {
            'group-hover/status-indicator:hidden': !isChecked && !disabled,
          })}
          status={status}
        />
      )}
    </button>
  );
};
