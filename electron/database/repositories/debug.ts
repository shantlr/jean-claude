import { sql, ExpressionWrapper, SqlBool } from 'kysely';

import { db } from '../index';
import type { Database } from '../schema';

type TableName = keyof Database;

const ALL_TABLES: Record<TableName, true> = {
  tokens: true,
  providers: true,
  projects: true,
  tasks: true,
  agent_messages: true,
  raw_messages: true,
  settings: true,
  project_commands: true,
  mcp_templates: true,
  project_mcp_overrides: true,
  task_summaries: true,
  project_todos: true,
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

    const pageSize = Number(pageSizeResult.rows[0]?.page_size ?? 0);
    const pageCount = Number(pageCountResult.rows[0]?.page_count ?? 0);

    return {
      bytes: pageSize * pageCount,
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
};
