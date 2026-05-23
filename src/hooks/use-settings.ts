import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import { BUILTIN_SNIPPETS, BUILTIN_SNIPPET_IDS } from '@/lib/builtin-snippets';
import type {
  BackendModelPresetsSetting,
  AiSkillSlotsSetting,
  AppSettings,
  BackendsSetting,
  CalendarNotificationsSetting,
  EditorSetting,
  PromptSnippetsSetting,
  SummaryModelsSetting,
  TaskEventNotificationsSetting,
  UsageDisplaySetting,
} from '@shared/types';
import { PRESET_EDITORS } from '@shared/types';

export function useSetting<K extends keyof AppSettings>(key: K) {
  return useQuery({
    queryKey: ['settings', key],
    queryFn: () => api.settings.get(key),
  });
}

export function useUpdateSetting<K extends keyof AppSettings>() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: K; value: AppSettings[K] }) =>
      api.settings.set(key, value),
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ['settings', key] });
    },
  });
}

export function getEditorLabel(setting: EditorSetting): string {
  if (setting.type === 'preset') {
    const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
    return editor?.label ?? setting.id;
  }
  if (setting.type === 'command') return setting.command;
  if (setting.type === 'app') return setting.name;
  const _exhaustive: never = setting;
  return _exhaustive;
}

// Convenience hooks for editor setting
export function useEditorSetting() {
  return useSetting('editor');
}

export function useUpdateEditorSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: EditorSetting) => api.settings.set('editor', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'editor'] });
    },
  });
}

export function useAvailableEditors() {
  return useQuery({
    queryKey: ['availableEditors'],
    queryFn: api.shell.getAvailableEditors,
    staleTime: 60 * 1000, // Cache for 1 minute
  });
}

// Convenience hooks for backends setting
export function useBackendsSetting() {
  return useSetting('backends');
}

export function useUpdateBackendsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: BackendsSetting) => api.settings.set('backends', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'backends'] });
    },
  });
}

// Convenience hooks for completion setting
export function useCompletionSetting() {
  return useSetting('completion');
}

// Convenience hooks for usage display setting
export function useUsageDisplaySetting() {
  return useSetting('usageDisplay');
}

export function useUpdateUsageDisplaySetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: UsageDisplaySetting) =>
      api.settings.set('usageDisplay', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'usageDisplay'],
      });
    },
  });
}

export function useSummaryModelsSetting() {
  return useSetting('summaryModels');
}

export function useUpdateSummaryModelsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: SummaryModelsSetting) =>
      api.settings.set('summaryModels', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'summaryModels'],
      });
    },
  });
}

export function useBackendModelPresetsSetting() {
  return useSetting('backendModelPresets');
}

export function useUpdateBackendModelPresetsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: BackendModelPresetsSetting) =>
      api.settings.set('backendModelPresets', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'backendModelPresets'],
      });
    },
  });
}

export function useTaskEventNotificationsSetting() {
  return useSetting('taskEventNotifications');
}

export function useUpdateTaskEventNotificationsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: TaskEventNotificationsSetting) =>
      api.settings.set('taskEventNotifications', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'taskEventNotifications'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<TaskEventNotificationsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'taskEventNotifications'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'taskEventNotifications'],
      });
    },
  });
}

export function useCalendarNotificationsSetting() {
  return useSetting('calendarNotifications');
}

export function useUpdateCalendarNotificationsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: CalendarNotificationsSetting) =>
      api.settings.set('calendarNotifications', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'calendarNotifications'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<CalendarNotificationsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'calendarNotifications'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'calendarNotifications'],
      });
    },
  });
}

// Convenience hooks for AI skill slots setting
export function useAiSkillSlotsSetting() {
  return useSetting('aiSkillSlots');
}

export function useUpdateAiSkillSlotsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: AiSkillSlotsSetting) =>
      api.settings.set('aiSkillSlots', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'aiSkillSlots'],
      });
    },
  });
}

// Completion daily usage hook
export function useCompletionDailyUsage() {
  const { data: completionSetting } = useCompletionSetting();
  const enabled = completionSetting?.enabled ?? false;

  return useQuery({
    queryKey: ['completion-daily-usage'],
    queryFn: () => api.completion.getDailyUsage(),
    enabled,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

// Convenience hooks for prompt snippets setting
// Merges built-in snippets with user snippets. Built-in snippets respect
// user's enabled/disabled state if they've been saved to settings.
export function usePromptSnippetsSetting() {
  const query = useSetting('promptSnippets');
  const data = useMemo(() => {
    const userSnippets = query.data ?? [];
    const userSnippetMap = new Map(userSnippets.map((s) => [s.id, s]));
    // Built-in snippets always use latest template, but respect user's enabled state
    const mergedBuiltins = BUILTIN_SNIPPETS.map((builtin) => {
      const userCopy = userSnippetMap.get(builtin.id);
      if (!userCopy) return builtin;
      return { ...builtin, enabled: userCopy.enabled };
    });
    // User snippets that are not built-ins
    const customSnippets = userSnippets.filter(
      (s) => !BUILTIN_SNIPPET_IDS.has(s.id),
    );
    return [...mergedBuiltins, ...customSnippets];
  }, [query.data]);
  return { ...query, data };
}

export function useUpdatePromptSnippetsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: PromptSnippetsSetting) =>
      api.settings.set('promptSnippets', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'promptSnippets'],
      });
    },
  });
}
