import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';



import type {
  AiGenerationSetting,
  AiSkillSlotsSetting,
  AppearanceSetting,
  AppSettings,
  BackendDefaultModelsSetting,
  BackendModelPresetsSetting,
  BackendsSetting,
  CalendarNotificationsSetting,
  EditorAutomationSetting,
  EditorSetting,
  PreferenceMemorySetting,
  ProjectPromptPrefaceSetting,
  PromptPrefaceSetting,
  PromptSnippetsSetting,
  RateLimitSwapSetting,
  RawMessageCleanupSetting,
  SummaryModelsSetting,
  TaskEventNotificationsSetting,
  ThinkingSettingsSetting,
  UsageDisplaySetting,
} from '@shared/types';
import { BUILTIN_SNIPPET_IDS, BUILTIN_SNIPPETS } from '@/lib/builtin-snippets';
import { api } from '@/lib/api';
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

export function useEditorAutomationSetting() {
  return useSetting('editorAutomation');
}

export function useRawMessageCleanupSetting() {
  return useSetting('rawMessageCleanup');
}

export function usePreferenceMemorySetting() {
  return useSetting('preferenceMemory');
}

export function useUpdatePreferenceMemorySetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: PreferenceMemorySetting) =>
      api.settings.set('preferenceMemory', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'preferenceMemory'],
      });
    },
  });
}

export function useUpdateRawMessageCleanupSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: RawMessageCleanupSetting) =>
      api.settings.set('rawMessageCleanup', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'rawMessageCleanup'] as const;
      await queryClient.cancelQueries({ queryKey });
      const hadPrevious = queryClient.getQueryData(queryKey) !== undefined;
      const previous =
        queryClient.getQueryData<RawMessageCleanupSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { hadPrevious, previous };
    },
    onError: (_error, _value, context) => {
      if (context?.hadPrevious) {
        queryClient.setQueryData(
          ['settings', 'rawMessageCleanup'],
          context.previous,
        );
      } else {
        queryClient.removeQueries({
          queryKey: ['settings', 'rawMessageCleanup'],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'rawMessageCleanup'],
      });
    },
  });
}

export function useUpdateEditorAutomationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: EditorAutomationSetting) =>
      api.settings.set('editorAutomation', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'editorAutomation'] as const;
      await queryClient.cancelQueries({ queryKey });
      const hadPrevious = queryClient.getQueryData(queryKey) !== undefined;
      const previous =
        queryClient.getQueryData<EditorAutomationSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { hadPrevious, previous };
    },
    onError: (_error, _value, context) => {
      if (context?.hadPrevious) {
        queryClient.setQueryData(
          ['settings', 'editorAutomation'],
          context.previous,
        );
      } else {
        queryClient.removeQueries({
          queryKey: ['settings', 'editorAutomation'],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'editorAutomation'],
      });
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
    onMutate: async (value) => {
      const queryKey = ['settings', 'backends'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BackendsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings', 'backends'], context.previous);
      }
    },
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

export function useAppearanceSetting() {
  return useSetting('appearance');
}

export function useUpdateAppearanceSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: AppearanceSetting) =>
      api.settings.set('appearance', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'appearance'] as const;
      await queryClient.cancelQueries({ queryKey });
      const hadPrevious = queryClient.getQueryData(queryKey) !== undefined;
      const previous = queryClient.getQueryData<AppearanceSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { hadPrevious, previous };
    },
    onError: (_error, _value, context) => {
      if (context?.hadPrevious) {
        queryClient.setQueryData(['settings', 'appearance'], context.previous);
      } else {
        queryClient.removeQueries({ queryKey: ['settings', 'appearance'] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'appearance'] });
    },
  });
}

export function useUpdateUsageDisplaySetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: UsageDisplaySetting) =>
      api.usageDisplay.saveSettings(value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'usageDisplay'],
      });
      queryClient.invalidateQueries({ queryKey: ['backend-usage'] });
    },
  });
}

export function useSummaryModelsSetting() {
  return useSetting('summaryModels');
}

export function useBackendDefaultModelsSetting() {
  return useSetting('backendDefaultModels');
}

// Convenience hooks for rate limit swap setting
export function useRateLimitSwapSetting() {
  return useSetting('rateLimitSwap');
}

export function useUpdateRateLimitSwapSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: RateLimitSwapSetting) =>
      api.settings.set('rateLimitSwap', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'rateLimitSwap'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RateLimitSwapSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'rateLimitSwap'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'rateLimitSwap'],
      });
    },
  });
}

export function useUpdateBackendDefaultModelsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: BackendDefaultModelsSetting) =>
      api.settings.set('backendDefaultModels', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'backendDefaultModels'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<BackendDefaultModelsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'backendDefaultModels'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'backendDefaultModels'],
      });
    },
  });
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

export function useThinkingSettingsSetting() {
  return useSetting('thinkingSettings');
}

export function useUpdateThinkingSettingsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: ThinkingSettingsSetting) =>
      api.settings.set('thinkingSettings', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'thinkingSettings'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<ThinkingSettingsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'thinkingSettings'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'thinkingSettings'],
      });
    },
  });
}

export function useBackendModelPresetsSetting() {
  return useSetting('backendModelPresets');
}

export function usePromptPrefaceSetting() {
  return useSetting('promptPreface');
}

export function useUpdatePromptPrefaceSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: PromptPrefaceSetting) =>
      api.settings.set('promptPreface', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'promptPreface'],
      });
    },
  });
}

export function useProjectPromptPrefaceSetting(projectPath: string) {
  return useQuery({
    queryKey: ['projectPromptPreface', projectPath],
    queryFn: () => api.projectPromptPreface.get(projectPath),
    enabled: !!projectPath,
  });
}

export function useUpdateProjectPromptPrefaceSetting(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: ProjectPromptPrefaceSetting) =>
      api.projectPromptPreface.set(projectPath, value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['projectPromptPreface', projectPath],
      });
    },
  });
}

export function useUpdateBackendModelPresetsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: BackendModelPresetsSetting) =>
      api.settings.set('backendModelPresets', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'backendModelPresets'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<BackendModelPresetsSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'backendModelPresets'],
          context.previous,
        );
      }
    },
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

export function useAiGenerationSetting() {
  return useSetting('aiGeneration');
}

export function useSaveAiGenerationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: {
      openAiApiKey: string;
      openAiImageGenerationEnabled: boolean;
      openAiImageModel: string;
      openAiLogoPromptContext: string;
    }) => api.aiGeneration.saveSettings(value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'aiGeneration'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AiGenerationSetting>(queryKey);
      queryClient.setQueryData(queryKey, (current: AiGenerationSetting) => ({
        ...current,
        openAiApiKey:
          value.openAiApiKey.trim() || current?.openAiApiKey ? 'stored' : '',
        openAiImageGenerationEnabled: value.openAiImageGenerationEnabled,
        openAiImageModel: value.openAiImageModel,
        openAiLogoPromptContext: value.openAiLogoPromptContext,
      }));
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['settings', 'aiGeneration'],
          context.previous,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'aiGeneration'] });
    },
  });
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
