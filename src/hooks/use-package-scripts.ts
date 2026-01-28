import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function usePackageScripts(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['packageScripts', projectPath],
    queryFn: () => api.runCommands.getPackageScripts(projectPath!),
    enabled: !!projectPath,
  });
}
