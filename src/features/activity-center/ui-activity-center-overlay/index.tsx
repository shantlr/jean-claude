import {
  Ban,
  CalendarClock,
  Check,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  type CSSProperties,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';



import {
  type BackgroundJob,
  useBackgroundJobsStore,
} from '@/stores/background-jobs';
import {
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import { api } from '@/lib/api';
import type { AppNotification } from '@shared/notification-types';
import type { DebugLogEntry } from '@shared/debug-log-types';
import { formatRelativeTime } from '@/lib/time';
import type { Project } from '@shared/types';
import { useDebugLogsStore } from '@/stores/debug-logs';
import { useNotificationsStore } from '@/stores/notifications';
import { useOverlaysStore } from '@/stores/overlays';
import { useProjects } from '@/hooks/use-projects';
import { useToastStore } from '@/stores/toasts';



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'all' | 'running' | 'notifications' | 'debug';

const TAB_ORDER: Tab[] = ['all', 'running', 'notifications', 'debug'];

const TAB_LABELS: Record<Tab, string> = {
  all: 'All',
  running: 'Running',
  notifications: 'Notifications',
  debug: 'Debug',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusForNotification(
  n: AppNotification,
): 'succeeded' | 'failed' | 'cancelled' | 'info' {
  if (n.type === 'calendar-event-starting') return 'info';
  if (n.type.includes('failed')) return 'failed';
  if (n.type.includes('cancelled')) return 'cancelled';
  return 'succeeded';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function matchesSearch(text: string | null | undefined, query: string) {
  if (!text) return false;
  return text.toLowerCase().includes(query);
}

const DEBUG_LEVEL_STYLES: Record<
  DebugLogEntry['level'],
  { badge: string; text: string }
> = {
  info: {
    badge: 'border-acc/25 bg-acc/10 text-acc-ink',
    text: 'text-ink-1',
  },
  warn: {
    badge: 'border-status-run/30 bg-status-run/10 text-status-run',
    text: 'text-status-run',
  },
  error: {
    badge: 'border-status-fail/30 bg-status-fail-soft text-status-fail',
    text: 'text-status-fail',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({
  status,
}: {
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'info';
}) {
  if (status === 'running') {
    return (
      <Loader2 className="text-acc-ink h-[18px] w-[18px] shrink-0 animate-spin" />
    );
  }
  if (status === 'succeeded') {
    return (
      <CheckCircle className="text-status-done h-[18px] w-[18px] shrink-0" />
    );
  }
  if (status === 'cancelled') {
    return <Ban className="text-ink-2 h-[18px] w-[18px] shrink-0" />;
  }
  if (status === 'info') {
    return (
      <CalendarClock className="text-acc-ink h-[18px] w-[18px] shrink-0" />
    );
  }
  return <XCircle className="text-status-fail h-[18px] w-[18px] shrink-0" />;
}

function ProjectPill({
  project,
  onOpenSettings,
}: {
  project: Project | undefined;
  onOpenSettings?: (projectId: string) => void;
}) {
  if (!project) return null;

  if (onOpenSettings) {
    return (
      <button
        type="button"
        onClick={() => onOpenSettings(project.id)}
        className="bg-glass-medium hover:bg-glass-light inline-flex min-w-0 items-center rounded-full px-2 py-0.5 text-[10px] transition-colors"
        aria-label={`Open ${project.name} project settings`}
      >
        <span className="text-ink-2 truncate">{project.name}</span>
      </button>
    );
  }

  return (
    <span className="bg-glass-medium inline-flex items-center rounded-full px-2 py-0.5 text-[10px]">
      <span className="text-ink-2 truncate">{project.name}</span>
    </span>
  );
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 bg-black/[0.15] px-4 py-1.5">
      <span className="text-ink-3 text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="text-ink-4 text-[10px]">{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job Row
// ---------------------------------------------------------------------------

function JobRow({
  job,
  project,
  isSelected,
  onOpenTask,
  onOpenProjectSettings,
  onRetry,
  onCopyPrompt,
}: {
  job: BackgroundJob;
  project: Project | undefined;
  isSelected?: boolean;
  onOpenTask: (projectId: string, taskId: string) => void;
  onOpenProjectSettings: (projectId: string) => void;
  onRetry: (job: BackgroundJob) => void;
  onCopyPrompt: (prompt: string) => void;
}) {
  const isTaskCreation = job.type === 'task-creation';

  return (
    <div
      data-activity-row
      className={clsx(
        'grid grid-cols-[18px_1fr_auto] items-start gap-3 px-4 py-2.5',
        isSelected ? 'bg-glass-medium' : 'hover:bg-white/[0.03]',
      )}
    >
      <StatusIcon status={job.status} />

      <div className="min-w-0">
        <p className="text-ink-1 truncate text-[12.5px] font-medium">
          {job.title}
        </p>

        {job.status === 'failed' && job.errorMessage && (
          <p className="text-status-fail mt-0.5 font-mono text-[11px] break-words whitespace-pre-wrap">
            {job.errorMessage}
          </p>
        )}

        {isTaskCreation &&
          job.status !== 'running' &&
          job.details.promptPreview && (
            <p className="text-ink-3 mt-0.5 truncate text-[11px] italic">
              {job.details.promptPreview}
            </p>
          )}

        {job.type === 'logo-generation' && job.details.customPrompt && (
          <p className="text-ink-3 mt-0.5 truncate text-[11px] italic">
            {job.details.customPrompt}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          <ProjectPill
            project={project}
            onOpenSettings={onOpenProjectSettings}
          />

          {/* Action buttons */}
          {isTaskCreation &&
            job.status === 'succeeded' &&
            job.projectId &&
            job.taskId && (
              <button
                type="button"
                onClick={() => onOpenTask(job.projectId!, job.taskId!)}
                className="text-acc-ink hover:text-acc text-[11px] font-medium"
              >
                Open Task
              </button>
            )}

          {(isTaskCreation || job.type === 'task-deletion') &&
            job.status === 'failed' && (
              <button
                type="button"
                onClick={() => onRetry(job)}
                className="text-acc-ink hover:text-acc text-[11px] font-medium"
              >
                Retry
              </button>
            )}

          {isTaskCreation && job.details.creationInput.prompt.trim() && (
            <button
              type="button"
              onClick={() => onCopyPrompt(job.details.creationInput.prompt)}
              className="text-ink-3 hover:text-ink-1 flex items-center gap-0.5 text-[11px]"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <span className="text-ink-4 shrink-0 pt-0.5 text-[10px]">
        {formatRelativeTime(job.completedAt ?? job.createdAt)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Row
// ---------------------------------------------------------------------------

function NotificationRow({
  notification,
  project,
  isSelected,
  onClick,
}: {
  notification: AppNotification;
  project: Project | undefined;
  isSelected?: boolean;
  onClick: (n: AppNotification) => void;
}) {
  const status = statusForNotification(notification);

  return (
    <button
      type="button"
      data-activity-row
      onClick={() => onClick(notification)}
      className={clsx(
        'grid w-full cursor-pointer grid-cols-[18px_1fr_auto] items-start gap-3 px-4 py-2.5 text-left',
        isSelected
          ? 'bg-glass-medium'
          : !notification.read
            ? 'bg-white/[0.02] hover:bg-white/[0.03]'
            : 'hover:bg-white/[0.03]',
      )}
    >
      <StatusIcon status={status} />

      <div className="min-w-0">
        <p
          className={clsx(
            'truncate text-[12.5px]',
            notification.read ? 'text-ink-2' : 'text-ink-1 font-medium',
          )}
        >
          {notification.title}
        </p>
        <p className="text-ink-3 mt-0.5 text-[11px] break-words whitespace-pre-wrap">
          {notification.body}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <ProjectPill project={project} />
          {notification.sourceUrl && (
            <ExternalLink className="text-ink-4 h-3 w-3" />
          )}
        </div>
      </div>

      <span className="text-ink-4 shrink-0 pt-0.5 text-[10px]">
        {formatRelativeTime(notification.createdAt)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Debug Row
// ---------------------------------------------------------------------------

function DebugRow({
  entry,
  isSelected,
}: {
  entry: DebugLogEntry;
  isSelected?: boolean;
}) {
  const levelStyles = DEBUG_LEVEL_STYLES[entry.level];

  return (
    <div
      data-activity-row
      className={clsx(
        'grid grid-cols-[60px_44px_110px_1fr] items-start gap-2 px-4 py-1 font-mono text-[11px] leading-relaxed',
        isSelected ? 'bg-glass-medium' : 'hover:bg-white/[0.03]',
      )}
    >
      <span className="text-ink-4 shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span
        className={clsx(
          'inline-flex h-4 shrink-0 items-center justify-center rounded border px-1 text-[9px] font-semibold uppercase',
          levelStyles.badge,
        )}
      >
        {entry.level}
      </span>
      <span className="text-acc-ink shrink-0 truncate">{entry.namespace}</span>
      <span className={clsx('min-w-0 break-all', levelStyles.text)}>
        {entry.message}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ActivityCenterOverlay({
  onClose,
  initialTab = 'all',
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openOverlay = useOverlaysStore((s) => s.open);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const searchLower = search.toLowerCase();

  // --- Store data ---
  const jobs = useBackgroundJobsStore((s) => s.jobs);
  const markJobRunning = useBackgroundJobsStore((s) => s.markJobRunning);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const clearFinished = useBackgroundJobsStore((s) => s.clearFinished);

  const notifications = useNotificationsStore((s) => s.notifications);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);

  const debugLogs = useDebugLogsStore((s) => s.logs);
  const clearDebugLogs = useDebugLogsStore((s) => s.clear);

  const addToast = useToastStore((s) => s.addToast);

  const { data: projects } = useProjects();
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    if (projects) {
      for (const p of projects) map.set(p.id, p);
    }
    return map;
  }, [projects]);

  // --- Derived lists ---
  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === 'running'),
    [jobs],
  );
  const finishedJobs = useMemo(
    () => jobs.filter((j) => j.status !== 'running'),
    [jobs],
  );

  // Filtered data per search
  const filteredRunningJobs = useMemo(
    () =>
      searchLower
        ? runningJobs.filter((j) => matchesSearch(j.title, searchLower))
        : runningJobs,
    [runningJobs, searchLower],
  );
  const filteredFinishedJobs = useMemo(
    () =>
      searchLower
        ? finishedJobs.filter((j) => matchesSearch(j.title, searchLower))
        : finishedJobs,
    [finishedJobs, searchLower],
  );
  const filteredNotifications = useMemo(
    () =>
      searchLower
        ? notifications.filter(
            (n) =>
              matchesSearch(n.title, searchLower) ||
              matchesSearch(n.body, searchLower),
          )
        : notifications,
    [notifications, searchLower],
  );
  const filteredDebugLogs = useMemo(
    () =>
      searchLower
        ? debugLogs.filter(
            (l) =>
              matchesSearch(l.message, searchLower) ||
              matchesSearch(l.namespace, searchLower) ||
              matchesSearch(l.level, searchLower) ||
              matchesSearch(formatTimestamp(l.timestamp), searchLower),
          )
        : debugLogs,
    [debugLogs, searchLower],
  );

  // Tab counts
  const tabCounts: Record<Tab, number> = useMemo(
    () => ({
      all: jobs.length + notifications.length,
      running: runningJobs.length,
      notifications: notifications.length,
      debug: debugLogs.length,
    }),
    [jobs.length, notifications.length, runningJobs.length, debugLogs.length],
  );

  // Item count for current view
  const currentItemCount = useMemo(() => {
    switch (activeTab) {
      case 'all':
        return (
          filteredRunningJobs.length +
          filteredFinishedJobs.length +
          filteredNotifications.length
        );
      case 'running':
        return filteredRunningJobs.length;
      case 'notifications':
        return filteredNotifications.length;
      case 'debug':
        return filteredDebugLogs.length;
    }
  }, [
    activeTab,
    filteredRunningJobs,
    filteredFinishedJobs,
    filteredNotifications,
    filteredDebugLogs,
  ]);

  // --- Keyboard navigation ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Build the flat list of selectable row IDs for current tab
  const selectableItems = useMemo(() => {
    if (activeTab === 'debug')
      return filteredDebugLogs.map((l) => `debug-${l.id}`);
    const items: string[] = [];
    const showRunning = activeTab === 'all' || activeTab === 'running';
    const showFinished = activeTab === 'all';
    const showNotifs = activeTab === 'all' || activeTab === 'notifications';
    if (showRunning)
      items.push(...filteredRunningJobs.map((j) => `job-${j.id}`));
    if (showFinished)
      items.push(...filteredFinishedJobs.map((j) => `job-${j.id}`));
    if (showNotifs)
      items.push(...filteredNotifications.map((n) => `notif-${n.id}`));
    return items;
  }, [
    activeTab,
    filteredRunningJobs,
    filteredFinishedJobs,
    filteredNotifications,
    filteredDebugLogs,
  ]);

  // Reset selection when tab or search changes
  useEffect(() => {
    startTransition(() => setSelectedIndex(-1));
  }, [activeTab, search]);

  const scrollToSelected = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('[data-activity-row]');
    const row = rows[index] as HTMLElement | undefined;
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const cycleTab = useCallback(
    (direction: 1 | -1) => {
      const currentIdx = TAB_ORDER.indexOf(activeTab);
      const nextIdx =
        (currentIdx + direction + TAB_ORDER.length) % TAB_ORDER.length;
      setActiveTab(TAB_ORDER[nextIdx]);
    },
    [activeTab],
  );

  useRegisterKeyboardBindings(
    'activity-center-overlay',
    {
      escape: () => {
        onClose();
        return true;
      },
      left: {
        handler: () => {
          cycleTab(-1);
          return true;
        },
        ignoreIfInput: true,
      },
      right: {
        handler: () => {
          cycleTab(1);
          return true;
        },
        ignoreIfInput: true,
      },
      tab: () => {
        cycleTab(1);
        return true;
      },
      'shift+tab': () => {
        cycleTab(-1);
        return true;
      },
      down: () => {
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, selectableItems.length - 1);
          scrollToSelected(next);
          return next;
        });
        return true;
      },
      up: () => {
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, -1);
          if (next >= 0) scrollToSelected(next);
          return next;
        });
        return true;
      },
      enter: () => {
        if (selectedIndex < 0 || selectedIndex >= selectableItems.length)
          return false;
        const id = selectableItems[selectedIndex];
        if (id.startsWith('job-')) {
          const jobId = id.slice(4);
          const job = jobs.find((j) => j.id === jobId);
          if (
            job?.type === 'task-creation' &&
            job.status === 'succeeded' &&
            job.projectId &&
            job.taskId
          ) {
            handleOpenTask(job.projectId, job.taskId);
          }
        } else if (id.startsWith('notif-')) {
          const notifId = id.slice(6);
          const notif = notifications.find((n) => n.id === notifId);
          if (notif) handleNotificationClick(notif);
        }
        return true;
      },
    },
    { layer },
  );

  // --- Handlers ---
  const handleOpenTask = useCallback(
    (projectId: string, taskId: string) => {
      void navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: { projectId, taskId },
      });
      onClose();
    },
    [navigate, onClose],
  );

  const handleOpenProjectSettings = useCallback(
    (projectId: string) => {
      void navigate({
        to: '/projects/$projectId',
        params: { projectId },
      }).finally(() => {
        openOverlay('settings');
      });
    },
    [navigate, openOverlay],
  );

  const handleRetry = useCallback(
    async (job: BackgroundJob) => {
      markJobRunning(job.id);
      try {
        if (job.type === 'task-creation') {
          const result = await api.tasks.createWithWorktree({
            ...job.details.creationInput,
            updatedAt: new Date().toISOString(),
          });
          markJobSucceeded(job.id, {
            taskId: result.id,
            projectId: result.projectId,
          });
        } else if (job.type === 'task-deletion' && job.taskId) {
          await api.tasks.delete(job.taskId, {
            deleteWorktree: job.details.deleteWorktree,
          });
          markJobSucceeded(job.id);
        }
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      } catch (err) {
        markJobFailed(
          job.id,
          err instanceof Error ? err.message : 'Retry failed',
        );
      }
    },
    [markJobRunning, markJobSucceeded, markJobFailed, queryClient],
  );

  const handleCopyPrompt = useCallback(
    (prompt: string) => {
      void navigator.clipboard.writeText(prompt);
      addToast({ message: 'Prompt copied to clipboard', type: 'success' });
    },
    [addToast],
  );

  const handleNotificationClick = useCallback(
    (notification: AppNotification) => {
      if (!notification.read) {
        void markAsRead(notification.id);
      }
      if (notification.sourceUrl) {
        window.open(notification.sourceUrl, '_blank');
      }
    },
    [markAsRead],
  );

  const handleClear = useCallback(() => {
    switch (activeTab) {
      case 'debug':
        clearDebugLogs();
        break;
      case 'notifications':
        void markAllAsRead();
        break;
      case 'running':
        // Nothing to clear for running jobs
        break;
      case 'all':
        clearFinished();
        void markAllAsRead();
        break;
    }
  }, [activeTab, clearDebugLogs, clearFinished, markAllAsRead]);

  // --- Render helpers ---
  function isRowSelected(itemId: string) {
    return selectedIndex >= 0 && selectableItems[selectedIndex] === itemId;
  }

  function renderJobRow(job: BackgroundJob) {
    return (
      <JobRow
        key={job.id}
        job={job}
        project={job.projectId ? projectMap.get(job.projectId) : undefined}
        isSelected={isRowSelected(`job-${job.id}`)}
        onOpenTask={handleOpenTask}
        onOpenProjectSettings={handleOpenProjectSettings}
        onRetry={handleRetry}
        onCopyPrompt={handleCopyPrompt}
      />
    );
  }

  function renderNotifRow(n: AppNotification) {
    return (
      <NotificationRow
        key={n.id}
        notification={n}
        project={n.projectId ? projectMap.get(n.projectId) : undefined}
        isSelected={isRowSelected(`notif-${n.id}`)}
        onClick={handleNotificationClick}
      />
    );
  }

  function renderAllTab() {
    const hasRunning = filteredRunningJobs.length > 0;
    const hasFinished = filteredFinishedJobs.length > 0;
    const hasNotifications = filteredNotifications.length > 0;
    const hasAny = hasRunning || hasFinished || hasNotifications;

    if (!hasAny) {
      return renderEmpty('No activity yet');
    }

    return (
      <>
        {hasRunning && (
          <>
            <SectionDivider
              label="Running"
              count={filteredRunningJobs.length}
            />
            {filteredRunningJobs.map(renderJobRow)}
          </>
        )}
        {hasFinished && (
          <>
            <SectionDivider
              label="Completed"
              count={filteredFinishedJobs.length}
            />
            {filteredFinishedJobs.map(renderJobRow)}
          </>
        )}
        {hasNotifications && (
          <>
            <SectionDivider
              label="Notifications"
              count={filteredNotifications.length}
            />
            {filteredNotifications.map(renderNotifRow)}
          </>
        )}
      </>
    );
  }

  function renderRunningTab() {
    if (filteredRunningJobs.length === 0) {
      return renderEmpty('No running jobs');
    }
    return filteredRunningJobs.map(renderJobRow);
  }

  function renderNotificationsTab() {
    if (filteredNotifications.length === 0) {
      return renderEmpty('No notifications');
    }
    return filteredNotifications.map(renderNotifRow);
  }

  function renderDebugTab() {
    if (filteredDebugLogs.length === 0) {
      return renderEmpty('No debug logs');
    }
    return filteredDebugLogs.map((entry) => (
      <DebugRow
        key={entry.id}
        entry={entry}
        isSelected={isRowSelected(`debug-${entry.id}`)}
      />
    ));
  }

  function renderEmpty(message: string) {
    return (
      <div className="text-ink-3 flex flex-col items-center gap-1 py-16 text-sm">
        <Check className="text-ink-4 mb-1 h-6 w-6" />
        {message}
      </div>
    );
  }

  function renderBody() {
    switch (activeTab) {
      case 'all':
        return renderAllTab();
      case 'running':
        return renderRunningTab();
      case 'notifications':
        return renderNotificationsTab();
      case 'debug':
        return renderDebugTab();
    }
  }

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-12"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onClick={onClose}
          tabIndex={-1}
        >
          <div
            className="border-glass-border-strong bg-bg-0/[0.96] flex max-h-[70svh] w-[640px] flex-col overflow-hidden rounded-xl border shadow-[0_24px_60px_-12px_oklch(0_0_0/0.6)] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tab bar */}
            <div className="border-glass-border-strong flex shrink-0 items-center border-b">
              <div className="flex flex-1 items-center">
                {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      'relative flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium transition-colors',
                      activeTab === tab
                        ? 'text-ink-1'
                        : 'text-ink-3 hover:text-ink-2',
                    )}
                  >
                    {TAB_LABELS[tab]}
                    {tabCounts[tab] > 0 && (
                      <span
                        className={clsx(
                          'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                          activeTab === tab
                            ? 'bg-acc/20 text-acc-ink'
                            : 'bg-glass-medium text-ink-3',
                        )}
                      >
                        {tabCounts[tab]}
                      </span>
                    )}
                    {activeTab === tab && (
                      <span className="bg-acc absolute right-2 bottom-0 left-2 h-[2px] rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleClear}
                className="text-ink-3 hover:text-ink-1 mr-3 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search / filter strip */}
            <div className="flex items-center gap-2 bg-black/[0.15] px-4 py-2">
              <Search className="text-ink-3 h-3.5 w-3.5 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === 'debug' ? 'Filter debug logs...' : 'Filter...'
                }
                className="text-ink-1 placeholder:text-ink-4 flex-1 bg-transparent text-[12.5px] outline-none"
              />
              <span className="text-ink-4 shrink-0 text-[10px]">
                {currentItemCount} item{currentItemCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {renderBody()}
            </div>

            {/* Footer */}
            <div className="border-glass-border-strong flex shrink-0 items-center justify-between border-t px-4 py-2">
              <div className="text-ink-4 flex items-center gap-3 text-[10px]">
                <span>
                  <kbd className="bg-glass-medium rounded px-1 py-0.5 font-mono text-[10px]">
                    ⇥
                  </kbd>{' '}
                  Tab
                </span>
                <span>
                  <kbd className="bg-glass-medium rounded px-1 py-0.5 font-mono text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  Navigate
                </span>
                <span>
                  <kbd className="bg-glass-medium rounded px-1 py-0.5 font-mono text-[10px]">
                    ↵
                  </kbd>{' '}
                  Open
                </span>
              </div>
              <span className="text-ink-4 text-[10px]">
                {currentItemCount} item{currentItemCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
