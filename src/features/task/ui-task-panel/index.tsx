import {
  Bug,
  ExternalLink,
  FolderSymlink,
  FolderTree,
  GitBranch,
  GitCompare,
  GitFork,
  GitPullRequest,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import type { ComponentProps, PointerEvent, ReactNode } from 'react';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';



import {
  type AddStepPresetType,
  type ReviewMode,
  useDiffViewState,
  useNavigationStore,
  usePrViewState,
  useTaskFileExplorerState,
  useTaskState,
} from '@/stores/navigation';
import type {
  AgentBackendType,
  PromptImagePart,
  PromptPart,
} from '@shared/agent-backend-types';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
  getModelThinkingCapabilities,
} from '@/features/agent/ui-backend-selector';
import { DiffViewMode, useUIStore } from '@/stores/ui';
import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { formatModelName, getModelFromEntry } from '@/hooks/use-model';
import {
  getDefaultInteractionModeForBackend,
  type InteractionMode,
  type ModelPreference,
  type TaskStep,
  type ThinkingEffort,
} from '@shared/types';
import {
  getEditorLabel,
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  useEditorSetting,
  usePromptSnippetsSetting,
} from '@/hooks/use-settings';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import {
  type ReviewCommentParams,
  ReviewProvider,
} from '@/common/context/review-context';
import {
  reviewCommentToPill,
  ReviewPillsQueue,
} from '@/features/common/ui-review-pills';
import {
  type ReviewPresetId,
  synthesizeReviewPrompt,
  useReviewComments,
  useReviewCommentsStore,
} from '@/stores/review-comments';
import {
  useAddSessionAllowedTool,
  useAllowForProject,
  useAllowForProjectWorktrees,
  useAllowGlobally,
  useClearTaskUserCompleted,
  useCompleteTask,
  useDeleteTask,
  useDeleteWorktree,
  useRemoveSessionAllowedTool,
  useSetTaskMode,
  useTask,
  useToggleTaskUserCompleted,
  useUpdateTask,
} from '@/hooks/use-tasks';
import { useAgentControls, useAgentStream } from '@/hooks/use-agent';
import {
  useCreateStep,
  useStep,
  useSteps,
  useUpdateStep,
} from '@/hooks/use-steps';
import { useProject, useProjectIsGitRepository } from '@/hooks/use-projects';
import { AddPermissionModal } from '@/features/agent/ui-add-permission-modal';
import type { AgentResourceSample } from '@/hooks/use-agent-resource-snapshots';
import { api } from '@/lib/api';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { ContextUsageDisplay } from '@/features/agent/ui-context-usage-display';
import { FeatureMapSaveAction } from '@/features/task/ui-feature-map-save-action';
import { FilePreviewPane } from '@/features/agent/ui-file-preview-pane';
import { formatNumber } from '@/lib/number';
import { getBranchFromWorktreePath } from '@/lib/worktree';
import { getContextWindowForModel } from '@/lib/model-context-window';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { MessageInput } from '@/features/agent/ui-message-input';
import { MessageStream } from '@/features/agent/ui-message-stream';
import { Modal } from '@/common/ui/modal';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { ModeModelComboSelector } from '@/features/agent/ui-mode-model-combo';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import { PermissionBar } from '@/features/agent/ui-permission-bar';
import { PrBadge } from '@/features/agent/ui-pr-badge';
import { PrReviewValidation } from '@/features/task/ui-pr-review-validation';
import { QuestionOptions } from '@/features/agent/ui-question-options';
import { RunButton } from '@/features/agent/ui-run-button';
import { Separator } from '@/common/ui/separator';
import { SkillPublishAction } from '@/features/task/ui-skill-publish-action';
import type { SnippetVariableContext } from '@/lib/resolve-snippet-template';
import { StepFlowBar } from '@/features/task/ui-step-flow-bar';
import { TaskPrView } from '@/features/task/ui-task-pr-view';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useAgentResourceSnapshots } from '@/hooks/use-agent-resource-snapshots';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useCommands } from '@/common/hooks/use-commands';
import { useContextUsage } from '@/hooks/use-context-usage';
import { useModal } from '@/common/context/modal';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { useSkills } from '@/hooks/use-skills';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useTaskPrompt } from '@/stores/task-prompts';
import { useTaskRootPath } from '@/hooks/use-task-root-path';
import { useToastStore } from '@/stores/toasts';
import { useWorkItemById } from '@/hooks/use-work-items';
import { WorkItemChip } from '@/common/ui/work-item-chip';
import { WorkItemPicker } from '@/features/work-item/ui-work-item-picker';
import { WorktreeReviewView } from '@/features/agent/ui-worktree-review-view';



import { getTaskTitle, TaskNameEditor } from './task-name-editor';
import { AddStepDialog } from './add-step-dialog';
import { ChangeWorktreePathDialog } from './change-worktree-path-dialog';
import { CommandLogsPane } from './command-logs-pane';
import { CompleteTaskDialog } from './complete-task-dialog';
import { DebugMessagesPane } from './debug-messages-pane';
import { DeleteTaskDialog } from './delete-task-dialog';
import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';
import { TaskPendingNoteInput } from './task-pending-note-input';
import { TaskSettingsPane } from './task-settings-pane';
import { ToolDiffPreviewPane } from './tool-diff-preview-pane';



const LAST_ASSISTANT_MESSAGE_MAX_LENGTH = 1200;

type StepTokenSummary = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  displayTokens: number;
  totalTokens: number;
};

function getStepTokenSummary(entries: NormalizedEntry[]): StepTokenSummary {
  const summary: StepTokenSummary = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    displayTokens: 0,
    totalTokens: 0,
  };

  for (const entry of entries) {
    if (entry.type !== 'result' || !entry.usage) continue;

    summary.inputTokens += entry.usage.inputTokens;
    summary.outputTokens += entry.usage.outputTokens;
    summary.cacheReadTokens += entry.usage.cacheReadTokens ?? 0;
    summary.cacheCreationTokens += entry.usage.cacheCreationTokens ?? 0;
  }

  summary.displayTokens =
    summary.inputTokens + summary.outputTokens + summary.cacheCreationTokens;

  summary.totalTokens = summary.displayTokens + summary.cacheReadTokens;

  return summary;
}

function buildReviewChangesPrompt(): string {
  return [
    'Review the current task changes.',
    'Prioritize high-impact findings first, then list medium/low issues.',
    'When possible, reference concrete files and lines.',
  ].join('\n');
}

function buildContinuePromptTemplate({
  previousStepId,
  userPrompt,
}: {
  previousStepId: string;
  userPrompt: string;
}): string {
  return [
    'You are continuing work from the previous step.',
    'Use the summarized context from the previous step output before continuing.',
    '',
    'Previous step summary:',
    `{{summary(step.${previousStepId})}}`,
    '',
    'New instructions for this step:',
    userPrompt,
  ].join('\n');
}

function getReferenceStepForPreset({
  steps,
  activeStepId,
  preferredStepId,
}: {
  steps: TaskStep[];
  activeStepId: string | null;
  preferredStepId?: string | null;
}): TaskStep | null {
  if (steps.length === 0) return null;
  if (preferredStepId) {
    const preferredStep = steps.find((step) => step.id === preferredStepId);
    if (preferredStep) return preferredStep;
  }
  if (!activeStepId) return steps[steps.length - 1] ?? null;
  return (
    steps.find((step) => step.id === activeStepId) ??
    steps[steps.length - 1] ??
    null
  );
}

function getContinueReferenceStep({
  steps,
  activeStepId,
  preferredStepId,
}: {
  steps: TaskStep[];
  activeStepId: string | null;
  preferredStepId?: string | null;
}): TaskStep | null {
  function isUsableContinueSource(step: TaskStep | null | undefined): boolean {
    return Boolean(
      step &&
      (step.status === 'completed' ||
        step.status === 'interrupted' ||
        step.status === 'errored') &&
      (step.output !== null || step.sessionId !== null),
    );
  }

  const preferred = getReferenceStepForPreset({
    steps,
    activeStepId,
    preferredStepId,
  });

  if (isUsableContinueSource(preferred)) {
    return preferred;
  }

  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index];
    if (isUsableContinueSource(step)) {
      return step;
    }
  }

  return null;
}

function getInterruptedContinueStep({
  steps,
  activeStep,
}: {
  steps: TaskStep[];
  activeStep?: TaskStep | null;
}): TaskStep | null {
  if (activeStep?.status === 'interrupted') return activeStep;

  return steps.reduce<TaskStep | null>((latest, step) => {
    if (step.status !== 'interrupted') return latest;
    if (!latest || step.updatedAt > latest.updatedAt) return step;
    return latest;
  }, null);
}

function getLastAssistantMessage(messages: NormalizedEntry[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type !== 'assistant-message') {
      continue;
    }

    const trimmed = message.value.trim();
    if (!trimmed) {
      continue;
    }

    return trimmed.slice(-LAST_ASSISTANT_MESSAGE_MAX_LENGTH);
  }

  return '';
}

const EMPTY_QUEUED_PROMPTS: { content: string }[] = [];
const EMPTY_MESSAGES: NormalizedEntry[] = [];

