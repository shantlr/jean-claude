import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const api = window.api;

export function useDirectoryListing({
  dirPath,
  projectRoot,
  enabled = true,
}: {
  dirPath: string | null;
  projectRoot: string;
  enabled?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['directory-listing', dirPath],
    queryFn: () => {
      if (!dirPath) return null;
      return api.fs.listDirectory(dirPath, projectRoot);
    },
    enabled: enabled && !!dirPath,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return { entries: data ?? null, isLoading, error };
}

export function useInvalidateDirectoryListings() {
  const queryClient = useQueryClient();

  return useCallback(
    (projectRoot: string) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'directory-listing' &&
          typeof query.queryKey[1] === 'string' &&
          (query.queryKey[1] as string).startsWith(projectRoot),
      });
    },
    [queryClient],
  );
}
