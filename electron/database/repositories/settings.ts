import { SETTINGS_DEFINITIONS, AppSettings } from '../../../shared/types';
import { db } from '../index';

export const SettingsRepository = {
  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const row = await db
      .selectFrom('settings')
      .where('key', '=', key)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return SETTINGS_DEFINITIONS[key].defaultValue;
    }

    try {
      const parsed = JSON.parse(row.value);
      if (SETTINGS_DEFINITIONS[key].validate(parsed)) {
        return parsed;
      }
      console.warn(`[Settings] Invalid value for "${key}", using default`);
      return SETTINGS_DEFINITIONS[key].defaultValue;
    } catch (e) {
      console.warn(`[Settings] Failed to parse "${key}", using default:`, e);
      return SETTINGS_DEFINITIONS[key].defaultValue;
    }
  },

  async set<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<void> {
    if (!SETTINGS_DEFINITIONS[key].validate(value)) {
      throw new Error(`Invalid value for setting "${key}"`);
    }

    const now = new Date().toISOString();
    await db
      .insertInto('settings')
      .values({ key, value: JSON.stringify(value), updatedAt: now })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value: JSON.stringify(value),
          updatedAt: now,
        }),
      )
      .execute();
  },
};