function formatResourceBytes(bytes: number): string {
  const mb = bytes / 1_048_576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatResourceTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getResourceSparklinePath({
  values,
  width,
  height,
  minValue = Math.min(...values),
  maxValue = Math.max(...values),
}: {
  values: number[];
  width: number;
  height: number;
  minValue?: number;
  maxValue?: number;
}): string {
  if (values.length === 0) return '';

  return values
    .map((value, index) => {
      const point = getResourceSparklinePoint({
        value,
        index,
        count: values.length,
        width,
        height,
        minValue,
        maxValue,
      });
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(' ');
}

function getResourceSparklinePoint({
  value,
  index,
  count,
  width,
  height,
  minValue,
  maxValue,
}: {
  value: number;
  index: number;
  count: number;
  width: number;
  height: number;
  minValue: number;
  maxValue: number;
}): { x: number; y: number } {
  const range = maxValue - minValue;
  const normalized = range <= 0 ? 0.5 : (value - minValue) / range;
  const xStep = count > 1 ? width / (count - 1) : 0;
  return {
    x: index * xStep,
    y: height - Math.max(0, Math.min(1, normalized)) * height,
  };
}

function AgentResourceChartTooltip({
  label,
  sample,
  formatValue,
}: {
  label: string;
  sample: AgentResourceSample;
  formatValue: (value: number) => string;
}) {
  const value = label === 'CPU' ? sample.cpuPercent : sample.rssBytes;
  return (
    <div className="border-glass-border bg-bg-0/95 pointer-events-none absolute -top-1 right-1 z-10 rounded-md border px-2 py-1 text-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
      <div className="text-ink-0 font-mono tabular-nums">
        {formatValue(value)}
      </div>
      <div className="text-ink-4 mt-0.5 font-mono whitespace-nowrap">
        {formatResourceTime(sample.sampledAt)}
      </div>
    </div>
  );
}

function AgentResourceMicroSpark({
  accentClassName,
  values,
}: {
  accentClassName: string;
  values: number[];
}) {
  const width = 26;
  const height = 13;
  const path = getResourceSparklinePath({
    values: values.length > 0 ? values : [0],
    width,
    height,
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
        className={accentClassName}
        opacity="0.9"
      />
    </svg>
  );
}

function AgentResourceChart({
  label,
  value,
  samples,
  formatValue,
  maxValue,
  accentClassName,
}: {
  label: string;
  value: number;
  samples: AgentResourceSample[];
  formatValue: (value: number) => string;
  maxValue?: number;
  accentClassName: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 150;
  const height = 34;
  const values = samples.map((sample) =>
    label === 'CPU' ? sample.cpuPercent : sample.rssBytes,
  );
  const path = getResourceSparklinePath({
    values: values.length > 0 ? values : [value],
    width,
    height,
    minValue: maxValue === undefined ? undefined : 0,
    maxValue,
  });
  const hoverSample = hoverIndex === null ? null : samples[hoverIndex];
  const hoverValue = hoverIndex === null ? undefined : values[hoverIndex];
  const hoverPoint =
    hoverIndex === null || hoverValue === undefined
      ? null
      : getResourceSparklinePoint({
          value: hoverValue,
          index: hoverIndex,
          count: values.length,
          width,
          height,
          minValue: maxValue === undefined ? Math.min(...values) : 0,
          maxValue: maxValue ?? Math.max(...values),
        });
  const samplePoints = values.map((sampleValue, index) =>
    getResourceSparklinePoint({
      value: sampleValue,
      index,
      count: values.length,
      width,
      height,
      minValue: maxValue === undefined ? Math.min(...values) : 0,
      maxValue: maxValue ?? Math.max(...values),
    }),
  );
  const areaPath = path ? `${path} L ${width} ${height} L 0 ${height} Z` : '';

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (samples.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    setHoverIndex(Math.round(ratio * (samples.length - 1)));
  }

  return (
    <div className="relative">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-[2px] bg-current',
            accentClassName,
          )}
        />
        <span className="text-ink-2 text-[11px] font-medium">{label}</span>
        <span className="flex-1" />
        <span className="text-ink-0 font-mono text-[17px] font-semibold tracking-[-0.02em] tabular-nums">
          {formatValue(value)}
        </span>
      </div>
      <div className="bg-bg-0/45 overflow-hidden rounded-md">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block"
          aria-hidden
          onPointerLeave={() => setHoverIndex(null)}
          onPointerMove={handlePointerMove}
        >
          {areaPath ? (
            <path
              d={areaPath}
              fill="currentColor"
              className={clsx(accentClassName, 'opacity-20')}
            />
          ) : null}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            className={accentClassName}
          />
          {samplePoints.map((point, index) => (
            <circle
              key={`${samples[index]?.sampledAt ?? index}-${label}`}
              cx={point.x}
              cy={point.y}
              r="1.4"
              className={accentClassName}
              fill="currentColor"
              opacity="0.55"
            />
          ))}
          {hoverSample && hoverPoint ? (
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r="3"
              className={accentClassName}
              fill="currentColor"
            />
          ) : null}
        </svg>
      </div>
      <div className="text-ink-4 mt-1 flex justify-between font-mono text-[9.5px] tabular-nums">
        <span>60s</span>
        <span>
          peak{' '}
          {formatValue(Math.max(value, ...values, label === 'CPU' ? 0 : 1))}
        </span>
      </div>
      {hoverSample ? (
        <AgentResourceChartTooltip
          label={label}
          sample={hoverSample}
          formatValue={formatValue}
        />
      ) : null}
    </div>
  );
}

function AgentResourceHoverPanel({
  backendLabel,
  cpuSamples,
  displayCpu,
  displayRss,
  rootPid,
  rssMax,
  rssSamples,
}: {
  backendLabel: string;
  cpuSamples: AgentResourceSample[];
  rssSamples: AgentResourceSample[];
  displayCpu: number;
  displayRss: number;
  rootPid: number | null;
  rssMax: number;
}) {
  const [nowMs] = useState(() => Date.now());
  const firstSample = [...cpuSamples, ...rssSamples].sort((a, b) =>
    a.sampledAt.localeCompare(b.sampledAt),
  )[0];
  const historySeconds = firstSample
    ? Math.max(
        1,
        Math.round(
          (nowMs - new Date(firstSample.sampledAt).getTime()) / 1000,
        ),
      )
    : 0;

  return (
    <div className="border-glass-border bg-bg-1/95 w-[312px] rounded-xl border p-3.5 text-[11px] shadow-[0_24px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="border-ink-4 text-ink-3 flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border">
          <span className="bg-ink-3 h-1.5 w-1.5 rounded-[1px]" />
        </span>
        <div className="text-ink-0 text-xs font-semibold tracking-[-0.01em]">
          Agent Resources
        </div>
        <span className="flex-1" />
        <div className="text-ink-4 font-mono text-[10px] tabular-nums">
          {rootPid === null ? 'PID n/a' : `PID ${rootPid}`}
        </div>
      </div>
      <div className="space-y-2">
        <AgentResourceChart
          label="CPU"
          value={displayCpu}
          samples={cpuSamples}
          formatValue={(value) => `${value.toFixed(1)}%`}
          maxValue={Math.max(
            200,
            displayCpu,
            ...cpuSamples.map((sample) => sample.cpuPercent),
          )}
          accentClassName="text-[oklch(0.74_0.19_295)]"
        />
        <div className="bg-ink-4/15 h-px" />
        <AgentResourceChart
          label="Memory"
          value={displayRss}
          samples={rssSamples}
          formatValue={formatResourceBytes}
          maxValue={rssMax}
          accentClassName="text-[oklch(0.78_0.16_155)]"
        />
      </div>
      <div className="border-ink-4/15 mt-3 flex gap-4 border-t pt-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-4 text-[9.5px] tracking-[0.06em] uppercase">
            Window
          </span>
          <span className="text-ink-1 font-mono text-[11.5px]">
            {historySeconds}s
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-4 text-[9.5px] tracking-[0.06em] uppercase">
            Samples
          </span>
          <span className="text-ink-1 font-mono text-[11.5px]">
            {Math.max(cpuSamples.length, rssSamples.length)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-4 text-[9.5px] tracking-[0.06em] uppercase">
            Backend
          </span>
          <span className="text-ink-1 font-mono text-[11.5px]">
            {backendLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentResourceTooltip({
  ariaLabel,
  children,
  content,
  onActivate,
}: {
  ariaLabel?: string;
  children: ReactNode;
  content: ReactNode;
  onActivate?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const open = useCallback(() => {
    clearCloseTimer();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        left: Math.min(
          Math.max(rect.left + rect.width / 2 - 156, 8),
          Math.max(window.innerWidth - 320, 8),
        ),
        top: rect.bottom + 8,
      });
    }
    setIsOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 120);
  }, [clearCloseTimer]);

  const activate = useCallback(() => {
    if (!onActivate) return;
    setIsOpen(false);
    onActivate();
  }, [onActivate]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <>
      <div
        ref={triggerRef}
        aria-label={ariaLabel}
        role={onActivate ? 'button' : undefined}
        onFocus={open}
        onBlur={scheduleClose}
        onClick={activate}
        onKeyDown={(event) => {
          if (!onActivate) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        tabIndex={0}
      >
        {children}
      </div>
      {isOpen && position
        ? createPortal(
            <div
              className="fixed z-[10020]"
              onMouseEnter={open}
              onMouseLeave={scheduleClose}
              style={{ left: position.left, top: position.top }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function AgentResourcePill({
  backendLabel,
  isRunning,
  stepId,
}: {
  backendLabel: string;
  stepId: string;
  isRunning: boolean;
}) {
  const openOverlay = useOverlaysStore((state) => state.open);
  const { data, historyByStepId } = useAgentResourceSnapshots();
  const snapshot = data?.find((item) => item.stepId === stepId);
  const history = historyByStepId[stepId] ?? [];
  if (snapshot?.unsupportedReason || (!snapshot && history.length === 0)) {
    return null;
  }

  const lastSample = history[history.length - 1] ?? snapshot;
  const displayCpu = isRunning
    ? (snapshot?.cpuPercent ?? lastSample.cpuPercent)
    : 0;
  const displayRss = isRunning
    ? (snapshot?.rssBytes ?? lastSample.rssBytes)
    : 0;
  const stoppedSample =
    !isRunning && lastSample
      ? {
          ...lastSample,
          sampledAt: new Date().toISOString(),
          cpuPercent: 0,
          rssBytes: 0,
        }
      : null;
  const samples = stoppedSample ? [...history, stoppedSample] : history;
  const rootPid = snapshot?.rootPid ?? lastSample?.rootPid ?? null;
  const rssMax = Math.max(
    lastSample?.peakRssBytes ?? 0,
    ...samples.map((sample) => sample.rssBytes),
    1,
  );
  const cpuValues = samples.map((sample) => sample.cpuPercent);
  const rssValues = samples.map((sample) => sample.rssBytes);

  return (
    <AgentResourceTooltip
      ariaLabel="Open resource metrics"
      content={
        <AgentResourceHoverPanel
          backendLabel={backendLabel}
          cpuSamples={samples}
          displayCpu={displayCpu}
          displayRss={displayRss}
          rootPid={rootPid}
          rssMax={rssMax}
          rssSamples={samples}
        />
      }
      onActivate={() => openOverlay('resources')}
    >
      <div className="border-glass-border bg-bg-0/25 text-ink-1 hover:border-accent-1/40 hover:bg-bg-2 flex h-7 w-[196px] cursor-pointer items-center gap-1.5 rounded-[7px] border px-2 font-mono text-[11.5px] font-semibold tabular-nums transition-colors">
        <span
          className={clsx(
            'h-[5px] w-[5px] rounded-full',
            isRunning
              ? 'resource-status-pulse animate-pulse bg-[oklch(0.74_0.19_295)] shadow-[0_0_7px_oklch(0.74_0.19_295)]'
              : 'bg-ink-4/60',
          )}
        />
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <AgentResourceMicroSpark
            values={cpuValues}
            accentClassName="text-[oklch(0.74_0.19_295)]"
          />
          <span className="min-w-[42px] text-right">
            {displayCpu.toFixed(1)}%
          </span>
        </span>
        <span className="bg-ink-4/25 h-[13px] w-px" />
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <AgentResourceMicroSpark
            values={rssValues}
            accentClassName="text-[oklch(0.78_0.16_155)]"
          />
          <span className="min-w-[45px] text-right">
            {formatResourceBytes(displayRss).replace(' ', '')}
          </span>
        </span>
      </div>
    </AgentResourceTooltip>
  );
}

function useTaskMessageMeta(stepId: string | null) {
  return useTaskMessagesStore(
    useShallow((state) => {
      const step = stepId ? state.steps[stepId] : undefined;
      return {
        status: step?.status ?? 'waiting',
        error: step?.error ?? null,
        pendingPermission: step?.pendingPermission ?? null,
        pendingQuestion: step?.pendingQuestion ?? null,
        queuedPrompts: step?.queuedPrompts ?? EMPTY_QUEUED_PROMPTS,
        hasMessages: (step?.messages.length ?? 0) > 0,
        isLoading: !stepId || !step,
      };
    }),
  );
}

function getLastAssistantMessageForStep(stepId: string | null): string {
  if (!stepId) return '';
  const messages =
    useTaskMessagesStore.getState().steps[stepId]?.messages ?? [];
  return getLastAssistantMessage(messages);
}

function useStepModel(stepId: string | null): string | undefined {
  return useTaskMessagesStore((state) => {
    const messages = stepId ? state.steps[stepId]?.messages : undefined;
    if (!messages) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const model = getModelFromEntry(messages[i]);
      if (model) return model;
    }
    return undefined;
  });
}

function TaskHeaderWorkItemChip({
  providerId,
  workItemId,
  workItemUrl,
}: {
  providerId: string | null;
  workItemId: string;
  workItemUrl?: string;
}) {
  const numericWorkItemId = Number(workItemId);
  const { data: workItem } = useWorkItemById({
    providerId,
    workItemId: Number.isFinite(numericWorkItemId) ? numericWorkItemId : null,
  });

  return (
    <WorkItemChip
      label={`#${workItemId}`}
      type={workItem?.fields.workItemType}
      size="sm"
      onClick={
        workItemUrl ? () => window.open(workItemUrl, '_blank') : undefined
      }
      disabled={!workItemUrl}
      title={
        workItemUrl
          ? `Open work item #${workItemId} in browser`
          : `Work item #${workItemId}`
      }
    />
  );
}

export function TaskPanel({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const modal = useModal();
  const { data: task } = useTask(taskId);
  const projectId = task?.projectId;

  // Permission modal state — hoisted here so it survives MessageStream unmount/remount cycles
  const [permissionModal, setPermissionModal] = useState<{
    command: string;
  } | null>(null);
  const handleAddBashToPermissions = useCallback(
    (command: string) => setPermissionModal({ command }),
    [],
  );
  const closePermissionModal = useCallback(() => setPermissionModal(null), []);
  const { data: project } = useProject(projectId ?? '');
  const { data: projectIsGitRepository } = useProjectIsGitRepository(
    projectId ?? null,
  );
  const { data: editorSetting } = useEditorSetting();
  const deleteTask = useDeleteTask();
  const deleteWorktree = useDeleteWorktree();
  const updateTask = useUpdateTask();
  const setTaskMode = useSetTaskMode();
  const addSessionAllowedTool = useAddSessionAllowedTool();
  const removeSessionAllowedTool = useRemoveSessionAllowedTool();
  const allowForProject = useAllowForProject();
  const allowForProjectWorktrees = useAllowForProjectWorktrees();
  const allowGlobally = useAllowGlobally({
    onError: (error) => {
      addToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to add global permission',
      });
    },
  });
  const unloadStep = useTaskMessagesStore((state) => state.unloadStep);
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);
  const backgroundJobs = useBackgroundJobsStore((state) => state.jobs);

  // Navigation tracking
  const setLastLocation = useNavigationStore((s) => s.setLastLocation);
  const setLastTaskForProject = useNavigationStore(
    (s) => s.setLastTaskForProject,
  );
  const clearTaskNavHistoryState = useNavigationStore(
    (s) => s.clearTaskNavHistoryState,
  );

  // Task state from store (replaces useState for pane state)
  const {
    rightPane,
    activeStepId,
    setActiveStepId,
    openFilePreview,
    openToolDiffPreview,
    openCommandLogs,
    selectCommandLogsTab,
    openSettings,
    openDebugMessages,
    closeRightPane,
    toggleRightPane,
  } = useTaskState(taskId);

  // Steps data for auto-selection
  const { data: steps } = useSteps(taskId);
  const { data: activeStep } = useStep(activeStepId ?? '');
  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();
  const defaultAddStepBackend =
    activeStep?.agentBackend ??
    project?.defaultAgentBackend ??
    backendsSetting?.defaultBackend ??
    'claude-code';
  const defaultAddStepModel =
    activeStep?.modelPreference ??
    getDefaultModelForBackend({
      backend: defaultAddStepBackend,
      project,
      backendDefaultModels: backendDefaultModelsSetting,
    });
  const isSkillCreationTask = task?.type === 'skill-creation';

  // Diff view state
  const {
    isOpen: isDiffViewOpen,
    selectedFilePath: diffSelectedFile,
    collapsedFolders: diffCollapsedFolders,
    reviewMode,
    toggleDiffView,
    openDiffView,
    closeDiffView,
    selectFile: selectDiffFile,
    toggleCollapsedFolder: toggleDiffCollapsedFolder,
    setReviewMode,
  } = useDiffViewState(taskId);
  const hasGitReviewModes =
    !!task?.worktreePath || projectIsGitRepository === true;

  useEffect(() => {
    if (!hasGitReviewModes && reviewMode !== 'files') {
      setReviewMode('files');
    }
  }, [hasGitReviewModes, reviewMode, setReviewMode]);

  const toggleReviewFiles = useCallback(() => {
    if (isDiffViewOpen && reviewMode === 'files') {
      closeDiffView();
      return;
    }

    setReviewMode('files');
    openDiffView();
  }, [closeDiffView, isDiffViewOpen, openDiffView, reviewMode, setReviewMode]);

  // PR view state
  const {
    isOpen: isPrViewOpen,
    openPrView,
    togglePrView,
    closePrView,
  } = usePrViewState(taskId);

  // File explorer state for review view
  const { rootPath: taskRootPathForExplorer } = useTaskRootPath(taskId);
  const {
    selectedFilePath: explorerSelectedFile,
    expandedDirs: explorerExpandedDirs,
    selectFile: explorerSelectFile,
    toggleDir: explorerToggleDir,
    hideUnchanged: explorerHideUnchanged,
    toggleHideUnchanged: explorerToggleHideUnchanged,
  } = useTaskFileExplorerState(taskId);

  const agentMeta = useTaskMessageMeta(activeStepId);
  const model = useStepModel(activeStepId);
  const {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    queuePrompt,
    updateQueuedPrompt,
    cancelQueuedPrompt,
    isStarting,
    isStopping,
  } = useAgentControls({ taskId, stepId: activeStepId });

  const addToast = useToastStore((s) => s.addToast);
  const removeReviewComment = useReviewCommentsStore((s) => s.removeComment);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isChangeWorktreePathDialogOpen, setIsChangeWorktreePathDialogOpen] =
    useState(false);
  const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false);
  const [addStepAfterStepId, setAddStepAfterStepId] = useState<string | null>(
    null,
  );
  const [addStepAtEnd, setAddStepAtEnd] = useState(false);
  const [startingStepIds, setStartingStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [continuingInterruptedStepId, setContinuingInterruptedStepId] =
    useState<string | null>(null);
  const stepStartJobIdsRef = useRef<Map<string, string>>(new Map());
  const [showWorkItemsEditor, setShowWorkItemsEditor] = useState(false);
  const [workItemsFilter, setWorkItemsFilter] = useState('');
  // Buffered selection state for work items modal (applied on submit)
  const [draftWorkItemIds, setDraftWorkItemIds] = useState<string[]>([]);
  const [draftWorkItemUrls, setDraftWorkItemUrls] = useState<string[]>([]);

  const openWorkItemsEditor = useCallback(() => {
    setDraftWorkItemIds(task?.workItemIds ?? []);
    setDraftWorkItemUrls(task?.workItemUrls ?? []);
    setWorkItemsFilter('');
    setShowWorkItemsEditor(true);
  }, [task?.workItemIds, task?.workItemUrls]);

  const handleWorkItemToggle = useCallback((workItem: AzureDevOpsWorkItem) => {
    const wiId = workItem.id.toString();
    setDraftWorkItemIds((ids) => {
      if (ids.includes(wiId)) {
        const idx = ids.indexOf(wiId);
        setDraftWorkItemUrls((urls) => urls.filter((_, i) => i !== idx));
        return ids.filter((_, i) => i !== idx);
      }
      setDraftWorkItemUrls((urls) => [...urls, workItem.url]);
      return [...ids, wiId];
    });
  }, []);

  const handleClearWorkItems = useCallback(() => {
    setDraftWorkItemIds([]);
    setDraftWorkItemUrls([]);
  }, []);

  const handleSubmitWorkItems = useCallback(() => {
    updateTask.mutate({
      id: taskId,
      data: {
        workItemIds: draftWorkItemIds.length > 0 ? draftWorkItemIds : null,
        workItemUrls: draftWorkItemUrls.length > 0 ? draftWorkItemUrls : null,
      },
    });
    setShowWorkItemsEditor(false);
  }, [taskId, updateTask, draftWorkItemIds, draftWorkItemUrls]);

  useCommands('work-items-editor', [
    showWorkItemsEditor && {
      label: 'Save Work Items',
      shortcut: 'cmd+enter',
      hideInCommandPalette: true,
      handler: () => {
        handleSubmitWorkItems();
      },
    },
  ]);

  const createStep = useCreateStep();
  // Ref for the task panel container (used by shrink-to-target animation)
  const taskPanelRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<{ toggle: () => void } | null>(null);
  const runButtonRef = useRef<{ toggle: () => void } | null>(null);

  // Track floating footer height so scroll containers can add matching bottom padding
  const [footerHeight, setFooterHeight] = useState(0);
  const footerObserverRef = useRef<ResizeObserver | null>(null);
  const footerRef = useCallback((node: HTMLDivElement | null) => {
    footerObserverRef.current?.disconnect();
    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setFooterHeight(
            entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
          );
        }
      });
      observer.observe(node);
      footerObserverRef.current = observer;
    } else {
      setFooterHeight(0);
      footerObserverRef.current = null;
    }
  }, []);
  const { triggerAnimation } = useShrinkToTarget({
    panelRef: taskPanelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  // Track this location for navigation restoration
  useEffect(() => {
    if (pathname.startsWith('/all')) {
      setLastLocation({ type: 'all', taskId });
      return;
    }

    if (projectId) {
      setLastLocation({ type: 'project', projectId, taskId });
      setLastTaskForProject(projectId, taskId);
    }
  }, [pathname, projectId, taskId, setLastLocation, setLastTaskForProject]);

  // Reset work items editor when switching tasks
  useEffect(() => {
    startTransition(() => setShowWorkItemsEditor(false));
  }, [taskId]);

  // Notify backend this task is focused (dismisses completion notifications, etc.)
  useEffect(() => {
    api.tasks.focused(taskId);

    const handleFocus = () => api.tasks.focused(taskId);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [taskId]);

  // Auto-select an active step when none is selected
  useEffect(() => {
    if (!steps || steps.length === 0) return;
    // If the currently selected step still exists, keep it
    if (activeStepId && steps.some((s) => s.id === activeStepId)) return;

    // Priority: first running → first ready → last terminal → first step
    const running = steps.find((s) => s.status === 'running');
    if (running) {
      setActiveStepId(running.id);
      return;
    }
    const ready = steps.find((s) => s.status === 'ready');
    if (ready) {
      setActiveStepId(ready.id);
      return;
    }
    const terminalSteps = steps.filter(
      (s) =>
        s.status === 'completed' ||
        s.status === 'interrupted' ||
        s.status === 'errored',
    );
    if (terminalSteps.length > 0) {
      setActiveStepId(terminalSteps[terminalSteps.length - 1]!.id);
      return;
    }
    setActiveStepId(steps[0]!.id);
  }, [steps, activeStepId, setActiveStepId]);

  const handleCopySessionId = useCallback(async () => {
    if (activeStep?.sessionId) {
      await navigator.clipboard.writeText(activeStep.sessionId);
    }
  }, [activeStep]);

  const handleFilePathClick = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      openFilePreview(filePath, lineStart, lineEnd);
    },
    [openFilePreview],
  );

  const handleToolDiffClick = useCallback(
    (filePath: string, oldString: string, newString: string) => {
      openToolDiffPreview({ filePath, oldString, newString });
    },
    [openToolDiffPreview],
  );

  const handleStop = async () => {
    await stop();
  };

  const handleDeleteConfirm = useCallback(
    ({ deleteWorktree }: { deleteWorktree: boolean }) => {
      if (!task || !project) return;

      const jobId = addRunningJob({
        type: 'task-deletion',
        title: `Deleting "${task.name ?? task.prompt.slice(0, 40)}"`,
        taskId,
        projectId: task.projectId,
        details: {
          taskName: task.name ?? task.prompt.slice(0, 40),
          projectName: project.name,
          deleteWorktree,
        },
      });

      // Close modal
      setIsDeleteDialogOpen(false);

      // Trigger shrink-to-target animation (fire-and-forget)
      void triggerAnimation();

      // Clean up stores immediately
      if (activeStepId) {
        unloadStep(activeStepId);
      }
      clearTaskNavHistoryState(taskId);

      // Navigate away
      navigate({ to: '/all' });

      // Run deletion in background
      void deleteTask
        .mutateAsync({ id: taskId, deleteWorktree })
        .then(() => {
          markJobSucceeded(jobId);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Failed to delete task';
          markJobFailed(jobId, message);
        });
    },
    [
      task,
      project,
      taskId,
      activeStepId,
      addRunningJob,
      triggerAnimation,
      unloadStep,
      clearTaskNavHistoryState,
      navigate,
      deleteTask,
      markJobSucceeded,
      markJobFailed,
    ],
  );

  const handleOpenInEditor = () => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  };

  const handleOpenWorktreeInEditor = useCallback(async () => {
    if (!task?.worktreePath) return;
    try {
      const targetPath =
        isDiffViewOpen && diffSelectedFile
          ? `${task.worktreePath}/${diffSelectedFile}`
          : task.worktreePath;
      await api.shell.openInEditor(targetPath, task.worktreePath);
    } catch {
      modal.error({
        title: 'Worktree Not Found',
        content: `The worktree path no longer exists:\n${task.worktreePath}\n\nThe worktree may have been deleted or moved.`,
      });
    }
  }, [task, isDiffViewOpen, diffSelectedFile, modal]);

  const handleDeleteWorktree = useCallback(() => {
    if (!task?.worktreePath) return;

    const branchName =
      task.branchName ?? getBranchFromWorktreePath(task.worktreePath);

    modal.confirm({
      title: 'Delete Worktree',
      content: (
        <div className="space-y-2">
          <p>
            This will remove the worktree directory and delete branch{' '}
            <code className="text-ink-1 bg-bg-1 rounded px-1.5 py-0.5 text-xs">
              {branchName}
            </code>
            .
          </p>
          <p className="text-ink-2">This action cannot be undone.</p>
        </div>
      ),
      confirmLabel: 'Delete Worktree',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteWorktree.mutateAsync({ taskId });
        } catch (error) {
          modal.error({
            title: 'Failed to Delete Worktree',
            content:
              error instanceof Error
                ? error.message
                : 'An unknown error occurred while deleting the worktree.',
          });
        }
      },
    });
  }, [task, taskId, deleteWorktree, modal]);

  const handleChangeWorktreePath = useCallback(
    (newPath: string) => {
      updateTask.mutate(
        { id: taskId, data: { worktreePath: newPath } },
        {
          onSuccess: () => {
            setIsChangeWorktreePathDialogOpen(false);
          },
          onError: () => {
            modal.error({
              title: 'Failed to Update Worktree Path',
              content: 'An error occurred while updating the worktree path.',
            });
          },
        },
      );
    },
    [taskId, updateTask, modal],
  );

  const addSessionAllowedToolMutate = addSessionAllowedTool.mutate;
  const handleAllowToolsForSession = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      addSessionAllowedToolMutate({ id: taskId, toolName, input });
    },
    [taskId, addSessionAllowedToolMutate],
  );

  const removeSessionAllowedToolMutate = removeSessionAllowedTool.mutate;
  const handleRemoveSessionAllowedTool = useCallback(
    ({ toolName, pattern }: { toolName: string; pattern?: string }) => {
      removeSessionAllowedToolMutate({ id: taskId, toolName, pattern });
    },
    [taskId, removeSessionAllowedToolMutate],
  );

  const allowForProjectMutate = allowForProject.mutate;
  const handleAllowForProject = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      allowForProjectMutate({ id: taskId, toolName, input });
    },
    [taskId, allowForProjectMutate],
  );

  const allowForProjectWorktreesMutate = allowForProjectWorktrees.mutate;
  const handleAllowForProjectWorktrees = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      allowForProjectWorktreesMutate({ id: taskId, toolName, input });
    },
    [taskId, allowForProjectWorktreesMutate],
  );

  const allowGloballyMutate = allowGlobally.mutate;
  const handleAllowGlobally = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      allowGloballyMutate({ id: taskId, toolName, input });
    },
    [taskId, allowGloballyMutate],
  );

  const handleSetMode = useCallback(
    (mode: InteractionMode) => {
      if (activeStepId) {
        setTaskMode.mutate({ stepId: activeStepId, mode });
      }
    },
    [activeStepId, setTaskMode],
  );

  const permissionProps = useMemo(() => {
    if (!agentMeta.pendingPermission) return null;
    return {
      request: agentMeta.pendingPermission,
      onRespond: respondToPermission,
      onAllowForSession: handleAllowToolsForSession,
      onAllowForProject: handleAllowForProject,
      onAllowForProjectWorktrees: handleAllowForProjectWorktrees,
      onAllowGlobally: handleAllowGlobally,
      onSetMode: handleSetMode,
      worktreePath: task?.worktreePath,
    };
  }, [
    agentMeta.pendingPermission,
    respondToPermission,
    handleAllowToolsForSession,
    handleAllowForProject,
    handleAllowForProjectWorktrees,
    handleAllowGlobally,
    handleSetMode,
    task?.worktreePath,
  ]);

  const questionProps = useMemo(() => {
    if (!agentMeta.pendingQuestion) return null;
    return {
      request: agentMeta.pendingQuestion,
      onRespond: respondToQuestion,
    };
  }, [agentMeta.pendingQuestion, respondToQuestion]);

  const handleToggleSettingsPane = useCallback(() => {
    if (rightPane?.type === 'settings') {
      closeRightPane();
    } else {
      openSettings();
    }
  }, [rightPane, closeRightPane, openSettings]);

  const handleToggleDebugMessagesPane = useCallback(() => {
    if (rightPane?.type === 'debugMessages') {
      closeRightPane();
      return;
    }
    openDebugMessages();
  }, [rightPane, closeRightPane, openDebugMessages]);

  const handleAddStep = async (data: {
      promptTemplate: string;
      hasUserPrompt: boolean;
      presetType: AddStepPresetType;
      interactionMode: InteractionMode;
      agentBackend: AgentBackendType;
      modelPreference: ModelPreference;
      thinkingEffort: ThinkingEffort;
      images: PromptImagePart[];
      start: boolean;
      includedReviewCommentIds: string[];
      reviewers?: import('@shared/types').ReviewerConfig[];
      preferredStepId?: string | null;
    }) => {
      const stepList = steps ?? [];
      const preferredStepId = addStepAtEnd
        ? (stepList[stepList.length - 1]?.id ?? null)
        : (data.preferredStepId ?? addStepAfterStepId);
      const referenceStep =
        data.presetType === 'continue'
          ? getContinueReferenceStep({
              steps: stepList,
              activeStepId,
              preferredStepId,
            })
          : getReferenceStepForPreset({
              steps: stepList,
              activeStepId,
              preferredStepId,
            });

      if (data.presetType === 'continue' && !referenceStep) {
        addToast({
          type: 'error',
          message:
            'No usable previous step to continue from. Pick step with actual messages or finish current step first.',
        });
        return false;
      }

      const insertionSortOrder = (() => {
        if (addStepAtEnd) return stepList.length;
        if (stepList.length === 0) return 0;
        if (!referenceStep) return stepList.length;
        const index = stepList.findIndex(
          (step) => step.id === referenceStep.id,
        );
        if (index === -1) return stepList.length;
        return index + 1;
      })();
      const defaultName =
        data.presetType === 'continue'
          ? 'Continue'
          : data.presetType === 'review-changes'
            ? 'Review Changes'
            : 'Step';
      const name = data.hasUserPrompt
        ? data.promptTemplate.split('\n')[0]?.slice(0, 40).trim() || defaultName
        : defaultName;

      const promptTemplate =
        data.presetType === 'continue' && referenceStep
          ? buildContinuePromptTemplate({
              previousStepId: referenceStep.id,
              userPrompt: data.promptTemplate,
            })
          : data.presetType === 'review-changes'
            ? [
                data.hasUserPrompt ? null : buildReviewChangesPrompt(),
                data.promptTemplate,
              ]
                .filter((part): part is string => !!part?.trim())
                .join('\n\n')
            : data.promptTemplate;

      const dependsOn = referenceStep ? [referenceStep.id] : [];

      const isReview = data.presetType === 'review-changes';
      const reviewers = isReview ? data.reviewers : undefined;

      try {
        const step = await createStep.mutateAsync({
          taskId,
          name,
          promptTemplate,
          interactionMode: data.interactionMode,
          agentBackend: data.agentBackend,
          modelPreference: data.modelPreference,
          thinkingEffort: data.thinkingEffort,
          images: data.images.length > 0 ? data.images : null,
          dependsOn,
          sortOrder: insertionSortOrder,
          start: data.start,
          ...(isReview && reviewers
            ? {
                type: 'review' as const,
                meta: { reviewers },
              }
            : {}),
        });
        startTransition(() => setIsAddStepDialogOpen(false));
        startTransition(() => setAddStepAfterStepId(null));
        startTransition(() => setAddStepAtEnd(false));
        setActiveStepId(step.id);
        for (const commentId of data.includedReviewCommentIds) {
          removeReviewComment(taskId, commentId);
        }
        if (data.start) {
          setStartingStepIds((prev) => new Set(prev).add(step.id));
          if (!stepStartJobIdsRef.current.has(step.id)) {
            const jobId = addRunningJob({
              type: 'step-start',
              title: `Starting "${step.name}"`,
              taskId,
              projectId: task?.projectId ?? projectId ?? null,
              details: { stepId: step.id, stepName: step.name },
            });
            stepStartJobIdsRef.current.set(step.id, jobId);
          }
        }
        return true;
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to create step',
        });
        return false;
      }
  };

  const handleContinueInterruptedStep = async () => {
    const interruptedStep = getInterruptedContinueStep({
      steps: steps ?? [],
      activeStep,
    });
    if (!interruptedStep) return;
    if (continuingInterruptedStepId === interruptedStep.id) return;

    setContinuingInterruptedStepId(interruptedStep.id);
    setActiveStepId(interruptedStep.id);

    try {
      await api.agent.sendMessage(interruptedStep.id, [
        { type: 'text', text: 'continue' },
      ]);
    } catch (error) {
      addToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to continue interrupted step',
      });
    } finally {
      setContinuingInterruptedStepId(null);
    }
  };

  const handleStartStep = useCallback(async () => {
    if (!activeStepId) return;
    setStartingStepIds((prev) => new Set(prev).add(activeStepId));
    if (activeStep && !stepStartJobIdsRef.current.has(activeStepId)) {
      const jobId = addRunningJob({
        type: 'step-start',
        title: `Starting "${activeStep.name}"`,
        taskId,
        projectId: task?.projectId ?? projectId ?? null,
        details: { stepId: activeStep.id, stepName: activeStep.name },
      });
      stepStartJobIdsRef.current.set(activeStepId, jobId);
    }
    const didStart = await start();
    if (!didStart) {
      const jobId = stepStartJobIdsRef.current.get(activeStepId);
      if (jobId) {
        markJobFailed(jobId, 'Failed to start step');
        stepStartJobIdsRef.current.delete(activeStepId);
      }
      setStartingStepIds((prev) => {
        const next = new Set(prev);
        next.delete(activeStepId);
        return next;
      });
    }
  }, [
    activeStep,
    activeStepId,
    addRunningJob,
    markJobFailed,
    projectId,
    start,
    task?.projectId,
    taskId,
  ]);

  useEffect(() => {
    if (!steps) return;

    for (const step of steps) {
      const jobId = stepStartJobIdsRef.current.get(step.id);
      if (!jobId) continue;

      if (step.status === 'running' || step.status === 'completed') {
        markJobSucceeded(jobId, {
          taskId: step.taskId,
          projectId: task?.projectId ?? projectId ?? null,
        });
        stepStartJobIdsRef.current.delete(step.id);
        continue;
      }

      if (step.status === 'errored' || step.status === 'interrupted') {
        markJobFailed(jobId, `Step ${step.status}`);
        stepStartJobIdsRef.current.delete(step.id);
      }
    }
  }, [steps, markJobFailed, markJobSucceeded, projectId, task?.projectId]);

  useEffect(() => {
    if (!activeStepId || activeStep?.status === 'ready') return;
    startTransition(() => setStartingStepIds((prev) => {
      if (!prev.has(activeStepId)) return prev;
      const next = new Set(prev);
      next.delete(activeStepId);
      return next;
    }));
  }, [activeStepId, activeStep?.status]);

  const handleMergeStarted = useCallback(() => {
    // Close the diff view when merge is dispatched (worktree will be deleted)
    if (isDiffViewOpen) {
      toggleDiffView();
    }
  }, [isDiffViewOpen, toggleDiffView]);

  const toggleUserCompleted = useToggleTaskUserCompleted();
  const completeTask = useCompleteTask();

  const handleCompleteConfirm = useCallback(
    ({ cleanupWorktree }: { cleanupWorktree: boolean }) => {
      setIsCompleteDialogOpen(false);
      completeTask.mutate({ id: taskId, cleanupWorktree });
    },
    [taskId, completeTask],
  );

  useCommands('task-panel', [
    {
      label: 'Task Menu',
      shortcut: 'cmd+m',
      section: 'Task',
      handler: () => {
        overflowMenuRef.current?.toggle();
      },
    },
    {
      label: 'Run Command',
      shortcut: 'cmd+u',
      section: 'Task',
      handler: () => {
        runButtonRef.current?.toggle();
      },
    },
    {
      label: 'Open Review Files',
      shortcut: 'cmd+e',
      section: 'Task',
      handler: toggleReviewFiles,
    },
    {
      label:
        rightPane?.type === 'commandLogs'
          ? 'Close Command Logs'
          : 'Open Command Logs',
      shortcut: 'cmd+l',
      section: 'Task',
      handler: () => {
        if (rightPane?.type === 'commandLogs') {
          closeRightPane();
        } else {
          openCommandLogs();
        }
      },
    },
    {
      label: hasGitReviewModes ? 'Toggle Review Changes' : 'Toggle Review',
      shortcut: 'cmd+d',
      section: 'Task',
      handler: () => {
        if (!hasGitReviewModes) {
          if (isDiffViewOpen) {
            closeDiffView();
            return;
          }
          setReviewMode('files');
          openDiffView();
          return;
        }
        if (isDiffViewOpen && reviewMode === 'changes') {
          closeDiffView();
          return;
        }
        setReviewMode('changes');
        openDiffView();
      },
    },
    {
      label: 'Cycle Diff Mode',
      shortcut: 'cmd+shift+d',
      section: 'Task',
      handler: () => {
        const MODES: DiffViewMode[] = [
          'inline',
          'side-by-side',
          'current-state',
        ];
        const current = useUIStore.getState().settings.diffViewMode;
        const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
        useUIStore.getState().setSetting('diffViewMode', next);
      },
    },
    {
      label: 'Cycle Review Mode',
      shortcut: 'cmd+shift+r',
      section: 'Task',
      handler: () => {
        if (!isDiffViewOpen) return;
        const MODES: ReviewMode[] = hasGitReviewModes
          ? ['changes', 'files', 'commits']
          : ['files'];
        const next = MODES[(MODES.indexOf(reviewMode) + 1) % MODES.length]!;
        setReviewMode(next);
      },
    },
    {
      label: 'Toggle Task Settings',
      section: 'Task',
      handler: () => {
        toggleRightPane();
      },
    },
    {
      label:
        rightPane?.type === 'debugMessages'
          ? 'Close Raw Message Pane'
          : 'Open Raw Message Pane',
      section: 'Task',
      handler: () => {
        handleToggleDebugMessagesPane();
      },
    },
    {
      label: 'Open Project in Editor',
      shortcut: 'cmd+shift+e',
      section: 'Task',
      handler: () => {
        handleOpenInEditor();
      },
    },
    !!task?.worktreePath && {
      label: 'Open Worktree in Editor',
      shortcut: 'cmd+w',
      section: 'Task',
      handler: () => {
        handleOpenWorktreeInEditor();
      },
    },
    task?.status !== 'running' &&
      agentMeta.status !== 'running' &&
      !!task?.worktreePath && {
        label: 'Delete Worktree',
        section: 'Task',
        handler: () => {
          handleDeleteWorktree();
        },
      },
    !!task?.worktreePath && {
      label: 'Change Worktree Path',
      section: 'Task',
      keywords: ['worktree', 'move', 'relocate', 'path'],
      handler: () => {
        setIsChangeWorktreePathDialogOpen(true);
      },
    },
    !!task?.pullRequestUrl && {
      label: 'Open Pull Request in Browser',
      section: 'Task',
      handler: () => {
        if (task?.pullRequestUrl) {
          window.open(task.pullRequestUrl!, '_blank');
        }
      },
    },
    {
      label: task?.userCompleted
        ? 'Mark Task as Active'
        : 'Mark Task as Complete',
      section: 'Task',
      handler: () => {
        if (task?.userCompleted) {
          // Uncompleting — simple toggle
          toggleUserCompleted.mutate(taskId);
        } else if (task?.worktreePath) {
          // Completing with worktree — show dialog to choose cleanup
          setIsCompleteDialogOpen(true);
        } else {
          // Completing without worktree — complete directly
          completeTask.mutate({ id: taskId });
        }
      },
    },
    {
      label: 'Copy Session ID',
      section: 'Task',
      handler: () => {
        handleCopySessionId();
      },
    },
    task?.status !== 'running' &&
      agentMeta.status !== 'running' && {
        label: 'Delete Task',
        section: 'Task',
        handler: () => {
          setIsDeleteDialogOpen(true);
        },
      },
  ]);

  // Review context — allows children (diff view, message stream) to add comments
  // Must be before any early return to satisfy Rules of Hooks.
  const addReviewCommentAction = useReviewCommentsStore((s) => s.addComment);
  const removeReviewCommentAction = useReviewCommentsStore(
    (s) => s.removeComment,
  );
  const reviewContextValue = useMemo(
    () => ({
      addComment: (params: ReviewCommentParams) => {
        if (params.kind === 'diff') {
          return addReviewCommentAction(taskId, {
            commentKind: 'diff',
            anchor: {
              filePath: params.filePath,
              lineStart: params.lineStart,
              lineEnd: params.lineEnd,
              selectedText: params.selectedText,
            },
            body: params.body,
            images: params.images,
            presets: params.presets as ReviewPresetId[],
            status: 'open',
            resolved: false,
          });
        }
        // Message comment — store anchor info in the filePath field as a
        // synthetic path so it flows through the existing comment store.
        return addReviewCommentAction(taskId, {
          commentKind: 'message',
          anchor: {
            filePath: `__message__:${params.entryId}`,
            lineStart: params.lineStart ?? 0,
            lineEnd: params.lineEnd,
            selectedText: params.selectedText,
            charOffset: params.charOffset,
          },
          body: params.body,
          images: params.images,
          presets: params.presets as ReviewPresetId[],
          status: 'open',
          resolved: false,
        });
      },
      removeComment: (commentId: string) => {
        removeReviewCommentAction(taskId, commentId);
      },
      enabled: true,
    }),
    [taskId, addReviewCommentAction, removeReviewCommentAction],
  );

  const getCompletionContextBeforePrompt = useCallback(
    () => getLastAssistantMessageForStep(activeStepId),
    [activeStepId],
  );

  if (!task || !project) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Loading...
      </div>
    );
  }

  const isRunning =
    agentMeta.status === 'running' || activeStep?.status === 'running';
  const hasRunningStepStartJob = backgroundJobs.some(
    (job) =>
      job.status === 'running' &&
      job.type === 'step-start' &&
      job.taskId === taskId &&
      job.details.stepId === activeStepId,
  );
  const isStepStarting =
    isStarting ||
    hasRunningStepStartJob ||
    (!!activeStepId && startingStepIds.has(activeStepId));
  const isAgentBusy = isRunning || isStepStarting;
  const isWaiting = agentMeta.status === 'waiting' || task.status === 'waiting';
  const taskRootPath = task.worktreePath ?? project.path;
  const hasMessages = agentMeta.hasMessages;
  const activeStepError = agentMeta.error ?? 'No error details available.';
  const canSendMessage = !isAgentBusy && hasMessages && !!activeStep?.sessionId;
  const interruptedStep = getInterruptedContinueStep({
    steps: steps ?? [],
    activeStep,
  });
  const canContinueInterruptedStep =
    !isAgentBusy &&
    !isSkillCreationTask &&
    task.status === 'interrupted' &&
    !!interruptedStep &&
    continuingInterruptedStepId === null;
  const hasRepoLink =
    !!project.repoProviderId && !!project.repoProjectId && !!project.repoId;
  const hasWorkItemsLink =
    !!project.workItemProviderId &&
    !!project.workItemProjectId &&
    !!project.workItemProjectName;
  const shouldRenderMessageSection =
    !isPrViewOpen && !isDiffViewOpen && activeStep?.type !== 'pr-review';
  const backendLabel =
    AVAILABLE_BACKENDS.find(
      (backend) => backend.value === activeStep?.agentBackend,
    )?.label ?? 'Claude Code';
  const taskTitle = getTaskTitle({ name: task.name, prompt: task.prompt });

  return (
    <ReviewProvider value={reviewContextValue}>
      <div
        ref={taskPanelRef}
        className="bg-bg-0 flex h-full w-full overflow-hidden rounded-tl-xl"
      >
        {!shouldRenderMessageSection && (
          <TaskAgentStreamSync taskId={taskId} stepId={activeStepId} />
        )}
        {/* Main content */}
        <div
          className={clsx(
            'relative flex min-w-0 flex-1 flex-col',
            rightPane && 'mr-2',
          )}
        >
          {/* Header */}
          <div
            className={clsx(
              'flex items-center gap-3 px-3',
              TASK_PANEL_HEADER_HEIGHT_CLS,
            )}
          >
            {/* Left: Task title and note input */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TaskNameEditor
                key={`task-name-${taskId}`}
                taskId={taskId}
                name={task.name}
                prompt={task.prompt}
              />
              <TaskPendingNoteInput
                key={`task-note-${taskId}`}
                taskId={taskId}
                pendingMessage={task.pendingMessage}
              />
            </div>

            {/* Center: Branch, PR badge, Work items */}
            <div className="flex min-w-0 shrink items-center gap-2">
              {activeStepId && (
                <AgentResourcePill
                  stepId={activeStepId}
                  isRunning={activeStep?.status === 'running'}
                  backendLabel={backendLabel}
                />
              )}

              {/* Backend chip */}
              <Chip size="sm" className="max-w-40">
                {backendLabel}
              </Chip>

              {/* Branch chip */}
              {task.worktreePath ? null : task.branchName ? (
                <Chip
                  size="xs"
                  icon={<GitBranch />}
                  title={task.branchName}
                  className="max-w-28 sm:max-w-36"
                >
                  {task.branchName}
                </Chip>
              ) : null}

              {/* PR badge */}
              {task.pullRequestId && task.pullRequestUrl && (
                <PrBadge
                  pullRequestId={task.pullRequestId}
                  pullRequestUrl={task.pullRequestUrl}
                />
              )}

              {/* Work item badges */}
              {task.workItemIds &&
                task.workItemIds.length > 0 &&
                task.workItemIds.map((workItemId, index) => {
                  const workItemUrl = task.workItemUrls?.[index];
                  return (
                    <TaskHeaderWorkItemChip
                      key={workItemId}
                      providerId={project.workItemProviderId}
                      workItemId={workItemId}
                      workItemUrl={workItemUrl}
                    />
                  );
                })}
            </div>

            {/* Work items editor modal */}
            {hasWorkItemsLink && (
              <Modal
                isOpen={showWorkItemsEditor}
                onClose={() => setShowWorkItemsEditor(false)}
                title="Linked Work Items"
                size="xl"
              >
                <div className="flex flex-col" style={{ height: '60vh' }}>
                  {/* Search input */}
                  <div className="mb-2 shrink-0 px-1">
                    <Input
                      type="text"
                      value={workItemsFilter}
                      onChange={(e) => setWorkItemsFilter(e.target.value)}
                      placeholder="Search work items..."
                      size="sm"
                      icon={<Search />}
                    />
                  </div>

                  {/* Picker */}
                  <div className="min-h-0 flex-1">
                    <WorkItemPicker
                      providerId={project.workItemProviderId!}
                      projectId={project.workItemProjectId!}
                      projectName={project.workItemProjectName!}
                      selectedWorkItemIds={draftWorkItemIds}
                      onToggleSelect={handleWorkItemToggle}
                      onClearSelection={handleClearWorkItems}
                      filter={workItemsFilter}
                    />
                  </div>

                  {/* Footer with submit */}
                  <div className="border-glass-border flex items-center justify-end gap-2 border-t pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowWorkItemsEditor(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSubmitWorkItems}
                    >
                      Save
                      <Kbd shortcut="cmd+enter" />
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Right: Run + Overflow menu */}
            <div className="flex shrink-0 items-center gap-2">
              <RunButton
                taskId={taskId}
                projectId={project.id}
                workingDir={taskRootPath}
                dropdownRef={runButtonRef}
                onToggleLogs={() => {
                  if (rightPane?.type === 'commandLogs') {
                    closeRightPane();
                  } else {
                    openCommandLogs();
                  }
                }}
                onRunCommand={(runCommandIds) => {
                  openCommandLogs(runCommandIds[0] ?? null);
                }}
                isLogsPaneOpen={rightPane?.type === 'commandLogs'}
              />

              {/* Overflow menu */}
              <Dropdown
                trigger={
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<MoreHorizontal />}
                    title="Task menu (\u2318M)"
                  >
                    <Kbd shortcut="cmd+m" />
                  </Button>
                }
                align="right"
                dropdownRef={overflowMenuRef}
              >
                {/* Group 1: View toggles */}
                <DropdownItem
                  icon={<FolderTree />}
                  onClick={toggleReviewFiles}
                  checked={isDiffViewOpen && reviewMode === 'files'}
                  shortcut="cmd+e"
                >
                  Files
                </DropdownItem>
                <DropdownItem
                  icon={<GitCompare />}
                  onClick={toggleDiffView}
                  checked={isDiffViewOpen}
                  shortcut="cmd+d"
                >
                  Review
                </DropdownItem>
                {task.worktreePath && hasRepoLink && (
                  <DropdownItem
                    icon={<GitPullRequest />}
                    onClick={togglePrView}
                    checked={isPrViewOpen}
                  >
                    Pull Request
                  </DropdownItem>
                )}
                {hasWorkItemsLink && (
                  <DropdownItem
                    icon={<ListTodo />}
                    onClick={() => openWorkItemsEditor()}
                  >
                    {task.workItemIds?.length
                      ? 'Edit Work Items'
                      : 'Link Work Items'}
                  </DropdownItem>
                )}

                <DropdownDivider />

                {/* Group 2: Actions */}
                <DropdownItem
                  icon={<ExternalLink />}
                  onClick={handleOpenInEditor}
                  shortcut="cmd+shift+e"
                >
                  Open in{' '}
                  {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
                </DropdownItem>
                {task.worktreePath && (
                  <DropdownItem
                    icon={<ExternalLink />}
                    onClick={handleOpenWorktreeInEditor}
                    shortcut="cmd+w"
                  >
                    Open Worktree in Editor
                  </DropdownItem>
                )}
                {task.branchName && (
                  <DropdownItem
                    icon={<GitFork />}
                    onClick={() => {
                      overflowMenuRef.current?.toggle();
                      const draftStore = useNewTaskDraftStore.getState();
                      draftStore.setSelectedProjectId(task.projectId);
                      draftStore.setDraft(task.projectId, {
                        sourceBranch: task.branchName,
                        createWorktree: true,
                        inputMode: 'prompt',
                        parentTaskId: task.id,
                      });
                      useOverlaysStore.getState().open('new-task');
                    }}
                  >
                    Sub Task
                  </DropdownItem>
                )}
                <DropdownItem
                  icon={<Settings />}
                  onClick={handleToggleSettingsPane}
                  checked={rightPane?.type === 'settings'}
                >
                  Task Settings
                </DropdownItem>
                <DropdownItem
                  icon={<Bug />}
                  onClick={handleToggleDebugMessagesPane}
                  checked={rightPane?.type === 'debugMessages'}
                >
                  Raw Messages
                </DropdownItem>
                {task.worktreePath && (
                  <DropdownItem
                    icon={<FolderSymlink />}
                    onClick={() => setIsChangeWorktreePathDialogOpen(true)}
                  >
                    Change Worktree Path
                  </DropdownItem>
                )}
                {task.worktreePath && !isAgentBusy && (
                  <DropdownItem
                    icon={<Trash2 />}
                    variant="danger"
                    onClick={handleDeleteWorktree}
                  >
                    Delete Worktree
                  </DropdownItem>
                )}
                {!isAgentBusy && (
                  <DropdownItem
                    icon={<Trash2 />}
                    variant="danger"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    Delete Task
                  </DropdownItem>
                )}

                {/* Group 3: Info (only when session data exists) */}
                {(activeStep?.sessionId || model || task.worktreePath) && (
                  <>
                    <DropdownDivider />
                    {task.worktreePath && (
                      <DropdownInfo
                        label="Worktree"
                        value={task.worktreePath}
                        valueClassName="max-w-56 whitespace-normal break-all text-right"
                      />
                    )}
                    {model && (
                      <DropdownInfo
                        label="Model"
                        value={formatModelName(model)}
                      />
                    )}
                    {activeStep?.sessionId && (
                      <DropdownInfo
                        label="Session"
                        value={`${activeStep.sessionId.slice(0, 8)}...`}
                        onClick={handleCopySessionId}
                      />
                    )}
                  </>
                )}
              </Dropdown>
            </div>
          </div>

          {/* Step flow bar — hide add-step for skill-creation tasks */}
          <StepFlowBar
            taskId={taskId}
            onAddStepAtEnd={
              isSkillCreationTask
                ? undefined
                : () => {
                    setAddStepAtEnd(true);
                    setAddStepAfterStepId(null);
                    setIsAddStepDialogOpen(true);
                  }
            }
            onAddStepAfter={
              isSkillCreationTask
                ? undefined
                : (afterStepId) => {
                    setAddStepAtEnd(false);
                    setAddStepAfterStepId(afterStepId);
                    setIsAddStepDialogOpen(true);
                  }
            }
          />
          <Separator />

          <div className="min-h-0 flex-1">
            {/* Main content area: PR view OR Diff view OR Message stream */}
            <div className="h-full min-h-0">
              {isPrViewOpen ? (
                <TaskPrView
                  taskId={taskId}
                  projectId={project.id}
                  onClose={closePrView}
                  bottomPadding={footerHeight}
                />
              ) : isDiffViewOpen ? (
                <WorktreeReviewView
                  taskId={taskId}
                  projectId={project.id}
                  selectedFilePath={diffSelectedFile}
                  onSelectFile={selectDiffFile}
                  collapsedFolders={diffCollapsedFolders}
                  onToggleFolder={toggleDiffCollapsedFolder}
                  reviewMode={reviewMode}
                  onReviewModeChange={setReviewMode}
                  fileExplorerRootPath={taskRootPathForExplorer}
                  fileExplorerSelectedFile={explorerSelectedFile}
                  onFileExplorerSelectFile={explorerSelectFile}
                  fileExplorerExpandedDirs={explorerExpandedDirs}
                  onFileExplorerToggleDir={explorerToggleDir}
                  fileExplorerHideUnchanged={explorerHideUnchanged}
                  onFileExplorerToggleHideUnchanged={
                    explorerToggleHideUnchanged
                  }
                  branchName={
                    task.worktreePath
                      ? (task.branchName ??
                        getBranchFromWorktreePath(task.worktreePath))
                      : (task.branchName ?? project.defaultBranch ?? 'main')
                  }
                  sourceBranch={task.sourceBranch}
                  defaultBranch={project.defaultBranch}
                  protectedBranches={project.protectedBranches}
                  taskName={task.name}
                  hasRepoLink={hasRepoLink}
                  pullRequestUrl={task.pullRequestUrl}
                  onMergeStarted={handleMergeStarted}
                  onOpenPrView={openPrView}
                  bottomPadding={footerHeight}
                  showWorktreeActions={!!task.worktreePath}
                  gitReviewEnabled={hasGitReviewModes}
                />
              ) : activeStep?.type === 'pr-review' ? (
                <PrReviewValidation step={activeStep} />
              ) : (
                <TaskMessageStreamSection
                  taskId={taskId}
                  stepId={activeStepId}
                  activeStep={activeStep}
                  taskPrompt={task.prompt}
                  isAgentBusy={isAgentBusy}
                  isStepStarting={isStepStarting}
                  activeStepError={activeStepError}
                  onStartStep={handleStartStep}
                  onFilePathClick={handleFilePathClick}
                  onToolDiffClick={handleToolDiffClick}
                  onCancelQueuedPrompt={cancelQueuedPrompt}
                  onUpdateQueuedPrompt={updateQueuedPrompt}
                  onShowRawMessage={openDebugMessages}
                  bottomPadding={footerHeight}
                  pendingPermission={permissionProps}
                  pendingQuestion={questionProps}
                  onAddBashToPermissions={handleAddBashToPermissions}
                  rootPath={taskRootPath}
                  respondToPermission={respondToPermission}
                  respondToQuestion={respondToQuestion}
                  onAllowForSession={handleAllowToolsForSession}
                  onAllowForProject={handleAllowForProject}
                  onAllowForProjectWorktrees={handleAllowForProjectWorktrees}
                  onAllowGlobally={handleAllowGlobally}
                  onSetMode={handleSetMode}
                  worktreePath={task.worktreePath}
                  afterLastPromptGroup={
                    canContinueInterruptedStep ? (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Play />}
                        onClick={handleContinueInterruptedStep}
                        title="Continue interrupted step"
                      >
                        Continue
                      </Button>
                    ) : null
                  }
                />
              )}
            </div>
          </div>

          {/* Message input — floats above content so messages scroll underneath */}
          {(canSendMessage || isWaiting || hasMessages) && (
            <div
              ref={footerRef}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
            >
              <div className="pointer-events-auto">
                {/* Skill publish action for skill-creation steps */}
                {activeStep?.type === 'skill-creation' && (
                  <SkillPublishAction
                    step={activeStep}
                    taskId={taskId}
                    taskCompleted={task?.userCompleted ?? false}
                  />
                )}
                {activeStep?.type === 'feature-map' && (
                  <FeatureMapSaveAction step={activeStep} />
                )}
                <TaskInputFooter
                  taskId={taskId}
                  activeStepId={activeStepId}
                  isRunning={isAgentBusy}
                  isStopping={isStopping}
                  canSendMessage={!!canSendMessage}
                  onSend={sendMessage}
                  onQueue={queuePrompt}
                  queuedPrompts={agentMeta.queuedPrompts}
                  onStop={handleStop}
                  projectRoot={taskRootPath}
                  getCompletionContextBeforePrompt={
                    getCompletionContextBeforePrompt
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* File preview pane */}
        {rightPane?.type === 'filePreview' && (
          <FilePreviewPane
            filePath={rightPane.filePath}
            projectPath={project.path}
            lineStart={rightPane.lineStart}
            lineEnd={rightPane.lineEnd}
            onClose={closeRightPane}
          />
        )}

        {rightPane?.type === 'toolDiffPreview' && (
          <ToolDiffPreviewPane
            filePath={rightPane.filePath}
            oldString={rightPane.oldString}
            newString={rightPane.newString}
            onClose={closeRightPane}
          />
        )}

        {/* Task settings pane */}
        {rightPane?.type === 'settings' && (
          <TaskSettingsPane
            sessionRules={task.sessionRules ?? {}}
            sourceBranch={task.sourceBranch}
            sourceCommit={task.startCommitHash}
            taskId={taskId}
            stepId={activeStepId ?? undefined}
            onRemoveTool={handleRemoveSessionAllowedTool}
            onClose={closeRightPane}
            onOpenDebugMessages={openDebugMessages}
          />
        )}

        {/* Debug messages pane */}
        {rightPane?.type === 'debugMessages' && (
          <DebugMessagesPane
            taskId={taskId}
            stepId={activeStepId}
            scrollToEntryId={rightPane.scrollToEntryId}
            onClose={closeRightPane}
          />
        )}

        {/* Command logs pane */}
        {rightPane?.type === 'commandLogs' && (
          <CommandLogsPane
            taskId={taskId}
            projectId={project.id}
            workingDir={taskRootPath}
            selectedCommandId={rightPane.selectedCommandId}
            onSelectCommand={selectCommandLogsTab}
            onClose={closeRightPane}
          />
        )}

        {/* Add step modal */}
        <AddStepDialog
          isOpen={isAddStepDialogOpen}
          onClose={() => {
            setIsAddStepDialogOpen(false);
            setAddStepAfterStepId(null);
            setAddStepAtEnd(false);
          }}
          onConfirm={handleAddStep}
          defaultBackend={defaultAddStepBackend}
          defaultModel={defaultAddStepModel}
          defaultThinkingEffort={activeStep?.thinkingEffort ?? 'default'}
          taskId={taskId}
          activeStepId={activeStepId ?? undefined}
          projectRoot={taskRootPath}
          projectId={project.id}
        />

        {/* Change worktree path dialog */}
        {task.worktreePath && (
          <ChangeWorktreePathDialog
            isOpen={isChangeWorktreePathDialogOpen}
            onClose={() => setIsChangeWorktreePathDialogOpen(false)}
            onConfirm={handleChangeWorktreePath}
            currentPath={task.worktreePath}
            isPending={updateTask.isPending}
          />
        )}

        {/* Delete confirmation modal */}
        <DeleteTaskDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={handleDeleteConfirm}
          taskName={taskTitle}
          hasWorktree={!!task.worktreePath}
          isPending={false}
        />

        {/* Complete task with worktree cleanup dialog */}
        <CompleteTaskDialog
          isOpen={isCompleteDialogOpen}
          onClose={() => setIsCompleteDialogOpen(false)}
          onConfirm={handleCompleteConfirm}
          hasWorktree={!!task.worktreePath}
          isPending={completeTask.isPending}
        />

        {/* Add to permissions modal — rendered here (outside the conditional
          message-stream / loading / diff chain) so it survives MessageStream
          unmount/remount when new messages arrive */}
        {permissionModal && (
          <AddPermissionModal
            isOpen
            onClose={closePermissionModal}
            command={permissionModal.command}
            taskId={task.id}
            hasWorktree={!!task.worktreePath}
          />
        )}
      </div>
    </ReviewProvider>
  );
}

const TaskAgentStreamSync = memo(function TaskAgentStreamSync({
  taskId,
  stepId,
}: {
  taskId: string;
  stepId: string | null;
}) {
  useAgentStream({ taskId, stepId });
  return null;
});

const TaskMessageStreamSection = memo(function TaskMessageStreamSection({
  taskId,
  stepId,
  activeStep,
  taskPrompt,
  isAgentBusy,
  isStepStarting,
  activeStepError,
  onStartStep,
  onFilePathClick,
  onToolDiffClick,
  onCancelQueuedPrompt,
  onUpdateQueuedPrompt,
  onShowRawMessage,
  bottomPadding,
  pendingPermission,
  pendingQuestion,
  onAddBashToPermissions,
  rootPath,
  respondToPermission,
  respondToQuestion,
  onAllowForSession,
  onAllowForProject,
  onAllowForProjectWorktrees,
  onAllowGlobally,
  onSetMode,
  worktreePath,
  afterLastPromptGroup,
}: {
  taskId: string;
  stepId: string | null;
  activeStep?: TaskStep | null;
  taskPrompt: string;
  isAgentBusy: boolean;
  isStepStarting: boolean;
  activeStepError: string;
  onStartStep: () => void | Promise<void>;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onToolDiffClick?: (
    filePath: string,
    oldString: string,
    newString: string,
  ) => void;
  onCancelQueuedPrompt?: (promptId: string) => void;
  onUpdateQueuedPrompt?: (promptId: string, content: string) => void;
  onShowRawMessage?: (entryId: string) => void;
  bottomPadding: number;
  pendingPermission: ComponentProps<typeof MessageStream>['pendingPermission'];
  pendingQuestion: ComponentProps<typeof MessageStream>['pendingQuestion'];
  onAddBashToPermissions?: (command: string) => void;
  rootPath: string | null;
  respondToPermission: ComponentProps<typeof PermissionBar>['onRespond'];
  respondToQuestion: ComponentProps<typeof QuestionOptions>['onRespond'];
  onAllowForSession?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProject?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProjectWorktrees?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowGlobally?: (toolName: string, input: Record<string, unknown>) => void;
  onSetMode?: (mode: InteractionMode) => void;
  worktreePath?: string | null;
  afterLastPromptGroup?: ReactNode;
}) {
  const agentState = useAgentStream({ taskId, stepId });
  const hasMessages = agentState.messages.length > 0;

  if (agentState.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (hasMessages) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {activeStep?.status === 'errored' && !activeStep.sessionId && (
          <div className="shrink-0 px-4 pt-4">
            <div className="border-status-fail/30 bg-bg-0/95 flex items-center justify-between gap-3 rounded-lg border p-3 shadow-lg backdrop-blur">
              <div className="min-w-0">
                <p className="text-status-fail text-sm font-medium">
                  Step failed to start
                </p>
                <p className="text-ink-2 truncate text-xs">
                  {activeStepError}
                </p>
              </div>
              <Button
                onClick={onStartStep}
                disabled={isStepStarting}
                loading={isStepStarting}
                variant="secondary"
                size="sm"
                icon={<RefreshCw />}
                className="shrink-0"
              >
                {isStepStarting ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <MessageStream
            messages={agentState.messages}
            isRunning={isAgentBusy}
            queuedPrompts={agentState.queuedPrompts}
            onFilePathClick={onFilePathClick}
            onToolDiffClick={onToolDiffClick}
            onCancelQueuedPrompt={onCancelQueuedPrompt}
            onUpdateQueuedPrompt={onUpdateQueuedPrompt}
            onShowRawMessage={onShowRawMessage}
            bottomPadding={bottomPadding}
            pendingPermission={pendingPermission}
            pendingQuestion={pendingQuestion}
            onAddBashToPermissions={onAddBashToPermissions}
            rootPath={rootPath}
            taskId={taskId}
            stepId={stepId}
            afterLastPromptGroup={afterLastPromptGroup}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto p-6"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <div className="text-ink-2 mb-2 text-sm font-medium">
        {activeStep?.name ?? 'Prompt'}
      </div>
      <div className="border-glass-border bg-bg-1 rounded-lg border p-4">
        <pre className="overflow-x-hidden font-sans text-xs whitespace-pre-wrap">
          {activeStep?.promptTemplate ?? taskPrompt}
        </pre>
      </div>
      {isAgentBusy ? (
        <div className="border-glass-border mt-6 flex items-center justify-center gap-2 rounded-lg border border-dashed p-8">
          <Loader2 className="text-ink-2 h-4 w-4 animate-spin" />
          <p className="text-ink-2">Starting agent...</p>
        </div>
      ) : activeStep?.status === 'ready' ? (
        <div className="border-glass-border mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8">
          <Button
            onClick={onStartStep}
            disabled={isStepStarting}
            loading={isStepStarting}
            variant="primary"
            icon={<Play />}
          >
            {isStepStarting ? 'Starting...' : 'Start Step'}
          </Button>
        </div>
      ) : activeStep?.status === 'pending' ? (
        <div className="border-glass-border mt-6 flex items-center justify-center rounded-lg border border-dashed p-8">
          <p className="text-ink-3 text-sm">
            Waiting for dependencies to complete
          </p>
        </div>
      ) : activeStep?.status === 'errored' ? (
        <div className="border-status-fail/30 bg-status-fail-soft mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border p-8 text-center">
          <p className="text-status-fail text-sm font-medium">
            Step failed to start
          </p>
          <p className="text-ink-2 max-w-md text-xs">{activeStepError}</p>
          <Button
            onClick={onStartStep}
            disabled={isStepStarting}
            loading={isStepStarting}
            variant="secondary"
            icon={<RefreshCw />}
          >
            {isStepStarting ? 'Retrying...' : 'Retry Start'}
          </Button>
        </div>
      ) : (
        <div className="border-glass-border mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8">
          <p className="text-ink-2">No messages loaded</p>
          <Button
            onClick={agentState.refetch}
            variant="secondary"
            icon={<RefreshCw />}
          >
            Reload messages
          </Button>
        </div>
      )}
      {agentState.pendingPermission && (
        <div className="mt-4 overflow-hidden rounded-lg">
          <PermissionBar
            request={agentState.pendingPermission}
            onRespond={respondToPermission}
            onAllowForSession={onAllowForSession}
            onAllowForProject={onAllowForProject}
            onAllowForProjectWorktrees={onAllowForProjectWorktrees}
            onAllowGlobally={onAllowGlobally}
            onSetMode={onSetMode}
            worktreePath={worktreePath}
          />
        </div>
      )}
      {agentState.pendingQuestion && (
        <div className="mt-4 overflow-hidden rounded-lg">
          <QuestionOptions
            request={agentState.pendingQuestion}
            onRespond={respondToQuestion}
          />
        </div>
      )}
    </div>
  );
});

/** Whether a backend supports image attachments in prompts.
 *  All Claude models support vision. OpenCode models generally do too,
 *  but per-model capability detection requires SDK support (not yet available). */
function backendSupportsImages(backend?: AgentBackendType | null): boolean {
  // Both claude-code and opencode backends support image input.
  // When per-model capability data becomes available from the BackendModel type,
  // this should additionally check the selected model's capabilities.
  return backend !== undefined && backend !== null;
}

/**
 * Extracted input footer that owns the prompt draft state.
 * This isolates the rapidly-changing prompt text from the rest of TaskPanel,
 * preventing full tree re-renders on every keystroke.
 */
const TaskInputFooter = memo(function TaskInputFooter({
  taskId,
  activeStepId,
  isRunning,
  isStopping,
  canSendMessage,
  onSend,
  onQueue,
  queuedPrompts,
  onStop,
  projectRoot,
  getCompletionContextBeforePrompt,
}: {
  taskId: string;
  activeStepId: string | null;
  isRunning: boolean;
  isStopping: boolean;
  canSendMessage: boolean;
  onSend: (parts: PromptPart[]) => void;
  onQueue: (parts: PromptPart[]) => void;
  queuedPrompts: { content: string }[];
  onStop: () => Promise<void>;
  projectRoot: string | null;
  getCompletionContextBeforePrompt: () => string;
}) {
  const { data: task } = useTask(taskId);
  const { data: footerProject } = useProject(task?.projectId ?? '');
  const { data: activeStep } = useStep(activeStepId ?? '');
  const { data: skills } = useSkills({
    taskId,
    stepId: activeStepId ?? undefined,
  });
  const { data: footerSnippets = [] } = usePromptSnippetsSetting();
  const { data: footerBackendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();

  const snippetVariableContext: SnippetVariableContext = useMemo(
    () => ({
      task: task
        ? {
            worktreePath: task.worktreePath,
            name: task.name,
            note: task.prompt,
            sourceBranch: task.sourceBranch,
            branchName: task.branchName,
          }
        : undefined,
      project: footerProject
        ? { name: footerProject.name, path: footerProject.path }
        : undefined,
    }),
    [task, footerProject],
  );

  // Use step values for backend/mode/model (these live on steps now)
  const effectiveBackend = activeStep?.agentBackend ?? 'claude-code';
  const effectiveMode =
    activeStep?.interactionMode ??
    getDefaultInteractionModeForBackend({ backend: effectiveBackend });
  const effectiveModel = activeStep?.modelPreference ?? 'default';

  const { data: dynamicModels } = useBackendModels(effectiveBackend);
  const resolvedModelForContext =
    effectiveModel === 'default'
      ? getDefaultModelForBackend({
          backend: effectiveBackend,
          project: footerProject,
          backendDefaultModels: footerBackendDefaultModelsSetting,
        })
      : effectiveModel;
  const activeModelMeta = dynamicModels?.find(
    (dynamicModel) => dynamicModel.id === resolvedModelForContext,
  );
  const contextWindow = getContextWindowForModel({
    backend: effectiveBackend,
    model: resolvedModelForContext,
    dynamicContextWindow: activeModelMeta?.contextWindow,
  });
  const thinkingCapabilities = getModelThinkingCapabilities(
    effectiveModel,
    dynamicModels,
  );
  const thinkingOptions = getThinkingEffortOptions({
    backend: effectiveBackend,
    model: effectiveModel,
    capabilities: thinkingCapabilities,
  });
  const effectiveThinkingEffort = normalizeThinkingEffortForModel({
    backend: effectiveBackend,
    model: effectiveModel,
    effort: activeStep?.thinkingEffort,
    capabilities: thinkingCapabilities,
  });
  const setStepMode = useSetTaskMode();
  const clearUserCompleted = useClearTaskUserCompleted();

  const {
    text: promptDraft,
    setDraft: setPromptDraft,
    clearDraft: clearPromptDraft,
  } = useTaskPrompt(taskId);

  // Review comments — pending pills in composer
  const reviewComments = useReviewComments(taskId);
  const removeComment = useReviewCommentsStore((s) => s.removeComment);
  const resolveComment = useReviewCommentsStore((s) => s.resolveComment);
  const clearResolvedComments = useReviewCommentsStore(
    (s) => s.clearResolvedComments,
  );

  const openReviewComments = useMemo(
    () => reviewComments.filter((c) => !c.resolved),
    [reviewComments],
  );

  const reviewPills = useMemo(
    () => openReviewComments.map(reviewCommentToPill),
    [openReviewComments],
  );

  const handleRemovePill = useCallback(
    (commentId: string) => {
      removeComment(taskId, commentId);
    },
    [taskId, removeComment],
  );

  const [showPreview, setShowPreview] = useState(false);

  const previewText = useMemo(() => {
    if (!showPreview || openReviewComments.length === 0) return '';
    return (
      synthesizeReviewPrompt(openReviewComments)
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n') ?? 'No review comments'
    );
  }, [showPreview, openReviewComments]);

  const handlePillClick = useCallback(
    (commentId: string) => {
      const comment = openReviewComments.find((c) => c.id === commentId);
      if (!comment) return;
      // Diff comments — navigate to file in diff view
      if (!comment.anchor.filePath.startsWith('__message__:')) {
        const navStore = useNavigationStore.getState();
        navStore.setTaskViewMode(taskId, 'diff');
        navStore.setDiffViewSelectedFile(taskId, comment.anchor.filePath);
      }
      // message kind: no navigation yet (future)
    },
    [taskId, openReviewComments],
  );

  const handleModeChange = useCallback(
    (mode: InteractionMode) => {
      if (activeStepId) {
        setStepMode.mutate({ stepId: activeStepId, mode });
      }
    },
    [activeStepId, setStepMode],
  );

  const updateStep = useUpdateStep();
  const handleModelChange = useCallback(
    (modelPreference: ModelPreference) => {
      if (activeStepId) {
        const nextCapabilities = getModelThinkingCapabilities(
          modelPreference,
          dynamicModels,
        );
        updateStep.mutate({
          stepId: activeStepId,
          data: {
            modelPreference,
            thinkingEffort: normalizeThinkingEffortForModel({
              backend: effectiveBackend,
              model: modelPreference,
              effort: effectiveThinkingEffort,
              capabilities: nextCapabilities,
            }),
          },
        });
      }
    },
    [
      activeStepId,
      dynamicModels,
      effectiveBackend,
      effectiveThinkingEffort,
      updateStep,
    ],
  );

  const handleThinkingEffortChange = useCallback(
    (thinkingEffort: ThinkingEffort) => {
      if (activeStepId) {
        updateStep.mutate({ stepId: activeStepId, data: { thinkingEffort } });
      }
    },
    [activeStepId, updateStep],
  );

  const handleSendMessage = useCallback(
    (parts: PromptPart[]) => {
      if (task?.userCompleted) {
        clearUserCompleted.mutate(taskId);
      }

      // Append synthesized review comments to prompt
      let finalParts = parts;
      if (openReviewComments.length > 0) {
        const reviewParts = synthesizeReviewPrompt(openReviewComments);
        if (reviewParts) {
          finalParts = [...parts, ...reviewParts];
        }
        void api.preferenceMemory
          .recordEvidence({
            source: 'task-review-comment',
            taskId,
            comments: openReviewComments.map((comment) => ({
              body: comment.body,
              filePath: comment.anchor.filePath,
              lineStart: comment.anchor.lineStart,
              lineEnd: comment.anchor.lineEnd,
              presets: comment.presets,
              selectedText: comment.anchor.selectedText,
            })),
            context: {
              targetStepId: activeStepId,
            },
          })
          .catch((error: unknown) => {
            console.warn('Failed to record preference evidence', error);
          });
        // Resolve and clear all open comments after send
        for (const comment of openReviewComments) {
          resolveComment(taskId, comment.id);
        }
        clearResolvedComments(taskId);
      }

      clearPromptDraft();
      onSend(finalParts);
    },
    [
      task?.userCompleted,
      taskId,
      clearUserCompleted,
      clearPromptDraft,
      onSend,
      openReviewComments,
      resolveComment,
      clearResolvedComments,
      activeStepId,
    ],
  );

  const handleQueuePrompt = useCallback(
    (parts: PromptPart[]) => {
      let finalParts = parts;
      if (openReviewComments.length > 0) {
        const reviewParts = synthesizeReviewPrompt(openReviewComments);
        if (reviewParts) {
          finalParts = [...parts, ...reviewParts];
        }
        for (const comment of openReviewComments) {
          resolveComment(taskId, comment.id);
        }
        clearResolvedComments(taskId);
      }

      clearPromptDraft();
      onQueue(finalParts);
    },
    [
      taskId,
      clearPromptDraft,
      onQueue,
      openReviewComments,
      resolveComment,
      clearResolvedComments,
    ],
  );

  const handleStop = useCallback(async () => {
    if (queuedPrompts.length > 0) {
      setPromptDraft(
        [promptDraft, ...queuedPrompts.map((prompt) => prompt.content)]
          .filter((part) => part.trim().length > 0)
          .join('\n\n'),
      );
    }

    await onStop();
  }, [onStop, promptDraft, queuedPrompts, setPromptDraft]);

  const [inputFocused, setInputFocused] = useState(false);

  // Responsive: detect narrow composer width.
  // Below this threshold the composer switches to a stacked layout
  // with a combined mode·model chip instead of separate selectors.
  const COMPACT_BREAKPOINT = 800;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Check initial width synchronously
    setIsCompact(el.offsetWidth < COMPACT_BREAKPOINT);
    const ro = new ResizeObserver(() => {
      setIsCompact(el.offsetWidth < COMPACT_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isTaskCompleted = task?.userCompleted ?? false;

  // Allow send with just pills (no typed text), unless task is completed.
  const effectiveCanSend =
    !isTaskCompleted && (canSendMessage || openReviewComments.length > 0);

  const selectorGroup = (
    <div className="[&>button:not(:last-child)]:border-glass-border flex items-center gap-0 rounded-md [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button:not(:last-child)]:border-r">
      <ModeSelector
        value={effectiveMode}
        onChange={handleModeChange}
        backend={effectiveBackend}
        disabled={isRunning || isTaskCompleted}
        size="sm"
      />
      <ModelSelector
        value={effectiveModel}
        onChange={handleModelChange}
        models={getModelsForBackend(effectiveBackend, dynamicModels)}
        disabled={isTaskCompleted}
        size="sm"
      />
      <ThinkingSelector
        value={effectiveThinkingEffort}
        onChange={handleThinkingEffortChange}
        options={thinkingOptions}
        disabled={isRunning || isTaskCompleted || thinkingOptions.length <= 1}
        size="sm"
      />
    </div>
  );

  const tokenControls = (
    <TaskMessageUsageControls
      stepId={activeStepId}
      backend={effectiveBackend}
      contextWindow={contextWindow}
    />
  );

  return (
    <div
      ref={containerRef}
      className={clsx(
        'mx-3 mb-3 flex flex-col rounded-xl transition-shadow duration-300',
        inputFocused ? 'prompt-input-border-focused' : 'prompt-input-border',
      )}
    >
      {/* Review comment pills */}
      <ReviewPillsQueue
        pills={reviewPills}
        onRemove={handleRemovePill}
        onPillClick={handlePillClick}
        onPreview={
          openReviewComments.length > 0 ? () => setShowPreview(true) : undefined
        }
      />
      {isCompact ? (
        /* Compact stacked layout: textarea on top, combo chip + send in toolbar below */
        <div className="p-2 px-3">
          <MessageInput
            onSend={handleSendMessage}
            onQueue={handleQueuePrompt}
            onStop={handleStop}
            disabled={!effectiveCanSend}
            forceDisabled={isTaskCompleted}
            allowEmptySubmit={openReviewComments.length > 0}
            placeholder={
              isTaskCompleted
                ? 'Task is complete. Mark it active to send a follow-up.'
                : 'Send a follow-up message...'
            }
            isRunning={isRunning}
            isStopping={isStopping}
            skills={skills}
            projectRoot={projectRoot}
            value={promptDraft}
            onValueChange={setPromptDraft}
            supportsImages={backendSupportsImages(activeStep?.agentBackend)}
            projectId={task?.projectId}
            getCompletionContextBeforePrompt={getCompletionContextBeforePrompt}
            onFocusChange={setInputFocused}
            promptSnippets={footerSnippets}
            snippetVariableContext={snippetVariableContext}
            isCompact
            toolbarLeading={
              <>
                <ModeModelComboSelector
                  mode={effectiveMode}
                  onModeChange={handleModeChange}
                  model={effectiveModel}
                  onModelChange={handleModelChange}
                  thinkingEffort={effectiveThinkingEffort}
                  onThinkingEffortChange={handleThinkingEffortChange}
                  thinkingOptions={thinkingOptions}
                  backend={effectiveBackend}
                  models={getModelsForBackend(effectiveBackend, dynamicModels)}
                  disabled={isRunning || isTaskCompleted}
                />
              </>
            }
            controlsBeforeButtons={tokenControls}
            buttonSize="sm"
            textareaClassName="bg-transparent px-1 py-0 text-sm leading-[20px]"
          />
        </div>
      ) : (
        /* Wide layout: selectors + textarea + send in one row */
        <div className="flex items-center gap-2 px-3 py-2">
          <MessageInput
            onSend={handleSendMessage}
            onQueue={handleQueuePrompt}
            onStop={handleStop}
            disabled={!effectiveCanSend}
            forceDisabled={isTaskCompleted}
            allowEmptySubmit={openReviewComments.length > 0}
            placeholder={
              isTaskCompleted
                ? 'Task is complete. Mark it active to send a follow-up.'
                : 'Send a follow-up message...'
            }
            isRunning={isRunning}
            isStopping={isStopping}
            skills={skills}
            projectRoot={projectRoot}
            value={promptDraft}
            onValueChange={setPromptDraft}
            supportsImages={backendSupportsImages(activeStep?.agentBackend)}
            projectId={task?.projectId}
            getCompletionContextBeforePrompt={getCompletionContextBeforePrompt}
            onFocusChange={setInputFocused}
            promptSnippets={footerSnippets}
            snippetVariableContext={snippetVariableContext}
            controlsAboveButtons={selectorGroup}
            controlsBeforeButtons={tokenControls}
            buttonSize="sm"
            fillAvailableHeight
            textareaClassName="bg-transparent px-1 py-0 text-sm leading-[20px]"
          />
        </div>
      )}
      {showPreview && (
        <Modal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title="Review prompt preview"
          size="lg"
        >
          <pre className="bg-bg-2 text-ink-1 max-h-[60vh] overflow-auto rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap">
            {previewText}
          </pre>
        </Modal>
      )}
    </div>
  );
});

const TaskMessageUsageControls = memo(function TaskMessageUsageControls({
  stepId,
  backend,
  contextWindow,
}: {
  stepId: string | null;
  backend: AgentBackendType;
  contextWindow: number;
}) {
  const entries = useTaskMessagesStore(
    (state) =>
      (stepId ? state.steps[stepId]?.messages : undefined) ?? EMPTY_MESSAGES,
  );
  const stepTokenSummary = useMemo(
    () => getStepTokenSummary(entries),
    [entries],
  );
  const contextUsage = useContextUsage({
    entries,
    backend,
    contextWindow,
  });

  return (
    <>
      <StepTokenSummaryDisplay summary={stepTokenSummary} />
      <ContextUsageDisplay contextUsage={contextUsage} />
    </>
  );
});

function StepTokenSummaryDisplay({ summary }: { summary: StepTokenSummary }) {
  if (summary.displayTokens === 0) return null;

  const title = [
    `Step tokens: ${summary.displayTokens.toLocaleString()} tokens`,
    `Input: ${summary.inputTokens.toLocaleString()}`,
    `Output: ${summary.outputTokens.toLocaleString()}`,
    `Cache read: ${summary.cacheReadTokens.toLocaleString()}`,
    `Cache created: ${summary.cacheCreationTokens.toLocaleString()}`,
    `Raw total with cache read: ${summary.totalTokens.toLocaleString()}`,
  ].join('\n');

  return (
    <div
      className="text-ink-3 border-glass-border bg-bg-2/70 flex h-7 items-center rounded-md border px-2 text-[11px] font-medium tabular-nums"
      title={title}
    >
      {formatNumber(summary.displayTokens)} tok
    </div>
  );
}
