import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ProviderDetails } from '@/lib/api';
import { NewProvider, UpdateProvider } from '@shared/types';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: api.providers.findAll,
  });
}

export function useProvider(id: string) {
  return useQuery({
    queryKey: ['providers', id],
    queryFn: () => api.providers.findById(id),
    enabled: !!id,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProvider) => api.providers.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProvider }) =>
      api.providers.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers', id] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.providers.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });
}

export function useProviderDetails(providerId: string, enabled = true) {
  return useQuery<ProviderDetails, Error>({
    queryKey: ['providers', providerId, 'details'],
    queryFn: () => api.providers.getDetails(providerId),
    enabled: enabled && !!providerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
