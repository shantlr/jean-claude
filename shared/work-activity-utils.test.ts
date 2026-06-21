import { describe, expect, it } from 'vitest';

import {
  buildPromptSnapshot,
  getWeekRange,
  groupWorkActivityEvents,
  parseAzureOrgId,
  WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT,
} from './work-activity-utils';
import type { WorkActivityEvent } from './work-activity-types';


function makeEvent(
  overrides: Partial<WorkActivityEvent> = {},
): WorkActivityEvent {
  return {
    id: 'event-1',
    occurredAt: '2026-06-17T12:00:00.000Z',
    type: 'task_prompted',
    projectId: 'project-1',
    projectName: 'Project 1',
    providerId: 'provider-1',
    azureOrgId: 'org-1',
    azureProjectId: 'azure-project-1',
    repoId: 'repo-1',
    taskId: 'task-1',
    taskTitle: 'Task 1',
    stepId: 'step-1',
    promptSnippet: 'Do work',
    promptLength: 7,
    workItemIds: ['123'],
    workItems: [],
    pullRequest: null,
    metadata: {},
    ...overrides,
  };
}

describe('buildPromptSnapshot', () => {
  it('keeps short prompts unchanged and records full length', () => {
    expect(buildPromptSnapshot('Short prompt')).toEqual({
      promptSnippet: 'Short prompt',
      promptLength: 12,
    });
  });

  it('truncates prompt snippet to limit and records full length', () => {
    const prompt = 'a'.repeat(WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT + 1);

    expect(buildPromptSnapshot(prompt)).toEqual({
      promptSnippet: 'a'.repeat(WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT),
      promptLength: WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT + 1,
    });
  });
});

describe('getWeekRange', () => {
  it('returns Monday UTC start and next Monday UTC end for midweek date', () => {
    expect(getWeekRange('2026-06-17T23:30:00.000Z')).toEqual({
      start: '2026-06-15T00:00:00.000Z',
      end: '2026-06-22T00:00:00.000Z',
    });
  });

  it('uses UTC day when local timezone differs', () => {
    expect(getWeekRange('2026-06-21T23:30:00.000Z')).toEqual({
      start: '2026-06-15T00:00:00.000Z',
      end: '2026-06-22T00:00:00.000Z',
    });
  });
});

describe('parseAzureOrgId', () => {
  it('parses dev.azure.com organization URLs', () => {
    expect(parseAzureOrgId('https://dev.azure.com/my-org')).toBe('my-org');
    expect(parseAzureOrgId('https://dev.azure.com/my-org/')).toBe('my-org');
  });

  it('parses visualstudio.com organization URLs', () => {
    expect(parseAzureOrgId('https://my-org.visualstudio.com')).toBe('my-org');
  });

  it('returns null for unknown or invalid URLs', () => {
    expect(parseAzureOrgId('https://example.com/my-org')).toBeNull();
    expect(parseAzureOrgId('not a url')).toBeNull();
    expect(parseAzureOrgId(null)).toBeNull();
  });
});

describe('groupWorkActivityEvents', () => {
  it('groups by day, project, and work item id sorted by date ascending', () => {
    const grouped = groupWorkActivityEvents([
      makeEvent({
        id: 'event-3',
        occurredAt: '2026-06-18T10:00:00.000Z',
        projectId: 'project-2',
        projectName: 'Project 2',
        workItemIds: ['456'],
      }),
      makeEvent({
        id: 'event-2',
        occurredAt: '2026-06-17T11:00:00.000Z',
        workItemIds: ['123', '456'],
      }),
      makeEvent({
        id: 'event-1',
        occurredAt: '2026-06-17T09:00:00.000Z',
        workItemIds: ['123'],
      }),
    ]);

    expect(grouped.map((day) => day.date)).toEqual([
      '2026-06-17',
      '2026-06-18',
    ]);
    expect(grouped[0]?.projects).toHaveLength(1);
    expect(grouped[0]?.projects[0]?.projectId).toBe('project-1');
    expect(
      grouped[0]?.projects[0]?.workItems.map((item) => ({
        workItemId: item.workItemId,
        eventIds: item.events.map((event) => event.id),
      })),
    ).toEqual([
      { workItemId: '123', eventIds: ['event-1', 'event-2'] },
      { workItemId: '456', eventIds: ['event-2'] },
    ]);
    expect(grouped[1]?.projects[0]?.projectId).toBe('project-2');
  });

  it('uses fallback project and work item groups', () => {
    const grouped = groupWorkActivityEvents([
      makeEvent({
        projectId: null,
        projectName: null,
        workItemIds: [],
      }),
    ]);

    expect(grouped[0]?.projects[0]?.projectId).toBe('unknown-project');
    expect(grouped[0]?.projects[0]?.projectName).toBeNull();
    expect(grouped[0]?.projects[0]?.workItems[0]?.workItemId).toBe(
      'no-work-item',
    );
  });
});
