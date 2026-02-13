import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AppSettings,
  BackendsSetting,
  EditorSetting,
} from '@shared/types';

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
