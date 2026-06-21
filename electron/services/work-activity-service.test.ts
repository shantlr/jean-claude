import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewWorkActivityEvent } from '@shared/work-activity-types';

const mocks = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  recordMock: vi.fn(),
  findProjectByIdMock: vi.fn(),
  findProviderByIdMock: vi.fn(),
  findTaskByIdMock: vi.fn(),
  findStepByIdMock: vi.fn(),
}));

vi.mock('../database/repositories', () => ({
  ProjectRepository: {
    findById: mocks.findProjectByIdMock,
  },
  ProviderRepository: {
    findById: mocks.findProviderByIdMock,
  },
  SettingsRepository: {
    get: mocks.getSettingMock,
  },
  TaskRepository: {
    findById: mocks.findTaskByIdMock,
  },
  WorkActivityRepository: {
    record: mocks.recordMock,
  },
}));

vi.mock('../database/repositories/task-steps', () => ({
  TaskStepRepository: {
    findById: mocks.findStepByIdMock,
  },
}));

import { workActivityService } from './work-activity-service';

const baseEvent: NewWorkActivityEvent = {
  occurredAt: '2026-06-19T12:00:00.000Z',
  type: 'task_prompted',
  projectId: 'project-1',
  projectName: 'Jean-Claude',
  providerId: 'provider-1',
  azureOrgId: null,
  azureProjectId: 'azure-project-1',
  repoId: 'repo-1',
  taskId: 'task-1',
  taskTitle: 'Add tracker',
  stepId: 'step-1',
  promptSnippet: 'Build tracker',
  promptLength: 13,
  workItemIds: ['123'],
  workItems: [],
  pullRequest: null,
  metadata: {},
};

