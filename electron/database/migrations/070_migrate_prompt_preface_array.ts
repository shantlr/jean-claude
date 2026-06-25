import { Kysely, sql } from 'kysely';

type LegacyPromptPrefaceSetting = {
  text: string;
  placement: 'before' | 'after';
  frequency: 'initial' | 'each';
};

function isLegacyPromptPrefaceSetting(
  value: unknown,
): value is LegacyPromptPrefaceSetting {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const obj = value as LegacyPromptPrefaceSetting;
  return (
    typeof obj.text === 'string' &&
    (obj.placement === 'before' || obj.placement === 'after') &&
    (obj.frequency === 'initial' || obj.frequency === 'each')
  );
}

function migratePromptPreface(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!isLegacyPromptPrefaceSetting(value)) return null;

  const text = value.text.trim();
  if (!text) return [];

  return [
    {
      id: 'legacy-1',
      name: 'Preface 1',
      enabled: true,
      text,
      placement: value.placement,
      frequency: value.frequency,
    },
  ];
}

function parseSettingValue(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const row = await sql<{ value: string }>`
    SELECT value FROM settings WHERE key = 'promptPreface'
  `.execute(db);

  if (row.rows.length === 0) return;

  const parsed = parseSettingValue(row.rows[0].value);
  if (parsed === null) return;

  const migrated = migratePromptPreface(parsed);
  if (migrated === null) return;

  const now = new Date().toISOString();
  await sql`
    UPDATE settings
    SET value = ${JSON.stringify(migrated)}, updatedAt = ${now}
    WHERE key = 'promptPreface'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const row = await sql<{ value: string }>`
    SELECT value FROM settings WHERE key = 'promptPreface'
  `.execute(db);

  if (row.rows.length === 0) return;

  const entries = parseSettingValue(row.rows[0].value);
  if (!Array.isArray(entries)) return;

  const firstEnabled = entries.find(
    (entry: Record<string, unknown>) =>
      entry.enabled === true && typeof entry.text === 'string',
  );

  const reverted = {
    text: typeof firstEnabled?.text === 'string' ? firstEnabled.text : '',
    placement:
      firstEnabled?.placement === 'after' || firstEnabled?.placement === 'before'
        ? firstEnabled.placement
        : 'before',
    frequency:
      firstEnabled?.frequency === 'each' || firstEnabled?.frequency === 'initial'
        ? firstEnabled.frequency
        : 'initial',
  };

  const now = new Date().toISOString();
  await sql`
    UPDATE settings
    SET value = ${JSON.stringify(reverted)}, updatedAt = ${now}
    WHERE key = 'promptPreface'
  `.execute(db);
}
