import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  Circle,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { useSteps } from '@/hooks/use-steps';
import { useTaskState } from '@/stores/navigation';
import type { TaskStep, TaskStepStatus } from '@shared/types';

const NODE_HEIGHT = 22;
const MIN_NODE_WIDTH = 64;
const MAX_NODE_WIDTH = 220;
const INTER_NODE_GAP = 20;
const ROW_GAP = 4;
const GRAPH_PADDING = 6;

const STEP_X_RANGE_FALLBACK = 88;

function getStepNodeWidth({ step, index }: { step: TaskStep; index: number }) {
  const estimatedCharWidth = 5.3;
  const baseWidth =
    30 +
    String(index + 1).length * estimatedCharWidth +
    step.name.length * estimatedCharWidth;
  return Math.max(
    MIN_NODE_WIDTH,
    Math.min(MAX_NODE_WIDTH, Math.ceil(baseWidth)),
  );
}

function compareStepOrder(a: TaskStep, b: TaskStep) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

function buildStepGraphLayout(steps: TaskStep[]) {
  const sortedSteps = [...steps].sort(compareStepOrder);
  const byId = new Map(sortedSteps.map((step) => [step.id, step]));
  const nodeWidthById = new Map<string, number>();
  sortedSteps.forEach((step, index) => {
    nodeWidthById.set(step.id, getStepNodeWidth({ step, index }));
  });

  const depsById = new Map<string, string[]>();
  const childrenById = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const step of sortedSteps) {
    const validDeps = step.dependsOn.filter((depId) => byId.has(depId));
    depsById.set(step.id, validDeps);
    indegree.set(step.id, validDeps.length);
    childrenById.set(step.id, []);
  }

  for (const step of sortedSteps) {
    const deps = depsById.get(step.id) ?? [];
    for (const depId of deps) {
      const childList = childrenById.get(depId);
      if (!childList) continue;
      childList.push(step.id);
    }
  }

  const queue = sortedSteps
    .filter((step) => (indegree.get(step.id) ?? 0) === 0)
    .map((step) => step.id);

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const stepId = queue.shift();
    if (!stepId) continue;
    topoOrder.push(stepId);

    const children = childrenById.get(stepId) ?? [];
    for (const childId of children) {
      const nextIndegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(childId);
      }
    }
  }

  const hasCycle = topoOrder.length !== sortedSteps.length;
  const fullOrder = hasCycle
    ? [
        ...topoOrder,
        ...sortedSteps
          .map((step) => step.id)
          .filter((id) => !topoOrder.includes(id)),
      ]
    : topoOrder;

  const laneById = new Map<string, number>();

  const createdSteps = [...sortedSteps].sort((a, b) => {
    const createdCmp = a.createdAt.localeCompare(b.createdAt);
    if (createdCmp !== 0) return createdCmp;
    return compareStepOrder(a, b);
  });

  const timestamps = createdSteps.map((step) => Date.parse(step.createdAt));
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const timeSpan = Math.max(1, maxTimestamp - minTimestamp);

  const xDomain = Math.max(
    STEP_X_RANGE_FALLBACK,
    (createdSteps.length - 1) * INTER_NODE_GAP,
  );

  const xById = new Map<string, number>();
  let previousRight = GRAPH_PADDING - INTER_NODE_GAP;
  for (const step of createdSteps) {
    const nodeWidth = nodeWidthById.get(step.id) ?? MIN_NODE_WIDTH;
    const timestamp = Date.parse(step.createdAt);
    const normalized = (timestamp - minTimestamp) / timeSpan;
    const timeBasedX = GRAPH_PADDING + normalized * xDomain;
    const x = Math.max(timeBasedX, previousRight + INTER_NODE_GAP);
    xById.set(step.id, x);
    previousRight = x + nodeWidth;
  }

  const previousCreatedIdById = new Map<string, string>();
  for (let i = 1; i < createdSteps.length; i += 1) {
    previousCreatedIdById.set(createdSteps[i].id, createdSteps[i - 1].id);
  }

  for (const stepId of fullOrder) {
    const depIds = depsById.get(stepId) ?? [];
    const depLanes = depIds
      .map((depId) => laneById.get(depId))
      .filter((lane): lane is number => typeof lane === 'number');

    if (depLanes.length > 0) {
      const avgLane =
        depLanes.reduce((sum, lane) => sum + lane, 0) / depLanes.length;
      laneById.set(stepId, Math.max(0, Math.round(avgLane)));
      continue;
    }

    const previousCreatedId = previousCreatedIdById.get(stepId);
    const previousLane = previousCreatedId
      ? (laneById.get(previousCreatedId) ?? 0)
      : 0;
    laneById.set(stepId, previousLane);
  }

  const maxLane = Math.max(0, ...Array.from(laneById.values()));
  const laneCount = maxLane + 1;

  const positions = new Map<string, { x: number; y: number }>();
  for (const step of sortedSteps) {
    const lane = laneById.get(step.id) ?? 0;
    const x = xById.get(step.id) ?? GRAPH_PADDING;
    positions.set(step.id, {
      x,
      y: GRAPH_PADDING + lane * (NODE_HEIGHT + ROW_GAP),
    });
  }

  const latestCreatedStep = createdSteps[createdSteps.length - 1];
  const latestCreatedPosition = latestCreatedStep
    ? positions.get(latestCreatedStep.id)
    : undefined;

  const edges: Array<{
    id: string;
    fromId: string;
    toId: string;
    fromStatus: TaskStepStatus;
    toStatus: TaskStepStatus;
    isDependency: boolean;
  }> = [];
  const edgeKeySet = new Set<string>();

  for (const step of sortedSteps) {
    const deps = depsById.get(step.id) ?? [];
    for (const depId of deps) {
      const depStep = byId.get(depId);
      if (!depStep) continue;
      const edgeKey = `${depId}->${step.id}`;
      edgeKeySet.add(edgeKey);
      edges.push({
        id: edgeKey,
        fromId: depId,
        toId: step.id,
        fromStatus: depStep.status,
        toStatus: step.status,
        isDependency: true,
      });
    }
  }

  for (let i = 1; i < createdSteps.length; i += 1) {
    const from = createdSteps[i - 1];
    const to = createdSteps[i];
    const edgeKey = `${from.id}->${to.id}`;
    if (edgeKeySet.has(edgeKey)) {
      continue;
    }

    edges.push({
      id: `timeline:${edgeKey}`,
      fromId: from.id,
      toId: to.id,
      fromStatus: from.status,
      toStatus: to.status,
      isDependency: false,
    });
  }

  return {
    sortedSteps,
    positions,
    nodeWidthById,
    edges,
    width: Math.max(
      GRAPH_PADDING * 2 + MIN_NODE_WIDTH,
      ...Array.from(positions.values(), (pos, idx) => {
        const step = sortedSteps[idx];
        const width = step
          ? (nodeWidthById.get(step.id) ?? MIN_NODE_WIDTH)
          : MIN_NODE_WIDTH;
        return pos.x + width + GRAPH_PADDING;
      }),
    ),
    height:
      GRAPH_PADDING * 2 +
      laneCount * NODE_HEIGHT +
      Math.max(0, laneCount - 1) * ROW_GAP,
    addButtonY:
      (latestCreatedPosition?.y ?? GRAPH_PADDING) + NODE_HEIGHT / 2 - 8,
    hasCycle,
  };
}

