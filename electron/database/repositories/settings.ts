import { SETTINGS_DEFINITIONS, AppSettings } from '@shared/types';

import { dbg } from '../../lib/debug';
import { db } from '../index';

export const SettingsRepository = {
  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const def = SETTINGS_DEFINITIONS[key];
    const row = await db
      .selectFrom('settings')
      .where('key', '=', key)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return def.defaultValue as AppSettings[K];
    }

    try {
      const parsed = JSON.parse(row.value);
      if (def.validate(parsed)) {
        return parsed as AppSettings[K];
      }
      dbg.db('Invalid value for setting "%s", using default', key);
      return def.defaultValue as AppSettings[K];
    } catch (e) {
      dbg.db('Failed to parse setting "%s", using default: %O', key, e);
      return def.defaultValue as AppSettings[K];
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
