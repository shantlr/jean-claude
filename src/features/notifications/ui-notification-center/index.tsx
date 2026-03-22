import clsx from 'clsx';
import { CheckCircle, XCircle, Ban, Bell, ExternalLink } from 'lucide-react';
import { useCallback, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { ensureUtc } from '@/lib/time';
import { useNotificationsStore } from '@/stores/notifications';
import type { AppNotification } from '@shared/notification-types';

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

export function NotificationCenterOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const notifications = useNotificationsStore((s) => s.notifications);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const groups = useMemo(() => groupByDay(notifications), [notifications]);

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
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-neutral-400" />
                <span className="text-sm font-medium text-neutral-200">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  Mark all as read
                </Button>
              )}
            </div>

            {/* List */}
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
                        onClick={() => handleItemClick(notification)}
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
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
