import { Kysely, sql } from 'kysely';

/**
 * Migrates prompt snippets from old format (with `trigger` field) to new format
 * (with `contexts`, `autocomplete`, `description` fields).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const row = await sql<{ value: string }>`
    SELECT value FROM settings WHERE key = 'promptSnippets'
  `.execute(db);

  if (row.rows.length === 0) return;

  const snippets = JSON.parse(row.rows[0].value);
  if (!Array.isArray(snippets) || snippets.length === 0) return;

  // Check if already migrated (all snippets have `contexts` field)
  if (snippets.every((s: Record<string, unknown>) => s.contexts)) return;

  const migrated = snippets.map(
    (s: {
      id: string;
      name: string;
      trigger?: string;
      template: string;
      enabled: boolean;
      builtin?: boolean;
    }) => ({
      id: s.id,
      name: s.name,
      description: '',
      template: s.template,
      enabled: s.enabled,
      contexts: { newTask: true, newTaskStep: true },
      autocomplete: {
        enabled: true,
        slugs: s.trigger ? [s.trigger] : [],
      },
    }),
  );

  const now = new Date().toISOString();
  await sql`
    UPDATE settings
    SET value = ${JSON.stringify(migrated)}, updatedAt = ${now}
    WHERE key = 'promptSnippets'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const row = await sql<{ value: string }>`
    SELECT value FROM settings WHERE key = 'promptSnippets'
  `.execute(db);

  if (row.rows.length === 0) return;

  const snippets = JSON.parse(row.rows[0].value);
  if (!Array.isArray(snippets) || snippets.length === 0) return;

  // Revert to old format
  const reverted = snippets.map(
    (s: {
      id: string;
      name: string;
      template: string;
      enabled: boolean;
      autocomplete?: { slugs?: string[] };
    }) => ({
      id: s.id,
      name: s.name,
      trigger: s.autocomplete?.slugs?.[0] ?? '',
      template: s.template,
      enabled: s.enabled,
    }),
  );

  const now = new Date().toISOString();
  await sql`
    UPDATE settings
    SET value = ${JSON.stringify(reverted)}, updatedAt = ${now}
    WHERE key = 'promptSnippets'
  `.execute(db);
}
