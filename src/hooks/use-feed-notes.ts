import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useCreateFeedNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { content: string }) => api.feed.createNote(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
    },
  });
}

export function useUpdateFeedNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      content?: string;
      completedAt?: string | null;
    }) => api.feed.updateNote(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
    },
  });
}

export function useDeleteFeedNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string }) => api.feed.deleteNote(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
    },
  });
}
