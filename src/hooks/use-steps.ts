import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { NewTaskStep, TaskStep, UpdateTaskStep } from '@shared/types';

export function useSteps(taskId: string) {
  return useQuery({
    queryKey: ['steps', { taskId }],
    queryFn: () => api.steps.findByTaskId(taskId),
    enabled: !!taskId,
  });
}

export function useStep(stepId: string) {
  return useQuery({
    queryKey: ['steps', stepId],
    queryFn: () => api.steps.findById(stepId),
    enabled: !!stepId,
  });
}

export function useCreateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTaskStep & { start?: boolean }) =>
      api.steps.create(data),
    onSuccess: (step: TaskStep) => {
      // Optimistically add the new step to the cache so the auto-select
      // effect in TaskPanel sees it immediately (prevents a race where the
      // stale steps array causes activeStepId to be reset before the
      // refetch completes).
      queryClient.setQueryData(
        ['steps', { taskId: step.taskId }],
        (old: TaskStep[] | undefined) => (old ? [...old, step] : [step]),
      );
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
    },
  });
}

export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: UpdateTaskStep }) =>
      api.steps.update(stepId, data),
    onSuccess: (step: TaskStep) => {
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
    },
  });
}

export function useResolveStepPrompt() {
  return useMutation({
    mutationFn: (stepId: string) => api.steps.resolvePrompt(stepId),
  });
}

export function useSubmitPrReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => api.steps.submitPrReview(stepId),
    onSuccess: (step: TaskStep) => {
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
