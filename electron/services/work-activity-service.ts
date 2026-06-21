import type {
  NewWorkActivityEvent,
  WorkActivityEvent,
  WorkActivityWeekParams,
} from '@shared/work-activity-types';
import {
  parseAzureOrgId,
  WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT,
} from '@shared/work-activity-utils';

import {
  ProjectRepository,
  ProviderRepository,
  SettingsRepository,
  TaskRepository,
  WorkActivityRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';
import { TaskStepRepository } from '../database/repositories/task-steps';



import { sanitizeAttachedFilesXml } from './prompt-utils';

const WORK_ACTIVITY_EVENT_TYPES = new Set([
  'task_prompted',
  'pr_comment_added',
  'pr_approved',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'string' || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item) => typeof item === 'string'))];
}

function normalizeWorkItems(value: unknown): NewWorkActivityEvent['workItems'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.providerId !== 'string' ||
      typeof item.azureProjectId !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        providerId: item.providerId,
        azureOrgId: normalizeNullableString(item.azureOrgId),
        azureProjectId: item.azureProjectId,
      },
    ];
  });
}

function normalizePullRequest(
  value: unknown,
): NewWorkActivityEvent['pullRequest'] {
  if (
    !isRecord(value) ||
    typeof value.providerId !== 'string' ||
    typeof value.azureProjectId !== 'string' ||
    typeof value.repoId !== 'string' ||
    typeof value.pullRequestId !== 'string'
  ) {
    return null;
  }

  return {
    providerId: value.providerId,
    azureOrgId: normalizeNullableString(value.azureOrgId),
    azureProjectId: value.azureProjectId,
    repoId: value.repoId,
    pullRequestId: value.pullRequestId,
    title: normalizeNullableString(value.title),
    url: normalizeNullableString(value.url),
  };
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeWorkItemIds(
  value: string[] | string | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeEventForRecord(event: unknown): NewWorkActivityEvent | null {
  if (!isRecord(event)) {
    dbg.main('workActivity.record rejected invalid payload: %O', event);
    return null;
  }

  const eventType = event.type;
  if (
    typeof eventType !== 'string' ||
    !WORK_ACTIVITY_EVENT_TYPES.has(eventType)
  ) {
    dbg.main('workActivity.record rejected invalid type: %O', eventType);
    return null;
  }

  const promptSnippet =
    typeof event.promptSnippet === 'string'
      ? sanitizeAttachedFilesXml(event.promptSnippet).slice(
          0,
          WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT,
        )
      : null;
  const promptLength =
    typeof event.promptLength === 'number'
      ? event.promptLength
      : typeof event.promptSnippet === 'string'
        ? event.promptSnippet.length
        : null;

  return {
    id: normalizeNullableString(event.id) ?? undefined,
    occurredAt: normalizeDate(event.occurredAt),
    type: eventType as NewWorkActivityEvent['type'],
    projectId: normalizeNullableString(event.projectId),
    projectName: normalizeNullableString(event.projectName),
    providerId: normalizeNullableString(event.providerId),
    azureOrgId: normalizeNullableString(event.azureOrgId),
    azureProjectId: normalizeNullableString(event.azureProjectId),
    repoId: normalizeNullableString(event.repoId),
    taskId: normalizeNullableString(event.taskId),
    taskTitle: normalizeNullableString(event.taskTitle),
    stepId: normalizeNullableString(event.stepId),
    promptSnippet,
    promptLength,
    workItemIds: normalizeStringArray(event.workItemIds),
    workItems: normalizeWorkItems(event.workItems),
    pullRequest: normalizePullRequest(event.pullRequest),
    metadata: normalizeMetadata(event.metadata),
  };
}

export const workActivityService = {
  async record(event: unknown): Promise<WorkActivityEvent | null> {
    const setting = await SettingsRepository.get('workActivity');
    if (!setting.enabled) {
      return null;
    }

    const normalizedEvent = normalizeEventForRecord(event);
    if (!normalizedEvent) {
      return null;
    }

    return WorkActivityRepository.record(normalizedEvent);
  },

  async recordTaskPrompt({
    stepId,
    prompt,
    occurredAt,
  }: {
    stepId: string;
    prompt: string;
    occurredAt: string;
  }): Promise<WorkActivityEvent | null> {
    try {
      const step = await TaskStepRepository.findById(stepId);
      if (!step) {
        return null;
      }

      const task = await TaskRepository.findById(step.taskId);
      if (!task) {
        return null;
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        return null;
      }

      const providerId = project.workItemProviderId ?? project.repoProviderId;
      const azureProjectId = project.workItemProjectId ?? project.repoProjectId;
      const provider = providerId
        ? await ProviderRepository.findById(providerId)
        : undefined;
      const azureOrgId = parseAzureOrgId(provider?.baseUrl ?? null);
      const workItemIds = normalizeWorkItemIds(task.workItemIds);

      return await this.record({
        occurredAt,
        type: 'task_prompted',
        projectId: project.id,
        projectName: project.name,
        providerId,
        azureOrgId,
        azureProjectId,
        repoId: project.repoId,
        taskId: task.id,
        taskTitle: task.name,
        stepId,
        promptSnippet: prompt,
        promptLength: prompt.length,
        workItemIds,
        workItems:
          providerId && azureProjectId
            ? workItemIds.map((id) => ({
                id,
                providerId,
                azureOrgId,
                azureProjectId,
              }))
            : [],
        pullRequest: null,
        metadata: {},
      });
    } catch (error) {
      dbg.main('workActivity.recordTaskPrompt failed: %O', error);
      return null;
    }
  },

  getRange(params: WorkActivityWeekParams): Promise<WorkActivityEvent[]> {
    return WorkActivityRepository.getRange(params);
  },

  deleteBefore(before: string): Promise<void> {
    return WorkActivityRepository.deleteBefore(before);
  },

  deleteAll(): Promise<void> {
    return WorkActivityRepository.deleteAll();
  },
};
