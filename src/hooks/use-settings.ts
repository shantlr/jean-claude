import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AiSkillSlotsSetting,
  AppSettings,
  BackendsSetting,
  EditorSetting,
  SummaryModelsSetting,
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
