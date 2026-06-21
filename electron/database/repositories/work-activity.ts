import type {
  NewWorkActivityEvent,
  WorkActivityEvent,
  WorkActivityEventType,
  WorkActivityPullRequest,
  WorkActivityWorkItem,
} from '@shared/work-activity-types';

import type { NewWorkActivityEventRow, WorkActivityEventRow } from '../schema';
import { db } from '../index';


function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToEvent(row: WorkActivityEventRow): WorkActivityEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    type: row.type as WorkActivityEvent['type'],
    projectId: row.projectId,
    projectName: row.projectName,
    providerId: row.providerId,
    azureOrgId: row.azureOrgId,
    azureProjectId: row.azureProjectId,
    repoId: row.repoId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    stepId: row.stepId,
    promptSnippet: row.promptSnippet,
    promptLength: row.promptLength,
    workItemIds: parseJson<string[]>(row.workItemIdsJson, []),
    workItems: parseJson<WorkActivityWorkItem[]>(row.workItemsJson, []),
    pullRequest: row.pullRequestJson
      ? parseJson<WorkActivityPullRequest | null>(row.pullRequestJson, null)
      : null,
    metadata: parseJson<Record<string, unknown>>(row.metadataJson, {}),
  };
}

function eventToRow(event: NewWorkActivityEvent): NewWorkActivityEventRow {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    type: event.type,
    projectId: event.projectId,
    projectName: event.projectName,
    providerId: event.providerId,
    azureOrgId: event.azureOrgId,
    azureProjectId: event.azureProjectId,
    repoId: event.repoId,
    taskId: event.taskId,
    taskTitle: event.taskTitle,
    stepId: event.stepId,
    promptSnippet: event.promptSnippet,
    promptLength: event.promptLength,
    workItemIdsJson: JSON.stringify(event.workItemIds),
    workItemsJson: JSON.stringify(event.workItems),
    pullRequestJson: event.pullRequest
      ? JSON.stringify(event.pullRequest)
      : null,
    metadataJson: JSON.stringify(event.metadata),
  };
}

export const WorkActivityRepository = {
  async record(event: NewWorkActivityEvent): Promise<WorkActivityEvent> {
    const row = await db
      .insertInto('work_activity_events')
      .values(eventToRow(event))
      .returningAll()
      .executeTakeFirstOrThrow();

    return rowToEvent(row);
  },

  async getRange(params: {
    start: string;
    end: string;
    projectId?: string;
    type?: WorkActivityEventType;
  }): Promise<WorkActivityEvent[]> {
    let query = db
      .selectFrom('work_activity_events')
      .selectAll()
      .where('occurredAt', '>=', params.start)
      .where('occurredAt', '<', params.end);

    if (params.projectId) {
      query = query.where('projectId', '=', params.projectId);
    }

    if (params.type) {
      query = query.where('type', '=', params.type);
    }

    const rows = await query.orderBy('occurredAt', 'asc').execute();
    return rows.map(rowToEvent);
  },

  async deleteBefore(before: string): Promise<void> {
    await db
      .deleteFrom('work_activity_events')
      .where('occurredAt', '<', before)
      .execute();
  },

  async deleteAll(): Promise<void> {
    await db.deleteFrom('work_activity_events').execute();
  },
};
