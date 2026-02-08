import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { NewProject, UpdateProject } from '@shared/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.findAll,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.findById(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProject) => api.projects.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProject }) =>
      api.projects.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useReorderProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => api.projects.reorder(orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProjectBranches(projectId: string | null) {
  return useQuery({
    queryKey: ['project-branches', projectId],
    queryFn: () => {
      if (!projectId) return [];
      return api.projects.getBranches(projectId);
    },
    enabled: !!projectId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useProjectCurrentBranch(projectId: string | null) {
  return useQuery({
    queryKey: ['project-current-branch', projectId],
    queryFn: () => {
      if (!projectId) return null;
      return api.projects.getCurrentBranch(projectId);
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 2000, // Consider stale after 2 seconds
  });
}
