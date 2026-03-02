import clsx from 'clsx';
import { AlertTriangle, Check, Circle, Loader2, Plus, X } from 'lucide-react';
import { Fragment, useCallback } from 'react';

import { Kbd } from '@/common/ui/kbd';
import { useSteps } from '@/hooks/use-steps';
import { useTaskState } from '@/stores/navigation';
import type { TaskStep, TaskStepStatus } from '@shared/types';

/* ------------------------------------------------------------------ */
/*  Status icon (tiny, sits inside the chip)                           */
/* ------------------------------------------------------------------ */

function StatusIcon({ status }: { status: TaskStepStatus }) {
  const cls = 'h-3 w-3 shrink-0';

  switch (status) {
    case 'pending':
      return (
        <Circle className={clsx(cls, 'text-neutral-600')} strokeWidth={2} />
      );
    case 'ready':
      return (
        <Circle
          className={clsx(cls, 'text-neutral-400')}
          fill="currentColor"
          strokeWidth={0}
        />
      );
    case 'running':
      return <Loader2 className={clsx(cls, 'animate-spin text-blue-400')} />;
    case 'completed':
      return (
        <Check className={clsx(cls, 'text-emerald-400')} strokeWidth={3} />
      );
    case 'errored':
      return <X className={clsx(cls, 'text-red-400')} strokeWidth={3} />;
    case 'interrupted':
      return (
        <AlertTriangle
          className={clsx(cls, 'text-yellow-400')}
          strokeWidth={2.5}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Chip styles per status                                             */
/* ------------------------------------------------------------------ */

const CHIP_STYLES: Record<TaskStepStatus, string> = {
  pending:
    'border border-neutral-800 bg-neutral-900 text-neutral-500 cursor-default',
  ready:
    'border border-neutral-700 bg-neutral-800/60 text-neutral-300 cursor-pointer hover:bg-neutral-800 hover:border-neutral-600',
  running: 'step-chip-running text-blue-200 cursor-pointer',
  completed:
    'border border-emerald-800/50 bg-emerald-950/40 text-emerald-300 cursor-pointer hover:bg-emerald-950/60 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.06)]',
  errored:
    'border border-red-800/50 bg-red-950/40 text-red-300 cursor-pointer hover:bg-red-950/60',
  interrupted:
    'border border-yellow-800/50 bg-yellow-950/40 text-yellow-300 cursor-pointer hover:bg-yellow-950/60',
};

/* ------------------------------------------------------------------ */
/*  Step chip                                                          */
/* ------------------------------------------------------------------ */

function StepChip({
  step,
  index,
  isActive,
  onClick,
}: {
  step: TaskStep;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={step.status === 'pending'}
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] leading-none font-medium transition-all duration-300 ease-out',
        CHIP_STYLES[step.status],
        isActive &&
          'shadow-[0_0_6px_0_rgba(59,130,246,0.15)] ring-1 ring-blue-500/40 ring-offset-1 ring-offset-neutral-900',
      )}
    >
      <StatusIcon status={step.status} />
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] opacity-40">{index + 1}</span>
        <span className="max-w-[120px] truncate">{step.name}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Connector                                                          */
/* ------------------------------------------------------------------ */

function Connector({
  fromStatus,
  toStatus,
}: {
  fromStatus: TaskStepStatus;
  toStatus: TaskStepStatus;
}) {
  // Running connector: animated blue/purple flow pulse
  if (toStatus === 'running') {
    return (
      <div className="mx-1 flex items-center">
        <div className="step-connector-running w-5 shrink-0 rounded-full" />
      </div>
    );
  }

  // Completed connector: emerald gradient fading left→right
  if (fromStatus === 'completed') {
    return (
      <div className="mx-1 flex items-center">
        <div className="h-[2px] w-5 shrink-0 rounded-full bg-gradient-to-r from-emerald-700/60 to-emerald-800/20 transition-colors duration-500" />
      </div>
    );
  }

  // Default connector: two segments with a dot midpoint
  return (
    <div className="mx-1 flex items-center gap-[3px]">
      <div className="h-[2px] w-[7px] shrink-0 rounded-full bg-neutral-700/40 transition-colors duration-500" />
      <div className="h-[3px] w-[3px] shrink-0 rounded-full bg-neutral-700/50" />
      <div className="h-[2px] w-[7px] shrink-0 rounded-full bg-neutral-700/40 transition-colors duration-500" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bar                                                                */
/* ------------------------------------------------------------------ */

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
    <div className="border-b border-white/[0.06] bg-neutral-900/60 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && (
              <Connector
                fromStatus={steps[index - 1].status}
                toStatus={step.status}
              />
            )}
            <StepChip
              step={step}
              index={index}
              isActive={activeStepId === step.id}
              onClick={() => handleStepClick(step.id)}
            />
          </Fragment>
        ))}

        {/* add step */}
        {onAddStep && (
          <>
            <div className="mx-1 flex items-center gap-[3px]">
              <div className="h-[2px] w-[5px] shrink-0 rounded-full bg-neutral-700/25" />
              <div className="h-[3px] w-[3px] shrink-0 rounded-full bg-neutral-700/35" />
            </div>
            <button
              onClick={onAddStep}
              className="flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-dashed border-neutral-700/60 px-1.5 text-neutral-600 transition-colors hover:border-neutral-500 hover:text-neutral-400"
            >
              <Plus className="h-3 w-3" />
              <Kbd shortcut="cmd+shift+n" className="text-[9px]" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
