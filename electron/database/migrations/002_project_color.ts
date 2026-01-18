import { Kysely, sql } from 'kysely';

const PROJECT_COLORS = [
  '#5865F2',
  '#57F287',
  '#FEE75C',
  '#EB459E',
  '#ED4245',
  '#9B59B6',
  '#3498DB',
  '#E67E22',
  '#1ABC9C',
];

function getRandomColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('color', 'text', (col) => col.notNull().defaultTo('#5865F2'))
    .execute();

  // Backfill existing projects with random colors
  const projects = await sql<{ id: string }>`SELECT id FROM projects`.execute(
    db,
  );
  for (const project of projects.rows) {
    await sql`UPDATE projects SET color = ${getRandomColor()} WHERE id = ${project.id}`.execute(
      db,
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('color').execute();
}
