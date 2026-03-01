import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  Circle,
  CircleDot,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { useCallback } from 'react';

import { useSteps } from '@/hooks/use-steps';
import { useTaskState } from '@/stores/navigation';
import type { TaskStep, TaskStepStatus } from '@shared/types';

const STATUS_STYLES: Record<TaskStepStatus, string> = {
  pending: 'bg-neutral-800 text-neutral-500 cursor-default',
  ready:
    'bg-neutral-700 text-neutral-200 hover:bg-neutral-600 cursor-pointer border border-neutral-500',
  running:
    'bg-blue-900/80 text-blue-200 hover:bg-blue-800 cursor-pointer border border-blue-500',
  completed:
    'bg-green-900/80 text-green-200 hover:bg-green-800 cursor-pointer border border-green-600',
  errored:
    'bg-red-900/80 text-red-200 hover:bg-red-800 cursor-pointer border border-red-500',
  interrupted:
    'bg-yellow-900/80 text-yellow-200 hover:bg-yellow-800 cursor-pointer border border-yellow-500',
};

function StatusIcon({ status }: { status: TaskStepStatus }) {
  const iconClass = 'h-3 w-3';

  switch (status) {
    case 'pending':
      return <Circle className={clsx(iconClass, 'text-neutral-600')} />;
    case 'ready':
      return <CircleDot className={clsx(iconClass, 'text-neutral-300')} />;
    case 'running':
      return (
        <Loader2 className={clsx(iconClass, 'animate-spin text-blue-300')} />
      );
    case 'completed':
      return <Check className={clsx(iconClass, 'text-green-300')} />;
    case 'errored':
      return <X className={clsx(iconClass, 'text-red-300')} />;
    case 'interrupted':
      return <AlertTriangle className={clsx(iconClass, 'text-yellow-300')} />;
  }
}

function StepPill({
  step,
  isActive,
  onClick,
}: {
  step: TaskStep;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={step.status === 'pending'}
      className={clsx(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        STATUS_STYLES[step.status],
        isActive &&
          'ring-2 ring-blue-400 ring-offset-1 ring-offset-neutral-900',
      )}
    >
      <StatusIcon status={step.status} />
      <span className="max-w-[120px] truncate">{step.name}</span>
    </button>
  );
}

function ConnectorLine() {
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-4 bg-neutral-600" />
      <div className="border-y-4 border-l-4 border-y-transparent border-l-neutral-600" />
    </div>
  );
}

export function StepFlowBar({
  taskId,
  onAddStep,
}: {
  taskId: string;
  onAddStep?: () => void;
}) {
  const { data: steps } = useSteps(taskId);
  const { activeStepId, setActiveStepId } = useTaskState(taskId);

  const handleStepClick = useCallback(
    (stepId: string) => setActiveStepId(stepId),
    [setActiveStepId],
  );

  if (!steps || steps.length === 0) return null;

  return (
    <div className="flex items-center gap-0 border-b border-neutral-800 bg-neutral-900/50 px-4 py-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          {index > 0 && <ConnectorLine />}
          <StepPill
            step={step}
            isActive={activeStepId === step.id}
            onClick={() => handleStepClick(step.id)}
          />
        </div>
      ))}
      {onAddStep && (
        <>
          <div className="ml-2" />
          <button
            onClick={onAddStep}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-neutral-600 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-300"
          >
            <Plus className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}
