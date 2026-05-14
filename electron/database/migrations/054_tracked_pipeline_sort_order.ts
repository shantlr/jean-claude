import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tracked_pipelines')
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await sql`
    UPDATE tracked_pipelines
    SET sortOrder = (
      SELECT COUNT(*)
      FROM tracked_pipelines p2
      WHERE p2.projectId = tracked_pipelines.projectId
        AND (
          p2.kind < tracked_pipelines.kind
          OR (
            p2.kind = tracked_pipelines.kind
            AND (
              p2.name < tracked_pipelines.name
              OR (p2.name = tracked_pipelines.name AND p2.id < tracked_pipelines.id)
            )
          )
        )
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tracked_pipelines')
    .dropColumn('sortOrder')
    .execute();
}
