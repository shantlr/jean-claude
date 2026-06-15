import { BrowserWindow, type WebContents } from 'electron';

import {
  getCacheEventResourceKeys,
  matchesCacheSubscription,
  type CacheEvent,
  type CacheSubscription,
  type CacheSubscriptionUpdate,
} from '@shared/cache-events';
import type { Task, TaskStep } from '@shared/types';

const subscriptionsByWebContentsId = new Map<number, CacheSubscription[]>();
const subscriptionRevisionByWebContentsId = new Map<number, number>();
const trackedWebContentsIds = new Set<number>();

// Each renderer window declares which cache resources it currently observes.
// Main uses this registry to avoid broadcasting every cache event to every window.
export function setCacheSubscriptions(
  webContents: WebContents,
  update: CacheSubscriptionUpdate,
) {
  const currentRevision = subscriptionRevisionByWebContentsId.get(
    webContents.id,
  );

  if (currentRevision !== undefined && update.revision < currentRevision) {
    return;
  }

  subscriptionRevisionByWebContentsId.set(webContents.id, update.revision);
  subscriptionsByWebContentsId.set(webContents.id, update.subscriptions);

  if (!trackedWebContentsIds.has(webContents.id)) {
    trackedWebContentsIds.add(webContents.id);
    webContents.once('destroyed', () => {
      trackedWebContentsIds.delete(webContents.id);
      subscriptionsByWebContentsId.delete(webContents.id);
      subscriptionRevisionByWebContentsId.delete(webContents.id);
    });
  }
}

export function clearCacheSubscriptions(webContents: WebContents) {
  subscriptionsByWebContentsId.delete(webContents.id);
  subscriptionRevisionByWebContentsId.delete(webContents.id);
}

export function shouldSendCacheEvent(
  subscriptions: CacheSubscription[],
  event: CacheEvent,
) {
  const resourceKeys = getCacheEventResourceKeys(event);
  return subscriptions.some((subscription) =>
    resourceKeys.some((resourceKey) =>
      matchesCacheSubscription(subscription, resourceKey),
    ),
  );
}

export function emitCacheEvent(event: CacheEvent): CacheEvent {
  const windows = BrowserWindow?.getAllWindows?.() ?? [];
  for (const win of windows) {
    const subscriptions = subscriptionsByWebContentsId.get(win.webContents.id);

    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      if (subscriptions && shouldSendCacheEvent(subscriptions, event)) {
        win.webContents.send('cache:event', event);
      }
    }
  }

  return event;
}

export function emitTaskUpsert(task: Task, previousProjectId?: string) {
  return emitCacheEvent({ type: 'task.upsert', task, previousProjectId });
}

export function emitTaskPatch({
  taskId,
  projectId,
  patch,
}: {
  taskId: string;
  projectId: string;
  patch: Partial<Task>;
}) {
  return emitCacheEvent({ type: 'task.patch', taskId, projectId, patch });
}

export function emitTaskDelete({
  taskId,
  projectId,
  stepIds,
}: {
  taskId: string;
  projectId: string;
  stepIds?: string[];
}) {
  return emitCacheEvent({ type: 'task.delete', taskId, projectId, stepIds });
}

export function emitStepUpsert(step: TaskStep, previousTaskId?: string) {
  return emitCacheEvent({ type: 'step.upsert', step, previousTaskId });
}

export function emitStepPatch({
  stepId,
  taskId,
  patch,
}: {
  stepId: string;
  taskId: string;
  patch: Partial<TaskStep>;
}) {
  return emitCacheEvent({ type: 'step.patch', stepId, taskId, patch });
}

export function emitStepDelete({
  stepId,
  taskId,
}: {
  stepId: string;
  taskId: string;
}) {
  return emitCacheEvent({ type: 'step.delete', stepId, taskId });
}
