import { Notification } from 'electron';

class NotificationService {
  notify(title: string, body: string, onClick?: () => void): void {
    const notification = new Notification({
      title,
      body,
    });

    if (onClick) {
      notification.on('click', onClick);
    }

    notification.show();
  }
}

export const notificationService = new NotificationService();
