import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import type { FeedItem } from '@shared/feed-types';

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

/**
 * Returns a single feed note item by noteId, derived from the feed items query.
 */
export function useFeedNoteById(noteId: string) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['feed', 'items'],
    queryFn: async () => api.feed.getItems(),
  });

  const note = useMemo(
    () =>
      items?.find(
        (item): item is FeedItem & { noteId: string } =>
          item.source === 'note' && item.noteId === noteId,
      ),
    [items, noteId],
  );

  return { note, isLoading };
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
