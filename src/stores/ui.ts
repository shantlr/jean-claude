import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DiffViewMode = 'inline' | 'side-by-side' | 'current-state';

interface UISettings {
  sidebarCollapsed: boolean;
  workItemsPanelWidth: number;
  diffViewMode: DiffViewMode;
  reactScanEnabled: boolean;
  prProjectOrder: string[];
}

const UI_SETTINGS_DEFAULTS: UISettings = {
  sidebarCollapsed: false,
  workItemsPanelWidth: 50,
  diffViewMode: 'inline',
  reactScanEnabled: false,
  prProjectOrder: [],
};

function validateSettings(settings: UISettings): UISettings {
  return {
    ...settings,
    prProjectOrder: Array.isArray(settings.prProjectOrder)
      ? settings.prProjectOrder.filter((id) => typeof id === 'string')
      : [],
    workItemsPanelWidth: Math.min(
      80,
      Math.max(20, settings.workItemsPanelWidth),
    ),
  };
}

function validateField<K extends keyof UISettings>(
  key: K,
  value: UISettings[K],
): UISettings[K] {
  const partial = { ...UI_SETTINGS_DEFAULTS, [key]: value };
  return validateSettings(partial)[key];
}

/** Migrate flat top-level keys from the pre-refactor store shape into the nested settings object. */
function migrateLegacyKeys(raw: Record<string, unknown>): Partial<UISettings> {
  const legacy: Partial<UISettings> = {};
  if (typeof raw.sidebarCollapsed === 'boolean')
    legacy.sidebarCollapsed = raw.sidebarCollapsed;
  if (typeof raw.workItemsPanelWidth === 'number')
    legacy.workItemsPanelWidth = raw.workItemsPanelWidth;
  if (
    raw.diffViewMode === 'inline' ||
    raw.diffViewMode === 'side-by-side' ||
    raw.diffViewMode === 'current-state'
  )
    legacy.diffViewMode = raw.diffViewMode;
  if (typeof raw.reactScanEnabled === 'boolean')
    legacy.reactScanEnabled = raw.reactScanEnabled;
  if (Array.isArray(raw.prProjectOrder))
    legacy.prProjectOrder = raw.prProjectOrder.filter(
      (id): id is string => typeof id === 'string',
    );
  return legacy;
}

type BooleanSettingKey = {
  [K in keyof UISettings]: UISettings[K] extends boolean ? K : never;
}[keyof UISettings];

interface UIState {
  settings: UISettings;
  setSetting: <K extends keyof UISettings>(
    key: K,
    value: UISettings[K],
  ) => void;
  toggleSetting: (key: BooleanSettingKey) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      settings: { ...UI_SETTINGS_DEFAULTS },
      setSetting: (key, value) =>
        set((s) => ({
          settings: { ...s.settings, [key]: validateField(key, value) },
        })),
      toggleSetting: (key) =>
        set((s) => ({
          settings: {
            ...s.settings,
            [key]: validateField(key, !s.settings[key]),
          },
        })),
    }),
    {
      name: 'ui-store',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate flat keys from pre-refactor store shape, then merge defaults
          const legacy = migrateLegacyKeys(
            state as unknown as Record<string, unknown>,
          );
          state.settings = validateSettings({
            ...UI_SETTINGS_DEFAULTS,
            ...legacy,
            ...state.settings,
          });
        }
      },
    },
  ),
);

// Convenience hook for reading a single setting reactively
export function useUISetting<K extends keyof UISettings>(
  key: K,
): UISettings[K] {
  return useUIStore((s) => s.settings[key]);
}
