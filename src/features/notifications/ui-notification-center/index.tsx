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
    return <Ban className="h-4 w-4 shrink-0 text-neutral-400" />;
  }
  if (type.includes('failed')) {
    return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
  }
  return <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />;
}

function ProjectLabel({ project }: { project?: Project }) {
  if (!project) return null;
  const label = project.repoProjectName
    ? `${project.repoProjectName} / ${project.name}`
    : project.name;
  return (
    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
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
        <div className="flex shrink-0 items-center justify-end border-b border-neutral-800 px-4 py-1.5">
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-neutral-500">
            <Bell className="h-8 w-8" />
            <span className="text-sm">No notifications yet</span>
            <span className="text-xs">
              Enable pipeline tracking in project settings
            </span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 bg-neutral-900/95 px-4 py-1.5 text-[11px] font-medium tracking-wider text-neutral-500 uppercase backdrop-blur">
                {group.label}
              </div>
              {group.items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onItemClick(notification)}
                  className={clsx(
                    'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-800/60',
                    !notification.read &&
                      'border-l-2 border-l-blue-500 bg-neutral-800/30',
                  )}
                >
                  <NotificationIcon type={notification.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          'truncate text-sm',
                          notification.read
                            ? 'text-neutral-400'
                            : 'font-medium text-neutral-200',
                        )}
                      >
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-500">
                        {getRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
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
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-neutral-600" />
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
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
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
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-1.5">
        <span className="text-[11px] text-neutral-500">
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
          <div className="flex flex-col items-center gap-2 py-12 text-neutral-500">
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
              className="flex gap-2 border-b border-neutral-800/50 px-3 py-1.5 hover:bg-neutral-800/30"
            >
              <span className="shrink-0 text-neutral-600">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className="shrink-0 text-purple-400">
                {entry.namespace}
              </span>
              <span
                className={clsx(
                  'min-w-0 break-all',
                  LEVEL_COLORS[entry.level] ?? 'text-neutral-300',
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
            className="flex max-h-[70svh] w-[420px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-neutral-700">
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'notifications'
                    ? 'border-b-2 border-blue-500 text-neutral-200'
                    : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                <Bell className="h-3.5 w-3.5" />
                Notifications
                {unreadCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
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
                    ? 'border-b-2 border-blue-500 text-neutral-200'
                    : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                <Bug className="h-3.5 w-3.5" />
                Debug
                {logCount > 0 && (
                  <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none text-neutral-300">
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
