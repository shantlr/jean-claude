# Dismiss Notifications by ID

## Problem

Native desktop notifications stack up and persist even after the user has already responded to a permission request or answered an agent question. The notification service is fire-and-forget with no way to programmatically dismiss notifications.

## Design

### Notification Service

Add a `Map<string, Notification>` to the existing singleton `NotificationService` to track active notifications by caller-provided ID.

**API:**

- `notify(id, title, body, onClick?)` — Creates a notification tracked by `id`. If a notification with the same `id` already exists, closes it first (prevents stacking duplicates). On click, the callback fires and the notification is removed from tracking.
- `close(id)` — Programmatically dismisses and removes the notification with the given `id`. No-op if the ID doesn't exist.

### ID Convention

The agent service uses `${taskId}:${type}` as the notification ID:

| Event | ID |
|---|---|
| Permission request | `${taskId}:permission` |
| Question | `${taskId}:question` |
| Task completed/errored | `${taskId}:complete` |

### Dismissal Triggers

Only two triggers dismiss notifications:

1. **Permission responded** — `agent-service.respond()` calls `notificationService.close(`${taskId}:permission`)` after forwarding the response.
2. **Question answered** — `agent-service.respond()` calls `notificationService.close(`${taskId}:question`)` after forwarding the response.

Explicitly **not** included (by design choice):
- No dismiss-all on window focus
- No dismiss on task navigation/focus
- No dismiss on task completion

### Files Changed

1. `electron/services/notification-service.ts` — Add `Map` tracking, update `notify()` signature, add `close()` method.
2. `electron/services/agent-service.ts` — Pass IDs to `notify()` calls, add `close()` calls in `respond()`.
