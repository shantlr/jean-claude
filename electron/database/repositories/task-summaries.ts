import { db } from '../index';
import { NewTaskSummaryRow, TaskSummaryRow } from '../schema';

// Types for parsed summary and annotations
export interface TaskSummaryContent {
  whatIDid: string; // Markdown text
  keyDecisions: string; // Markdown text (bullet points)
}

export interface FileAnnotation {
  filePath: string;
  lineNumber: number; // Line in the diff
  explanation: string; // Why this change was made
}

// Parsed task summary type (JSON fields parsed to objects)
export interface TaskSummary {
  id: string;
  taskId: string;
  commitHash: string;
  summary: TaskSummaryContent;
  annotations: FileAnnotation[];
  createdAt: string;
}

// Input type for creating a task summary
interface CreateTaskSummaryInput {
  taskId: string;
  commitHash: string;
  summary: TaskSummaryContent;
  annotations: FileAnnotation[];
}

// Convert database row to parsed TaskSummary
function toTaskSummary(row: TaskSummaryRow): TaskSummary {
  return {
    id: row.id,
    taskId: row.taskId,
    commitHash: row.commitHash,
    summary: JSON.parse(row.summary) as TaskSummaryContent,
    annotations: JSON.parse(row.annotations) as FileAnnotation[],
    createdAt: row.createdAt,
  };
}

function toTaskSummaryOrUndefined(
  row: TaskSummaryRow | undefined,
): TaskSummary | undefined {
  return row ? toTaskSummary(row) : undefined;
}

// Convert input to database row format
function toDbValues(data: CreateTaskSummaryInput): NewTaskSummaryRow {
  return {
    taskId: data.taskId,
    commitHash: data.commitHash,
    summary: JSON.stringify(data.summary),
    annotations: JSON.stringify(data.annotations),
  };
}

export const TaskSummaryRepository = {
  /**
   * Get the most recent summary for a task
   */
  findByTaskId: async (taskId: string): Promise<TaskSummary | undefined> => {
    const row = await db
      .selectFrom('task_summaries')
      .selectAll()
      .where('taskId', '=', taskId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();

    return toTaskSummaryOrUndefined(row);
  },

  /**
   * Get summary for a specific task and commit combination
   */
  findByTaskAndCommit: async (
    taskId: string,
    commitHash: string,
  ): Promise<TaskSummary | undefined> => {
    const row = await db
      .selectFrom('task_summaries')
      .selectAll()
      .where('taskId', '=', taskId)
      .where('commitHash', '=', commitHash)
      .executeTakeFirst();

    return toTaskSummaryOrUndefined(row);
  },

  /**
   * Create a new task summary
   */
  create: async (data: CreateTaskSummaryInput): Promise<TaskSummary> => {
    const row = await db
      .insertInto('task_summaries')
      .values(toDbValues(data))
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskSummary(row);
  },

  /**
   * Delete all summaries for a task
   */
  deleteByTaskId: async (taskId: string): Promise<void> => {
    await db
      .deleteFrom('task_summaries')
      .where('taskId', '=', taskId)
      .execute();
  },
};
