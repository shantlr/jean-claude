import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cache$, resetCache } from './cache-store';
import {
  invalidateFeedResource,
  invalidateFeedResources,
  updateFeedDocument,
} from './feed-cache';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { setDocumentResource } from './cache-actions';

function createFeedItem(id: string) {
  return {
    id,
    source: 'task' as const,
    attention: 'running' as const,
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'project-1',
    projectName: 'Project 1',
    projectColor: '#000000',
    projectPriority: 'normal' as const,
    title: id,
    taskId: id,
  };
}

beforeEach(() => {
  resetCache();
});

describe('feed cache helpers', () => {
  it('marks feed resource stale and invalidates matching query key', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    setDocumentResource('feed:tasks', []);

    invalidateFeedResource(queryClient, 'tasks');

    expect(cache$.resources['feed:tasks'].get()?.stale).toBe(true);
    expect(cache$.documents['feed:tasks'].get()?.stale).toBe(true);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.tasks,
    });
  });

  it('invalidates multiple feed resources', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    setDocumentResource('feed:tasks', []);
    setDocumentResource('feed:workItems', []);

    invalidateFeedResources(queryClient, ['tasks', 'workItems']);

    expect(cache$.resources['feed:tasks'].get()?.stale).toBe(true);
    expect(cache$.resources['feed:workItems'].get()?.stale).toBe(true);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.tasks,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.workItems,
    });
  });

  it('updates feed document data without clearing stale metadata', () => {
    setDocumentResource('feed:tasks', [createFeedItem('task-1')]);
    cache$.resources['feed:tasks'].assign({ stale: true });
    cache$.documents['feed:tasks'].assign({ stale: true });

    updateFeedDocument('tasks', (items) => [
      { ...items[0], title: 'Updated' },
    ]);

    expect(cache$.documents['feed:tasks'].data.get()).toMatchObject([
      { id: 'task-1', title: 'Updated' },
    ]);
    expect(cache$.resources['feed:tasks'].get()?.stale).toBe(true);
    expect(cache$.documents['feed:tasks'].get()?.stale).toBe(true);
  });
});
