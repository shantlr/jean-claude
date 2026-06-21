import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  ensureStepInTaskIndex,
  ingestStep,
  ingestTaskSteps,
  markStepListsStale,
  selectStep,
  selectTaskSteps,
  stepResourceKey,
  taskStepsResourceKey,
} from '@/cache/domains/steps';
import type { NewTaskStep, TaskStep, UpdateTaskStep } from '@shared/types';
import { api } from '@/lib/api';
import { useCacheResource } from '@/cache/use-cache-resource';



export function useSteps(taskId: string) {
  return useCacheResource({
    key: taskStepsResourceKey(taskId),
    load: () => api.steps.findByTaskId(taskId),
    ingest: (steps) => ingestTaskSteps(taskId, steps),
    enabled: !!taskId,
    select: () => selectTaskSteps(taskId),
  });
}

export function useStep(stepId: string) {
  return useCacheResource({
    key: stepResourceKey(stepId),
    load: () => api.steps.findById(stepId),
    ingest: (step) => {
      if (step) {
        ingestStep(step);
      }
    },
    enabled: !!stepId,
    select: () => selectStep(stepId),
  });
}

export function useCreateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTaskStep & { start?: boolean }) =>
      api.steps.create(data),
    onSuccess: (step: TaskStep) => {
      ingestStep(step);
      ensureStepInTaskIndex(step);
      // Optimistically add the new step to the cache so the auto-select
      // effect in TaskPanel sees it immediately (prevents a race where the
      // stale steps array causes activeStepId to be reset before the
      // refetch completes).
      queryClient.setQueryData(
        ['steps', { taskId: step.taskId }],
        (old: TaskStep[] | undefined) => {
          if (!old) return [step];

          const shifted = old.map((existingStep) =>
            existingStep.sortOrder >= step.sortOrder
              ? { ...existingStep, sortOrder: existingStep.sortOrder + 1 }
              : existingStep,
          );

          return [...shifted, step].sort((a, b) => a.sortOrder - b.sortOrder);
        },
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
      ingestStep(step);
      markStepListsStale(step.taskId);
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
      ingestStep(step);
      markStepListsStale(step.taskId);
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
