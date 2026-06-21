import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewWorkActivityEvent } from '@shared/work-activity-types';

const mocks = vi.hoisted(() => {
  type Row = Record<string, string | number | null> & {
    id: string;
    occurredAt: string;
  };
  type WhereClause = { column: string; op: string; value: string };

  const rows: Row[] = [];
  let nextId = 1;

  class SelectQuery {
    private clauses: WhereClause[] = [];

    selectAll() {
      return this;
    }

    where(column: string, op: string, value: string) {
      this.clauses.push({ column, op, value });
      return this;
    }

    orderBy() {
      return this;
    }

    async execute() {
      return rows
        .filter((row) =>
          this.clauses.every(({ column, op, value }) => {
            const rowValue = row[column];
            if (typeof rowValue !== 'string') return false;
            if (op === '>=') return rowValue >= value;
            if (op === '<') return rowValue < value;
            if (op === '=') return row[column] === value;
            return false;
          }),
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    }
  }

  class DeleteQuery {
    private clause: WhereClause | null = null;

    where(column: string, op: string, value: string) {
      this.clause = { column, op, value };
      return this;
    }

    async execute() {
      if (!this.clause) {
        rows.splice(0, rows.length);
        return;
      }

      const { column, op, value } = this.clause;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const rowValue = rows[index][column];
        if (op === '<' && typeof rowValue === 'string' && rowValue < value) {
          rows.splice(index, 1);
        }
      }
    }
  }

  const dbMock = {
    insertInto: vi.fn(() => ({
      values: vi.fn((value: Row) => ({
        returningAll: vi.fn(() => ({
          executeTakeFirstOrThrow: vi.fn(async () => {
            const row = { ...value, id: value.id ?? `event-${nextId++}` };
            rows.push(row as Row);
            return row;
          }),
        })),
      })),
    })),
    selectFrom: vi.fn(() => new SelectQuery()),
    deleteFrom: vi.fn(() => new DeleteQuery()),
  };

  return {
    dbMock,
    rows,
    resetRows: () => {
      rows.splice(0, rows.length);
      nextId = 1;
    },
  };
});

vi.mock('../index', () => ({
  db: mocks.dbMock,
}));

import { WorkActivityRepository } from './work-activity';

const baseEvent: NewWorkActivityEvent = {
  occurredAt: '2026-06-19T12:00:00.000Z',
  type: 'task_prompted',
  projectId: 'project-1',
  projectName: 'Jean-Claude',
  providerId: 'provider-1',
  azureOrgId: 'org-1',
  azureProjectId: 'azure-project-1',
  repoId: 'repo-1',
  taskId: 'task-1',
  taskTitle: 'Add tracker',
  stepId: 'step-1',
  promptSnippet: 'Build tracker',
  promptLength: 13,
  workItemIds: ['123', '456'],
  workItems: [
    {
      id: '123',
      providerId: 'provider-1',
      azureOrgId: 'org-1',
      azureProjectId: 'azure-project-1',
    },
  ],
  pullRequest: {
    providerId: 'provider-1',
    azureOrgId: 'org-1',
    azureProjectId: 'azure-project-1',
    repoId: 'repo-1',
    pullRequestId: '789',
    title: 'Add tracker',
    url: 'https://example.test/pr/789',
  },
  metadata: { source: 'test', count: 2 },
};

describe('WorkActivityRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetRows();
  });

  it('record persists JSON fields and getRange deserializes them', async () => {
    const recorded = await WorkActivityRepository.record(baseEvent);

    expect(recorded).toMatchObject(baseEvent);
    expect(mocks.rows[0]).toMatchObject({
      workItemIdsJson: JSON.stringify(baseEvent.workItemIds),
      workItemsJson: JSON.stringify(baseEvent.workItems),
      pullRequestJson: JSON.stringify(baseEvent.pullRequest),
      metadataJson: JSON.stringify(baseEvent.metadata),
    });

    const events = await WorkActivityRepository.getRange({
      start: '2026-06-19T00:00:00.000Z',
      end: '2026-06-20T00:00:00.000Z',
    });

    expect(events).toEqual([recorded]);
  });

  it('record persists null pull requests', async () => {
    const recorded = await WorkActivityRepository.record({
      ...baseEvent,
      pullRequest: null,
    });

    expect(mocks.rows[0].pullRequestJson).toBeNull();
    expect(recorded.pullRequest).toBeNull();
  });

  it('getRange filters by [start, end)', async () => {
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'before',
      occurredAt: '2026-06-18T23:59:59.999Z',
    });
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'inside',
      occurredAt: '2026-06-19T00:00:00.000Z',
    });
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'end',
      occurredAt: '2026-06-20T00:00:00.000Z',
    });

    const events = await WorkActivityRepository.getRange({
      start: '2026-06-19T00:00:00.000Z',
      end: '2026-06-20T00:00:00.000Z',
    });

    expect(events.map((event) => event.id)).toEqual(['inside']);
  });

  it('getRange filters by projectId and type', async () => {
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'matching',
      projectId: 'project-1',
      type: 'pr_comment_added',
    });
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'wrong-project',
      projectId: 'project-2',
      type: 'pr_comment_added',
    });
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'wrong-type',
      projectId: 'project-1',
      type: 'task_prompted',
    });

    const events = await WorkActivityRepository.getRange({
      start: '2026-06-19T00:00:00.000Z',
      end: '2026-06-20T00:00:00.000Z',
      projectId: 'project-1',
      type: 'pr_comment_added',
    });

    expect(events.map((event) => event.id)).toEqual(['matching']);
  });

  it('deleteBefore removes older events', async () => {
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'old',
      occurredAt: '2026-06-18T23:59:59.999Z',
    });
    await WorkActivityRepository.record({
      ...baseEvent,
      id: 'kept',
      occurredAt: '2026-06-19T00:00:00.000Z',
    });

    await WorkActivityRepository.deleteBefore('2026-06-19T00:00:00.000Z');

    expect(mocks.rows.map((row) => row.id)).toEqual(['kept']);
  });

  it('deleteAll removes all events', async () => {
    await WorkActivityRepository.record({ ...baseEvent, id: 'first' });
    await WorkActivityRepository.record({ ...baseEvent, id: 'second' });

    await WorkActivityRepository.deleteAll();

    expect(mocks.rows).toEqual([]);
  });
});
