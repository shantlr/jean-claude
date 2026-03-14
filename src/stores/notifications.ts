import { create } from 'zustand';

import { api } from '@/lib/api';
import type { AppNotification } from '@shared/notification-types';

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;

  loadNotifications: () => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: async () => {
    const notifications = await api.notifications.list();
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  },

  addNotification: (notification) => {
    set((state) => {
      const notifications = [notification, ...state.notifications];
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAsRead: async (id) => {
    await api.notifications.markRead(id);
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAllAsRead: async () => {
    await api.notifications.markRead('all');
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  removeNotification: async (id) => {
    await api.notifications.delete(id);
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },
}));

let initialized = false;
export function initNotificationsStore() {
  if (initialized) return;
  initialized = true;

  const store = useNotificationsStore.getState();
  store.loadNotifications();

  api.notifications.onNew((notification) => {
    useNotificationsStore.getState().addNotification(notification);
  });
}
