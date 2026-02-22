import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useProjectFilePaths({
  projectRoot,
  enabled = true,
}: {
  projectRoot: string | null;
  enabled?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['project-file-paths', projectRoot],
    queryFn: () => {
      if (!projectRoot) return [];
      return api.fs.listProjectFiles(projectRoot);
    },
    enabled: enabled && !!projectRoot,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    filePaths: data ?? [],
    isLoading,
  };
}

export function getFilePathSuggestions({
  filePaths,
  query,
  limit,
}: {
  filePaths: string[];
  query: string;
  limit: number;
}) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return filePaths.slice(0, limit);
  }

  function getFuzzyScore(pathValue: string, queryValue: string): number | null {
    let queryIndex = 0;
    let score = 0;
    let consecutive = 0;

    for (let pathIndex = 0; pathIndex < pathValue.length; pathIndex++) {
      if (queryIndex >= queryValue.length) break;

      if (pathValue[pathIndex] === queryValue[queryIndex]) {
        const isAtStart = pathIndex === 0;
        const isSegmentStart =
          pathIndex > 0 && pathValue[pathIndex - 1] === '/';
        const isWordBoundary =
          pathIndex > 0 && ['-', '_', '.'].includes(pathValue[pathIndex - 1]);

        if (isAtStart) {
          score += 80;
        } else if (isSegmentStart) {
          score += 55;
        } else if (isWordBoundary) {
          score += 40;
        } else {
          score += 18;
        }

        score += consecutive * 12;
        consecutive += 1;
        queryIndex += 1;
      } else {
        consecutive = 0;
      }
    }

    if (queryIndex !== queryValue.length) {
      return null;
    }

    const lengthPenalty = Math.floor(pathValue.length / 4);
    return score - lengthPenalty;
  }

  const matches = filePaths
    .map((filePath) => {
      const lowerPath = filePath.toLowerCase();
      const fuzzyScore = getFuzzyScore(lowerPath, normalizedQuery);
      if (fuzzyScore === null) return null;

      let boost = 0;
      const basename = lowerPath.slice(lowerPath.lastIndexOf('/') + 1);
      if (lowerPath.startsWith(normalizedQuery)) boost += 200;
      if (basename.startsWith(normalizedQuery)) boost += 100;
      if (lowerPath.includes(`/${normalizedQuery}`)) boost += 60;
      if (lowerPath.includes(normalizedQuery)) boost += 30;

      return {
        filePath,
        score: fuzzyScore + boost,
      };
    })
    .filter((entry): entry is { filePath: string; score: number } => !!entry)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.filePath.length !== b.filePath.length) {
        return a.filePath.length - b.filePath.length;
      }
      return a.filePath.localeCompare(b.filePath);
    });

  return matches.slice(0, limit).map((entry) => entry.filePath);
}