describe('workActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettingMock.mockResolvedValue({ enabled: true });
    mocks.recordMock.mockImplementation(
      async (event: NewWorkActivityEvent) => ({
        ...event,
        id: event.id ?? 'event-1',
      }),
    );
  });

  it('sanitizes and truncates prompt snippets at record boundary', async () => {
    const promptSnippet = `Review this\n<attached_files>\n  <file name="secret.md" path="/private/tmp/project/secret.md" />\n</attached_files>\n${'x'.repeat(600)}`;

    await workActivityService.record({
      ...baseEvent,
      promptSnippet,
      promptLength: null,
    });

    expect(mocks.recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promptSnippet: expect.stringMatching(
          /^Review this\n\[file: secret.md\]/,
        ),
        promptLength: promptSnippet.length,
      }),
    );
    const recorded = mocks.recordMock.mock.calls[0][0] as NewWorkActivityEvent;
    expect(recorded.promptSnippet).toHaveLength(500);
    expect(recorded.promptSnippet).not.toContain('/private/tmp/project');
  });

  it('ignores invalid top-level renderer payloads', async () => {
    await expect(workActivityService.record(null)).resolves.toBeNull();
    await expect(
      workActivityService.record('not an event'),
    ).resolves.toBeNull();
    await expect(workActivityService.record([])).resolves.toBeNull();

    expect(mocks.recordMock).not.toHaveBeenCalled();
  });

  it('strips malicious extra fields from renderer activity payloads', async () => {
    await workActivityService.record({
      ...baseEvent,
      workItemIds: ['123', '123', '456'],
      workItems: [
        {
          id: '123',
          providerId: 'provider-1',
          azureOrgId: null,
          azureProjectId: 'azure-project-1',
          title: 'Injected title',
          type: 'Bug',
          state: 'Closed',
          url: 'https://example.test/work-item/123',
        },
      ],
      pullRequest: {
        providerId: 'provider-1',
        azureOrgId: null,
        azureProjectId: 'azure-project-1',
        repoId: 'repo-1',
        pullRequestId: '42',
        title: 'Safe title',
        url: 'https://example.test/pr/42',
        secretToken: 'do-not-store',
      },
      metadata: {
        safe: true,
        unsafe: undefined,
      },
    } as unknown as NewWorkActivityEvent);

    const recorded = mocks.recordMock.mock.calls[0][0] as NewWorkActivityEvent;
    expect(recorded.workItemIds).toEqual(['123', '456']);
    expect(recorded.workItems).toEqual([
      {
        id: '123',
        providerId: 'provider-1',
        azureOrgId: null,
        azureProjectId: 'azure-project-1',
      },
    ]);
    expect(recorded.pullRequest).toEqual({
      providerId: 'provider-1',
      azureOrgId: null,
      azureProjectId: 'azure-project-1',
      repoId: 'repo-1',
      pullRequestId: '42',
      title: 'Safe title',
      url: 'https://example.test/pr/42',
    });
    expect(recorded.metadata).toEqual({ safe: true });
  });

  it('normalizes invalid renderer activity shapes before recording', async () => {
    await workActivityService.record({
      ...baseEvent,
      occurredAt: 'not a date',
      workItemIds: [123, '456', null, '456'],
      workItems: [
        null,
        { id: '123', providerId: 1, azureProjectId: 'azure-project-1' },
        {
          id: '456',
          providerId: 'provider-1',
          azureOrgId: 123,
          azureProjectId: 'azure-project-1',
        },
      ],
      pullRequest: {
        providerId: 'provider-1',
        azureOrgId: null,
        azureProjectId: 'azure-project-1',
        repoId: 'repo-1',
        pullRequestId: 42,
        title: 'Bad PR',
        url: 'https://example.test/pr/42',
      },
      metadata: ['not', 'record'],
    } as unknown as NewWorkActivityEvent);

    const recorded = mocks.recordMock.mock.calls[0][0] as NewWorkActivityEvent;
    expect(new Date(recorded.occurredAt).toString()).not.toBe('Invalid Date');
    expect(recorded.workItemIds).toEqual(['456']);
    expect(recorded.workItems).toEqual([
      {
        id: '456',
        providerId: 'provider-1',
        azureOrgId: null,
        azureProjectId: 'azure-project-1',
      },
    ]);
    expect(recorded.pullRequest).toBeNull();
    expect(recorded.metadata).toEqual({});
  });

  it('keeps work items when azure org cannot be parsed', async () => {
    mocks.findStepByIdMock.mockResolvedValue({
      id: 'step-1',
      taskId: 'task-1',
    });
    mocks.findTaskByIdMock.mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      name: 'Add tracker',
      workItemIds: ['123'],
    });
    mocks.findProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      name: 'Jean-Claude',
      workItemProviderId: 'provider-1',
      repoProviderId: null,
      workItemProjectId: 'azure-project-1',
      repoProjectId: null,
      repoId: 'repo-1',
    });
    mocks.findProviderByIdMock.mockResolvedValue({
      id: 'provider-1',
      baseUrl: 'not a url',
    });

    await workActivityService.recordTaskPrompt({
      stepId: 'step-1',
      prompt: 'Build tracker',
      occurredAt: '2026-06-19T12:00:00.000Z',
    });

    expect(mocks.recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        azureOrgId: null,
        workItems: [
          {
            id: '123',
            providerId: 'provider-1',
            azureOrgId: null,
            azureProjectId: 'azure-project-1',
          },
        ],
      }),
    );
  });

  it('sanitizes attached file fragments before truncating task prompts', async () => {
    mocks.findStepByIdMock.mockResolvedValue({
      id: 'step-1',
      taskId: 'task-1',
    });
    mocks.findTaskByIdMock.mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      name: 'Add tracker',
      workItemIds: [],
    });
    mocks.findProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      name: 'Jean-Claude',
      workItemProviderId: null,
      repoProviderId: null,
      workItemProjectId: null,
      repoProjectId: null,
      repoId: 'repo-1',
    });
    const prompt = `${'x'.repeat(490)}\n<attached_files>\n  <file name="secret.md" path="/private/tmp/project/secret.md" />\n${'y'.repeat(200)}`;

    await workActivityService.recordTaskPrompt({
      stepId: 'step-1',
      prompt,
      occurredAt: '2026-06-19T12:00:00.000Z',
    });

    const recorded = mocks.recordMock.mock.calls[0][0] as NewWorkActivityEvent;
    expect(recorded.promptLength).toBe(prompt.length);
    expect(recorded.promptSnippet).toContain('[file');
    expect(recorded.promptSnippet).not.toContain('/private/tmp/project');
    expect(recorded.promptSnippet).toHaveLength(500);
  });
});
