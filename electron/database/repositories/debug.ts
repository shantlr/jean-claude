import { ExpressionWrapper, sql, SqlBool } from 'kysely';

import type { Database } from '../schema';
import { db } from '../index';


type TableName = keyof Database;

const ALL_TABLES: Record<TableName, true> = {
  tokens: true,
  providers: true,
  projects: true,
  tasks: true,
  task_steps: true,
  agent_messages: true,
  raw_messages: true,
  settings: true,
  project_commands: true,
  project_command_groups: true,
  mcp_templates: true,
  project_mcp_overrides: true,
  task_summaries: true,
  project_todos: true,
  completion_usage: true,
  feed_notes: true,
  pr_view_snapshots: true,
  notifications: true,
  tracked_pipelines: true,
  usage_snapshots: true,
  ai_usage_events: true,
  ai_usage_task_totals: true,
  ai_usage_daily_totals: true,
  work_activity_events: true,
};

const ALLOWED_TABLES = Object.keys(ALL_TABLES) as TableName[];

export interface QueryTableParams {
  table: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface QueryTableResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export interface DatabaseSizeResult {
  bytes: number;
  reclaimableBytes: number;
  tables: { name: string; bytes: number }[];
}

export interface OldCompletedTasksCountResult {
  count: number;
}

export interface DeleteOldCompletedTasksResult {
  deletedCount: number;
}

const COMPLETED_TASK_RETENTION_DAYS = 7;

function getCompletedTasksCutoffDate(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - COMPLETED_TASK_RETENTION_DAYS);
  return cutoff.toISOString();
}

export const DebugRepository = {
  getTableNames: (): string[] => {
    return [...ALLOWED_TABLES];
  },

  getDatabaseSize: async (): Promise<DatabaseSizeResult> => {
    const pageSizeResult = await sql<{
      page_size: number;
    }>`PRAGMA page_size`.execute(db);
    const pageCountResult = await sql<{
      page_count: number;
    }>`PRAGMA page_count`.execute(db);
    const freelistCountResult = await sql<{
      freelist_count: number;
    }>`PRAGMA freelist_count`.execute(db);

    const pageSize = Number(pageSizeResult.rows[0]?.page_size ?? 0);
    const pageCount = Number(pageCountResult.rows[0]?.page_count ?? 0);
    const freelistCount = Number(
      freelistCountResult.rows[0]?.freelist_count ?? 0,
    );
    const tableList = sql.join(ALLOWED_TABLES.map((table) => sql`${table}`));
    const tableSizeResult = await sql<{
      name: string;
      bytes: number;
    }>`
      SELECT name, COALESCE(SUM(pgsize), 0) AS bytes
      FROM dbstat
      WHERE name IN (${tableList})
      GROUP BY name
      ORDER BY bytes DESC, name ASC
    `.execute(db);

    return {
      bytes: pageSize * pageCount,
      reclaimableBytes: pageSize * freelistCount,
      tables: tableSizeResult.rows.map((row) => ({
        name: row.name,
        bytes: Number(row.bytes ?? 0),
      })),
    };
  },

  queryTable: async (params: QueryTableParams): Promise<QueryTableResult> => {
    const { table, search, limit, offset } = params;

    // Validate table name
    if (!ALLOWED_TABLES.includes(table as TableName)) {
      throw new Error(`Invalid table name: ${table}`);
    }

    const tableName = table as TableName;

    // Get column names using pragma
    const pragmaResult = db
      .selectFrom(sql`pragma_table_info(${sql.lit(tableName)})`.as('info'))
      .select(sql<string>`name`.as('name'))
      .execute();

    const columns = (await pragmaResult).map((row) => row.name as string);

    // Build base query
    let query = db.selectFrom(tableName).selectAll();
    let countQuery = db.selectFrom(tableName).select(sql`count(*)`.as('count'));

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      const searchConditions = columns.map(
        (col) => sql`CAST(${sql.ref(col)} AS TEXT) LIKE ${searchTerm}`,
      );

      if (searchConditions.length > 0) {
        const combined = searchConditions.reduce(
          (acc, cond) => sql`${acc} OR ${cond}`,
        );
        const whereClause =
          sql<SqlBool>`(${combined})` as unknown as ExpressionWrapper<
            Database,
            keyof Database,
            SqlBool
          >;
        query = query.where(whereClause);
        countQuery = countQuery.where(whereClause);
      }
    }

    // Get total count
    const countResult = await countQuery.executeTakeFirst();
    const total = Number((countResult as { count: number })?.count ?? 0);

    // Apply pagination and execute
    const rows = await query.limit(limit).offset(offset).execute();

    return {
      columns,
      rows: rows as Record<string, unknown>[],
      total,
    };
  },

  countOldCompletedTasks: async (): Promise<OldCompletedTasksCountResult> => {
    const cutoffDate = getCompletedTasksCutoffDate();
    const countResult = await db
      .selectFrom('tasks')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('userCompleted', '=', 1)
      .where('updatedAt', '<', cutoffDate)
      .executeTakeFirstOrThrow();

    return { count: countResult.count };
  },

  deleteOldCompletedTasks: async (): Promise<DeleteOldCompletedTasksResult> => {
    const cutoffDate = getCompletedTasksCutoffDate();
    const rows = await db
      .deleteFrom('tasks')
      .where('userCompleted', '=', 1)
      .where('updatedAt', '<', cutoffDate)
      .returning('id')
      .execute();

    return { deletedCount: rows.length };
  },
};
