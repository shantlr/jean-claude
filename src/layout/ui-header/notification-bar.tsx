import { Bell } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/common/ui/button';
import {
  initNotificationsStore,
  useNotificationsStore,
} from '@/stores/notifications';
import { useOverlaysStore } from '@/stores/overlays';

export function NotificationBar() {
  useEffect(() => {
    initNotificationsStore();
  }, []);

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const openOverlay = useOverlaysStore((s) => s.open);

  const latestNotification = notifications[0] ?? null;

  return (
    <Button
      type="button"
      onClick={() => openOverlay('notification-center')}
      className="flex h-7 max-w-[280px] items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
    >
      <Bell className="h-3.5 w-3.5 shrink-0" />
      {unreadCount > 0 && (
        <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
          {unreadCount}
        </span>
      )}
      {latestNotification && (
        <span className="truncate text-xs">{latestNotification.title}</span>
      )}
    </Button>
  );
}
