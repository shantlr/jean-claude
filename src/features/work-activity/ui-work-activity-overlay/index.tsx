import clsx from 'clsx';
import {
  Activity,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitPullRequest,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { useWorkActivity } from '@/hooks/use-work-activity';
import { useToastStore } from '@/stores/toasts';
import type { WorkActivityEvent } from '@shared/work-activity-types';
import {
  getWeekRange,
  groupWorkActivityEvents,
} from '@shared/work-activity-utils';

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const weekLabelFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

function shiftWeek(date: Date, direction: -1 | 1) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + direction * 7);
  return next;
}

function formatDay(date: string) {
  return dayFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function formatWeekLabel(range: { start: string; end: string }) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${weekLabelFormatter.format(start)} - ${weekLabelFormatter.format(end)}`;
}

function formatEventType(type: WorkActivityEvent['type']) {
  if (type === 'task_prompted') return 'Task prompt';
  if (type === 'pr_comment_added') return 'PR comment';
  return 'PR approved';
}

function getWorkItemLabel(workItemId: string) {
  return workItemId === 'no-work-item'
    ? 'No work item'
    : `Work item ${workItemId}`;
}

function getEventLabel(event: WorkActivityEvent) {
  if (event.taskTitle) return event.taskTitle;
  if (event.pullRequest?.title) return event.pullRequest.title;
  if (event.promptSnippet) return event.promptSnippet;
  return formatEventType(event.type);
}

function formatCompactMarkdown(events: WorkActivityEvent[]) {
  const grouped = groupWorkActivityEvents(events);
  if (grouped.length === 0) return 'No work activity recorded.';

  return grouped
    .map((day) => {
      const lines = [`## ${formatDay(day.date)}`];
      for (const project of day.projects) {
        lines.push(`- ${project.projectName ?? 'Unknown project'}`);
        for (const workItem of project.workItems) {
          const eventSummary = workItem.events
            .map((event) => formatEventType(event.type))
            .join(', ');
          lines.push(
            `  - ${getWorkItemLabel(workItem.workItemId)}: ${eventSummary}`,
          );
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function uniqueCount<T>(items: T[]) {
  return new Set(items.filter(Boolean)).size;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="text-ink-0 text-lg font-semibold tabular-nums">
        {value}
      </div>
      <div className="text-ink-3 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

export function WorkActivityOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  const addToast = useToastStore((state) => state.addToast);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const [rawCopied, setRawCopied] = useState(false);
  const range = useMemo(
    () => getWeekRange(selectedDate.toISOString()),
    [selectedDate],
  );
  const { data: events = [], isLoading, isError } = useWorkActivity(range);
  const grouped = useMemo(() => groupWorkActivityEvents(events), [events]);
  const metrics = useMemo(
    () => ({
      events: events.length,
      projects: uniqueCount(events.map((event) => event.projectId)),
      workItems: uniqueCount(events.flatMap((event) => event.workItemIds)),
      prs: uniqueCount(
        events.map((event) => event.pullRequest?.pullRequestId ?? null),
      ),
      tasks: uniqueCount(events.map((event) => event.taskId)),
    }),
    [events],
  );

  useCommands(
    'work-activity-overlay',
    [
      {
        shortcut: 'escape',
        label: 'Close Work Activity Overlay',
        handler: onClose,
        hideInCommandPalette: true,
      },
    ],
    { layer },
  );

  async function copyTimesheet() {
    try {
      await navigator.clipboard.writeText(formatCompactMarkdown(events));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      addToast({ type: 'success', message: 'Timesheet copied to clipboard' });
    } catch {
      addToast({ type: 'error', message: 'Failed to copy timesheet' });
    }
  }

  async function copyRawJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
      setRawCopied(true);
      window.setTimeout(() => setRawCopied(false), 1400);
      addToast({ type: 'success', message: 'Raw activity JSON copied' });
    } catch {
      addToast({ type: 'error', message: 'Failed to copy raw JSON' });
    }
  }

  return createPortal(
    <FocusLock returnFocus>
      <div
        className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/55 px-4 pt-[54px] backdrop-blur-md sm:px-6"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="work-activity-title"
          className="border-glass-border shadow-modal text-ink-0 relative flex h-[min(760px,calc(100vh-70px))] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border bg-[#101018]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute -top-28 right-8 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="pointer-events-none absolute top-28 left-12 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="border-glass-border relative border-b bg-gradient-to-b from-sky-400/10 to-transparent px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/15 text-sky-200 shadow-[0_0_30px_rgba(56,189,248,0.18)]">
                <Activity className="h-4 w-4" />
              </div>
              <div className="min-w-[180px] flex-1">
                <div
                  id="work-activity-title"
                  className="text-ink-0 text-base font-semibold tracking-[-0.03em]"
                >
                  Work Activity
                </div>
                <div className="text-ink-3 text-xs">
                  Weekly record of task prompts, PR comments, and approvals.
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-black/15 p-1">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<ChevronLeft />}
                  tooltip="Previous week"
                  onClick={() => setSelectedDate((date) => shiftWeek(date, -1))}
                />
                <div className="text-ink-1 min-w-32 px-2 text-center text-xs font-semibold tabular-nums">
                  {formatWeekLabel(range)}
                </div>
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<ChevronRight />}
                  tooltip="Next week"
                  onClick={() => setSelectedDate((date) => shiftWeek(date, 1))}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyTimesheet}
                disabled={events.length === 0}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy Timesheet
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyRawJson}
                disabled={events.length === 0}
              >
                {rawCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy JSON
              </Button>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                icon={<X />}
                tooltip="Close"
              />
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-5">
              <Metric label="Events" value={metrics.events} />
              <Metric label="Projects" value={metrics.projects} />
              <Metric label="Work items" value={metrics.workItems} />
              <Metric label="PRs" value={metrics.prs} />
              <Metric label="Tasks" value={metrics.tasks} />
            </div>

            <div className="mt-3 space-y-3">
              {isLoading ? (
                <div className="text-ink-3 flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm">
                  Loading work activity...
                </div>
              ) : isError ? (
                <div className="text-status-fail flex h-56 items-center justify-center rounded-2xl border border-dashed border-red-400/20 text-sm">
                  Failed to load work activity.
                </div>
              ) : grouped.length === 0 ? (
                <div className="text-ink-3 flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm">
                  No work activity recorded for this week.
                </div>
              ) : (
                grouped.map((day) => (
                  <section
                    key={day.date}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-3"
                  >
                    <div className="text-ink-0 mb-3 text-sm font-semibold">
                      {formatDay(day.date)}
                    </div>
                    <div className="space-y-3">
                      {day.projects.map((project) => (
                        <div key={project.projectId} className="space-y-2">
                          <div className="text-ink-2 text-xs font-semibold">
                            {project.projectName ?? 'Unknown project'}
                          </div>
                          <div className="space-y-2">
                            {project.workItems.map((workItem) => (
                              <div
                                key={workItem.workItemId}
                                className="rounded-xl border border-white/8 bg-black/15 p-3"
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-ink-1 text-xs font-semibold">
                                    {getWorkItemLabel(workItem.workItemId)}
                                  </div>
                                  <div className="text-ink-4 text-[11px] tabular-nums">
                                    {workItem.events.length} event
                                    {workItem.events.length === 1 ? '' : 's'}
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  {workItem.events.map((event) => (
                                    <div
                                      key={event.id}
                                      className="flex items-start gap-2 text-xs"
                                    >
                                      <span className="text-ink-4 w-16 shrink-0 pt-0.5 tabular-nums">
                                        {timeFormatter.format(
                                          new Date(event.occurredAt),
                                        )}
                                      </span>
                                      <span
                                        className={clsx(
                                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                          event.type === 'task_prompted'
                                            ? 'bg-sky-300'
                                            : 'bg-emerald-300',
                                        )}
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="text-ink-2 font-medium">
                                          {formatEventType(event.type)}
                                        </span>
                                        <span className="text-ink-4 mx-1">
                                          -
                                        </span>
                                        <span className="text-ink-1">
                                          {getEventLabel(event)}
                                        </span>
                                      </span>
                                      {event.pullRequest?.url ? (
                                        <a
                                          className="text-ink-3 hover:text-ink-0 shrink-0"
                                          href={event.pullRequest.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Open PR"
                                        >
                                          <GitPullRequest className="h-3.5 w-3.5" />
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </FocusLock>,
    document.body,
  );
}