function getEdgeClass({
  fromStatus,
  toStatus,
}: {
  fromStatus: TaskStepStatus;
  toStatus: TaskStepStatus;
}) {
  if (toStatus === 'running') return 'stroke-acc';
  if (toStatus === 'completed') return 'stroke-status-done';
  if (toStatus === 'errored') return 'stroke-status-fail';
  if (toStatus === 'interrupted') return 'stroke-status-run';
  if (fromStatus === 'completed') return 'stroke-status-done/40';
  return 'stroke-line';
}

function getEdgeStrokeClass(isDependency: boolean) {
  return isDependency ? '' : '[stroke-dasharray:4_3] opacity-80';
}

/* ------------------------------------------------------------------ */
/*  Status icon (tiny, sits inside the chip)                           */
/* ------------------------------------------------------------------ */

function StatusIcon({ status }: { status: TaskStepStatus }) {
  const cls = 'h-2.5 w-2.5 shrink-0';

  switch (status) {
    case 'pending':
      return <Circle className={clsx(cls, 'text-ink-4')} strokeWidth={2} />;
    case 'ready':
      return (
        <Circle
          className={clsx(cls, 'text-ink-2')}
          fill="currentColor"
          strokeWidth={0}
        />
      );
    case 'running':
      return <Loader2 className={clsx(cls, 'text-acc-ink animate-spin')} />;
    case 'completed':
      return (
        <Check className={clsx(cls, 'text-status-done')} strokeWidth={3} />
      );
    case 'errored':
      return <X className={clsx(cls, 'text-status-fail')} strokeWidth={3} />;
    case 'interrupted':
      return (
        <AlertTriangle
          className={clsx(cls, 'text-status-run')}
          strokeWidth={2.5}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Step type icon (overrides status icon for special step types)       */
/* ------------------------------------------------------------------ */

function StepTypeIcon({ step }: { step: TaskStep }) {
  if (step.type === 'review') {
    const cls = 'h-2.5 w-2.5 shrink-0';
    if (step.status === 'running') {
      return <Search className={clsx(cls, 'text-acc-ink animate-pulse')} />;
    }
    if (step.status === 'completed') {
      return <Search className={clsx(cls, 'text-status-done')} />;
    }
    if (step.status === 'errored') {
      return <Search className={clsx(cls, 'text-status-fail')} />;
    }
    return <Search className={clsx(cls, 'text-ink-2')} />;
  }
  return <StatusIcon status={step.status} />;
}

/* ------------------------------------------------------------------ */
/*  Chip styles per status                                             */
/* ------------------------------------------------------------------ */

const CHIP_STYLES: Record<TaskStepStatus, string> = {
  pending: 'border border-line-soft bg-bg-0 text-ink-3 cursor-default',
  ready:
    'border border-glass-border bg-glass-light text-ink-1 cursor-pointer hover:bg-glass-medium hover:border-glass-border-strong',
  running: 'step-chip-running text-acc-ink cursor-pointer',
  completed:
    'border border-status-done/30 bg-status-done-soft text-status-done cursor-pointer hover:bg-status-done/15 shadow-[inset_0_1px_0_0_oklch(0.78_0.16_155_/_0.06)]',
  errored:
    'border border-status-fail/30 bg-status-fail-soft text-status-fail cursor-pointer hover:bg-status-fail/15',
  interrupted:
    'border border-status-run/30 bg-status-run-soft text-status-run cursor-pointer hover:bg-status-run/15',
};

/* ------------------------------------------------------------------ */
/*  Step chip                                                          */
/* ------------------------------------------------------------------ */

function StepChip({
  step,
  index,
  isActive,
  onClick,
  onAddAfter,
}: {
  step: TaskStep;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onAddAfter?: (stepId: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [isActive]);

  return (
    <div className="group/step relative flex h-full w-full items-center">
      <Button
        ref={ref}
        variant="unstyled"
        onClick={onClick}
        disabled={step.status === 'pending'}
        className={clsx(
          'h-full w-full gap-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none transition-all duration-300 ease-out',
          CHIP_STYLES[step.status],
          isActive &&
            'ring-acc/70 ring-offset-bg-0 shadow-[0_0_10px_0_oklch(0.72_0.20_295_/_0.3),0_0_3px_0_oklch(0.72_0.20_295_/_0.2)] ring-[1.5px] ring-offset-[1.5px] brightness-125',
        )}
      >
        <StepTypeIcon step={step} />
        <span className="flex min-w-0 items-center gap-0.5">
          <span className="text-[9px] opacity-40">{index + 1}</span>
          <span className="min-w-0 truncate">{step.name}</span>
        </span>
      </Button>
      {onAddAfter && (
        <Button
          variant="unstyled"
          onClick={(event) => {
            event.stopPropagation();
            onAddAfter(step.id);
          }}
          className="border-line bg-bg-1 text-ink-2 hover:border-glass-border-strong hover:text-ink-1 absolute top-1/2 -right-1.5 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border p-0 opacity-0 transition-all group-hover/step:opacity-100 focus-visible:opacity-100"
          title="Add step after this step"
        >
          <Plus className="h-2 w-2" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bar                                                                */
/* ------------------------------------------------------------------ */

export function StepFlowBar({
  taskId,
  onAddStepAtEnd,
  onAddStepAfter,
}: {
  taskId: string;
  onAddStepAtEnd?: () => void;
  onAddStepAfter?: (afterStepId: string) => void;
}) {
  const { data: steps } = useSteps(taskId);
  const { activeStepId, setActiveStepId } = useTaskState(taskId);
  const layout = useMemo(() => buildStepGraphLayout(steps ?? []), [steps]);

  const handleStepClick = useCallback(
    (stepId: string) => setActiveStepId(stepId),
    [setActiveStepId],
  );

  useCommands('step-flow-bar', [
    !!onAddStepAtEnd && {
      label: 'Add Step',
      shortcut: 'cmd+shift+n',
      section: 'Task',
      handler: () => {
        onAddStepAtEnd();
      },
    },
  ]);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="relative px-4 py-px backdrop-blur-sm">
      <div className="no-scrollbar flex items-center overflow-x-auto px-1 py-0.5">
        <div
          className="relative"
          style={{
            width: layout.width + (onAddStepAtEnd ? 44 : 0),
            height: layout.height,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            fill="none"
          >
            {layout.edges.map((edge) => {
              const fromPos = layout.positions.get(edge.fromId);
              const toPos = layout.positions.get(edge.toId);
              if (!fromPos || !toPos) return null;
              const fromWidth =
                layout.nodeWidthById.get(edge.fromId) ?? MIN_NODE_WIDTH;
              const startX = fromPos.x + fromWidth;
              const startY = fromPos.y + NODE_HEIGHT / 2;
              const endX = toPos.x;
              const endY = toPos.y + NODE_HEIGHT / 2;
              const horizontalGap = Math.max(4, endX - startX);
              const jogX = startX + Math.min(6, horizontalGap * 0.5);

              const d =
                Math.abs(endY - startY) < 1
                  ? `M ${startX} ${startY} L ${endX} ${endY}`
                  : `M ${startX} ${startY} L ${jogX} ${startY} L ${jogX} ${endY} L ${endX} ${endY}`;

              return (
                <path
                  key={edge.id}
                  d={d}
                  className={clsx(
                    'fill-none stroke-[1.5] transition-colors',
                    getEdgeClass(edge),
                    getEdgeStrokeClass(edge.isDependency),
                  )}
                />
              );
            })}
          </svg>

          {layout.sortedSteps.map((step, index) => {
            const pos = layout.positions.get(step.id);
            if (!pos) return null;

            return (
              <div
                key={step.id}
                className="absolute"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: layout.nodeWidthById.get(step.id) ?? MIN_NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
              >
                <StepChip
                  step={step}
                  index={index}
                  isActive={activeStepId === step.id}
                  onClick={() => handleStepClick(step.id)}
                  onAddAfter={onAddStepAfter}
                />
              </div>
            );
          })}

          {onAddStepAtEnd && (
            <div
              className="absolute"
              style={{
                left: layout.width,
                top: layout.addButtonY,
              }}
            >
              <Button
                variant="unstyled"
                onClick={onAddStepAtEnd}
                title="Add step at end (⌘⇧N)"
                className="border-line/60 text-ink-4 hover:border-glass-border-strong hover:text-ink-2 h-4 shrink-0 gap-1 rounded-md border border-dashed px-1 transition-colors"
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}

          {layout.hasCycle && (
            <div className="border-status-run/30 bg-status-run-soft text-status-run absolute top-0 right-0 rounded border px-2 py-1 text-[10px]">
              Dependency cycle detected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
