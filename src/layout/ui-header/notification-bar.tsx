import { Bell } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
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
      variant="ghost"
      size="sm"
      onClick={() => openOverlay('notification-center')}
      className="max-w-[280px]"
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
      <Kbd shortcut="cmd+shift+j" className="shrink-0 text-[9px]" />
    </Button>
  );
}
