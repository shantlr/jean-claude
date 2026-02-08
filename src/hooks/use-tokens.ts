import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { NewToken, UpdateToken } from '@shared/types';

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: api.tokens.findAll,
  });
}

export function useToken(id: string) {
  return useQuery({
    queryKey: ['tokens', id],
    queryFn: () => api.tokens.findById(id),
    enabled: !!id,
  });
}

export function useTokensByProviderType(providerType: string) {
  return useQuery({
    queryKey: ['tokens', 'byProviderType', providerType],
    queryFn: () => api.tokens.findByProviderType(providerType),
    enabled: !!providerType,
  });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewToken) => api.tokens.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

export function useUpdateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateToken }) =>
      api.tokens.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['tokens', id] });
    },
  });
}

export function useDeleteToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tokens.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
}
