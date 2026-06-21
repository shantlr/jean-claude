import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';



import { api } from '@/lib/api';
import type { CreateWorkItemVerificationNoteParams } from '@shared/work-item-verification-note-types';
import type { FeedItem } from '@shared/feed-types';
import { feedQueryKeys } from '@/lib/feed-query-keys';


export function useCreateFeedNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { content: string }) => api.feed.createNote(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.notes });
    },
  });
}

export function useCreateWorkItemVerificationNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateWorkItemVerificationNoteParams) =>
      api.feed.createWorkItemVerificationNote(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.notes });
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
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.notes });
    },
  });
}

/**
 * Returns a single feed note item by noteId, derived from the feed items query.
 */
export function useFeedNoteById(noteId: string) {
  const { data: items, isLoading } = useQuery({
    queryKey: feedQueryKeys.notes,
    queryFn: async () => api.feed.getNoteItems(),
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
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.notes });
    },
  });
}
