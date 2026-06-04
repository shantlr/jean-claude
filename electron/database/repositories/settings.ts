import {
  DEFAULT_TASK_NOTIFICATION_MODES,
  SETTINGS_DEFINITIONS,
  AppSettings,
  type CalendarNotificationsSetting,
  type TaskEventNotificationsSetting,
  type TaskNotificationEvent,
  type TaskNotificationMode,
} from '@shared/types';

import { dbg } from '../../lib/debug';
import { db } from '../index';

function migrateTaskEventNotificationsSetting(
  value: unknown,
): TaskEventNotificationsSetting | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;
  if (obj.modes && typeof obj.modes === 'object') {
    return null;
  }

  if (
    !('mode' in obj) ||
    !('enabled' in obj) ||
    typeof obj.enabled !== 'object' ||
    obj.enabled === null
  ) {
    return null;
  }

  const enabled = obj.enabled as Record<string, unknown>;
  const mode = obj.mode as TaskNotificationMode;
  const modes = Object.fromEntries(
    (
      Object.keys(DEFAULT_TASK_NOTIFICATION_MODES) as TaskNotificationEvent[]
    ).map((event) => [event, enabled[event] === false ? 'disabled' : mode]),
  ) as Record<TaskNotificationEvent, TaskNotificationMode>;

  return { modes };
}

function normalizeCalendarNotificationsSetting(
  value: unknown,
): CalendarNotificationsSetting | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.showStartWindow === 'boolean' || 'showStartWindow' in obj) {
    return null;
  }

  return {
    ...obj,
    showStartWindow: false,
  } as CalendarNotificationsSetting;
}

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
      if (key === 'taskEventNotifications') {
        const migrated = migrateTaskEventNotificationsSetting(parsed);
        if (migrated && def.validate(migrated)) {
          return migrated as AppSettings[K];
        }
      }
      if (key === 'calendarNotifications') {
        const normalized = normalizeCalendarNotificationsSetting(parsed);
        if (normalized && def.validate(normalized)) {
          return normalized as AppSettings[K];
        }
      }
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
