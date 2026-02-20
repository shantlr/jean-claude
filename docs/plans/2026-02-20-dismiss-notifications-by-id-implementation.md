# Dismiss Notifications by ID Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow programmatic dismissal of native desktop notifications so answered permission/question notifications don't stack.

**Architecture:** Add a `Map<string, Notification>` to the existing singleton `NotificationService` for tracking. The agent service passes `${taskId}:${type}` IDs when creating notifications and calls `close()` when responding.

**Tech Stack:** Electron `Notification` API, TypeScript

---

### Task 1: Add ID-based tracking to NotificationService

**Files:**
- Modify: `electron/services/notification-service.ts`

**Step 1: Update notification-service.ts**

Replace the entire file with:

```typescript
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
}

export const notificationService = new NotificationService();
```

**Step 2: Run lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS (this file has no imports from renderer, no test dependencies)

**Step 3: Commit**

```bash
git add electron/services/notification-service.ts
git commit -m "feat: add ID-based tracking to notification service"
```

---

### Task 2: Pass IDs from agent-service and dismiss on respond

**Files:**
- Modify: `electron/services/agent-service.ts`

**Step 1: Update permission-request notification (line ~376)**

Change:

```typescript
          notificationService.notify(
            'Permission Required',
            `Task "${task?.name || 'Unknown'}" needs approval for ${request.toolName}`,
            () => {
              this.mainWindow?.focus();
            },
          );
```

To:

```typescript
          notificationService.notify({
            id: `${taskId}:permission`,
            title: 'Permission Required',
            body: `Task "${task?.name || 'Unknown'}" needs approval for ${request.toolName}`,
            onClick: () => {
              this.mainWindow?.focus();
            },
          });
```

**Step 2: Update question notification (line ~419)**

Change:

```typescript
          notificationService.notify(
            'Question from Agent',
            `Task "${task?.name || 'Unknown'}" has a question`,
            () => {
              this.mainWindow?.focus();
            },
          );
```

To:

```typescript
          notificationService.notify({
            id: `${taskId}:question`,
            title: 'Question from Agent',
            body: `Task "${task?.name || 'Unknown'}" has a question`,
            onClick: () => {
              this.mainWindow?.focus();
            },
          });
```

**Step 3: Update completion notification (line ~479)**

Change:

```typescript
          notificationService.notify(
            status === 'completed' ? 'Task Completed' : 'Task Failed',
            `Task "${updatedTask?.name || 'Unknown'}" ${status === 'completed' ? 'finished successfully' : 'encountered an error'}`,
            () => {
              this.mainWindow?.focus();
            },
          );
```

To:

```typescript
          notificationService.notify({
            id: `${taskId}:complete`,
            title: status === 'completed' ? 'Task Completed' : 'Task Failed',
            body: `Task "${updatedTask?.name || 'Unknown'}" ${status === 'completed' ? 'finished successfully' : 'encountered an error'}`,
            onClick: () => {
              this.mainWindow?.focus();
            },
          });
```

**Step 4: Add dismiss call in respond() (after forwarding response to backend, ~line 667)**

After the existing line:

```typescript
    await TaskRepository.update(taskId, { status: 'running' });
    this.emitEvent(taskId, { type: 'status', status: 'running' });
```

Add:

```typescript
    notificationService.close(`${taskId}:${request.type}`);
```

**Step 5: Run lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat: dismiss notifications when permission/question responded"
```
