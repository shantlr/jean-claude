import { Notification } from 'electron';

class NotificationService {
  private active = new Map<string, Notification>();

  notify({
    id,
    title,
    body,
    onClick,
  }: {
    id: string;
    title: string;
    body: string;
    onClick?: () => void;
  }): void {
    this.close(id);

    const notification = new Notification({ title, body });

    notification.on('close', () => this.active.delete(id));

    if (onClick) {
      notification.on('click', () => {
        onClick();
        this.close(id);
      });
    }

    notification.show();
    this.active.set(id, notification);
  }

  close(id: string): void {
    const notification = this.active.get(id);
    if (notification) {
      notification.close();
      this.active.delete(id);
    }
  }

  closeForTask(taskId: string): void {
    const prefix = `${taskId}:`;
    for (const id of [...this.active.keys()]) {
      if (id.startsWith(prefix)) {
        this.close(id);
      }
    }
  }
}

export const notificationService = new NotificationService();
