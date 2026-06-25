import { beforeEach, describe, expect, it } from 'vitest';
import { cache$, resetCache } from '@/cache/cache-store';

import type { FeedItem } from '@shared/feed-types';
import { setDocumentResource } from '@/cache/cache-actions';

import { updateFeedTaskPendingMessage } from './use-tasks';

function createTaskFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'task:task-1',
    source: 'task',
    attention: 'waiting',
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'project-1',
    projectName: 'Project 1',
    projectColor: '#123456',
    projectPriority: 'normal',
    title: 'Task 1',
    taskId: 'task-1',
    ...overrides,
  };
}

describe('updateFeedTaskPendingMessage', () => {
  beforeEach(() => {
    resetCache();
  });

  it('updates cached feed task item pending message', () => {
    setDocumentResource('feed:tasks', [createTaskFeedItem()], 123);

    updateFeedTaskPendingMessage('task-1', 'new note');

    expect(cache$.documents['feed:tasks'].data.get()).toMatchObject([
      { taskId: 'task-1', pendingMessage: 'new note' },
    ]);
    expect(cache$.resources['feed:tasks'].lastFetchedAt.get()).toBe(123);
  });

  it('updates cached child feed task item pending message', () => {
    setDocumentResource(
      'feed:tasks',
      [
        createTaskFeedItem({
          taskId: 'parent-task',
          children: [createTaskFeedItem({ taskId: 'child-task' })],
        }),
      ],
      123,
    );

    updateFeedTaskPendingMessage('child-task', 'child note');

    const [item] = cache$.documents['feed:tasks'].data.get() as FeedItem[];
    expect(item.children?.[0]?.pendingMessage).toBe('child note');
  });

  it('clears cached feed task item pending message', () => {
    setDocumentResource(
      'feed:tasks',
      [createTaskFeedItem({ pendingMessage: 'old note' })],
      123,
    );

    updateFeedTaskPendingMessage('task-1', null);

    const [item] = cache$.documents['feed:tasks'].data.get() as FeedItem[];
    expect(item.pendingMessage).toBeUndefined();
  });
});
