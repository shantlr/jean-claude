import { sql } from 'kysely';

import { db } from '../index';
import type { Database } from '../schema';

type TableName = keyof Database;

const ALLOWED_TABLES: TableName[] = [
  'providers',
  'projects',
  'tasks',
  'agent_messages',
  'settings',
];

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

export const DebugRepository = {
  getTableNames: (): string[] => {
    return [...ALLOWED_TABLES];
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
      .select('name')
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
        query = query.where(sql`(${combined})`);
        countQuery = countQuery.where(sql`(${combined})`);
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
