import clsx from 'clsx';
import {
  CheckCircle,
  XCircle,
  Ban,
  Bell,
  ExternalLink,
  Bug,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { useProjects } from '@/hooks/use-projects';
import { ensureUtc } from '@/lib/time';
import { useDebugLogsStore } from '@/stores/debug-logs';
import { useNotificationsStore } from '@/stores/notifications';
import type { AppNotification } from '@shared/notification-types';
import type { Project } from '@shared/types';

type Tab = 'notifications' | 'debug';

function getRelativeTime(dateStr: string): string {
  const date = new Date(ensureUtc(dateStr));
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function groupByDay(notifications: AppNotification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: AppNotification[] }[] = [];
  const todayItems: AppNotification[] = [];
  const yesterdayItems: AppNotification[] = [];
  const olderItems: AppNotification[] = [];

  for (const n of notifications) {
    const date = new Date(ensureUtc(n.createdAt));
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) todayItems.push(n);
    else if (date.getTime() === yesterday.getTime()) yesterdayItems.push(n);
    else olderItems.push(n);
  }

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length)
    groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (olderItems.length) groups.push({ label: 'Older', items: olderItems });

  return groups;
}

function NotificationIcon({ type }: { type: string }) {
  if (type.includes('cancelled')) {
    return <Ban className="text-ink-2 h-4 w-4 shrink-0" />;
  }
  if (type.includes('failed')) {
    return <XCircle className="text-status-fail h-4 w-4 shrink-0" />;
  }
  return <CheckCircle className="text-status-done h-4 w-4 shrink-0" />;
}

function ProjectLabel({ project }: { project?: Project }) {
  if (!project) return null;
  const label = project.repoProjectName
    ? `${project.repoProjectName} / ${project.name}`
    : project.name;
  return (
    <p className="text-ink-3 mt-0.5 truncate text-[11px]">
      <span
        className="mr-1.5 inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: project.color }}
      />
      {label}
    </p>
  );
}

function NotificationsTab({
  onItemClick,
}: {
  onItemClick: (n: AppNotification) => void;
}) {
  const notifications = useNotificationsStore((s) => s.notifications);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const { data: projects } = useProjects();

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    if (projects) {
      for (const p of projects) map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const groups = useMemo(() => groupByDay(notifications), [notifications]);

  return (
    <>
      {unreadCount > 0 && (
        <div className="border-line-soft flex shrink-0 items-center justify-end border-b px-4 py-1.5">
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="text-ink-3 flex flex-col items-center gap-2 py-12">
            <Bell className="h-8 w-8" />
            <span className="text-sm">No notifications yet</span>
            <span className="text-xs">
              Enable pipeline tracking in project settings
            </span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="bg-bg-0/95 text-ink-3 sticky top-0 px-4 py-1.5 text-[11px] font-medium tracking-wider uppercase backdrop-blur">
                {group.label}
              </div>
              {group.items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onItemClick(notification)}
                  className={clsx(
                    'hover:bg-bg-1/60 flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors',
                    !notification.read &&
                      'bg-bg-1/30 border-l-2 border-l-blue-500',
                  )}
                >
                  <NotificationIcon type={notification.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          'truncate text-sm',
                          notification.read
                            ? 'text-ink-2'
                            : 'text-ink-1 font-medium',
                        )}
                      >
                        {notification.title}
                      </span>
                      <span className="text-ink-3 shrink-0 text-[11px]">
                        {getRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-ink-3 mt-0.5 truncate text-xs">
                      {notification.body}
                    </p>
                    <ProjectLabel
                      project={
                        notification.projectId
                          ? projectMap.get(notification.projectId)
                          : undefined
                      }
                    />
                  </div>
                  {notification.sourceUrl && (
                    <ExternalLink className="text-ink-4 mt-0.5 h-3 w-3 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-acc-ink',
  warn: 'text-status-run',
  error: 'text-status-fail',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function DebugTab() {
  const logs = useDebugLogsStore((s) => s.logs);
  const clear = useDebugLogsStore((s) => s.clear);

  return (
    <>
      <div className="border-line-soft flex shrink-0 items-center justify-between border-b px-4 py-1.5">
        <span className="text-ink-3 text-[11px]">
          {logs.length} log{logs.length !== 1 ? 's' : ''}
        </span>
        {logs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-ink-3 flex flex-col items-center gap-2 py-12">
            <Bug className="h-8 w-8" />
            <span className="font-sans text-sm">No debug logs yet</span>
            <span className="font-sans text-xs">
              Logs from the main process will appear here
            </span>
          </div>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.id}
              className="border-line-soft/50 hover:bg-bg-1/30 flex gap-2 border-b px-3 py-1.5"
            >
              <span className="text-ink-4 shrink-0">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className="text-acc-ink shrink-0">{entry.namespace}</span>
              <span
                className={clsx(
                  'min-w-0 break-all',
                  LEVEL_COLORS[entry.level] ?? 'text-ink-1',
                )}
              >
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function NotificationCenterOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('notifications');
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const logCount = useDebugLogsStore((s) => s.logs.length);

  useRegisterKeyboardBindings('notification-center', {
    escape: () => {
      onClose();
      return true;
    },
  });

  const handleItemClick = useCallback(
    (notification: AppNotification) => {
      if (!notification.read) {
        markAsRead(notification.id);
      }
      if (notification.sourceUrl) {
        window.open(notification.sourceUrl, '_blank');
      }
    },
    [markAsRead],
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-start justify-end pt-12 pr-4"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onClick={handleBackdropClick}
          tabIndex={-1}
        >
          <div
            className="border-glass-border bg-bg-0 flex max-h-[70svh] w-[420px] flex-col overflow-hidden rounded-lg border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tab bar */}
            <div className="border-glass-border flex shrink-0 border-b">
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'notifications'
                    ? 'border-acc text-ink-1 border-b-2'
                    : 'text-ink-3 hover:text-ink-1',
                )}
              >
                <Bell className="h-3.5 w-3.5" />
                Notifications
                {unreadCount > 0 && (
                  <span className="bg-acc text-ink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('debug')}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'debug'
                    ? 'border-acc text-ink-1 border-b-2'
                    : 'text-ink-3 hover:text-ink-1',
                )}
              >
                <Bug className="h-3.5 w-3.5" />
                Debug
                {logCount > 0 && (
                  <span className="text-ink-1 bg-glass-medium rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                    {logCount}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'notifications' ? (
              <NotificationsTab onItemClick={handleItemClick} />
            ) : (
              <DebugTab />
            )}
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
