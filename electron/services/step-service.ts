import type { TaskStep } from '@shared/types';

import { AgentMessageRepository } from '../database/repositories/agent-messages';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { TaskRepository } from '../database/repositories/tasks';
import { createDebug } from '../lib/debug';

const debug = createDebug('jc:step-service');

/**
 * Resolve template expressions in a prompt template.
 * Supported: {{task.prompt}}, {{task.name}}, {{step.<id>.output}}
 */
function resolvePromptTemplate({
  template,
  taskPrompt,
  taskName,
  steps,
}: {
  template: string;
  taskPrompt: string;
  taskName: string | null;
  steps: TaskStep[];
}): { resolvedPrompt: string; warnings: string[] } {
  const warnings: string[] = [];

  const resolved = template.replace(
    /\{\{(.+?)\}\}/g,
    (match, expression: string) => {
      const trimmed = expression.trim();

      if (trimmed === 'task.prompt') return taskPrompt;
      if (trimmed === 'task.name') return taskName ?? '';

      const stepMatch = trimmed.match(/^step\.(.+?)\.output$/);
      if (stepMatch) {
        const stepId = stepMatch[1];
        const step = steps.find((s) => s.id === stepId);
        if (!step) {
          warnings.push(`Unknown step ID: ${stepId}`);
          return match; // Leave expression as-is
        }
        if (step.status !== 'completed') {
          warnings.push(`Step "${step.name}" (${stepId}) is not completed`);
          return match;
        }
        if (step.output === null) {
          warnings.push(`Step "${step.name}" (${stepId}) has no output`);
          return '';
        }
        return step.output;
      }

      warnings.push(`Unknown expression: ${trimmed}`);
      return match;
    },
  );

  return { resolvedPrompt: resolved, warnings };
}

/**
 * Compute task status from step statuses.
 */
function computeTaskStatus(
  steps: TaskStep[],
): 'running' | 'errored' | 'interrupted' | 'completed' | 'waiting' {
  if (steps.some((s) => s.status === 'running')) return 'running';
  if (steps.some((s) => s.status === 'errored')) return 'errored';
  if (steps.some((s) => s.status === 'interrupted')) return 'interrupted';
  if (steps.length > 0 && steps.every((s) => s.status === 'completed'))
    return 'completed';
  return 'waiting';
}

/**
 * Extract a JSON array of review comments from fenced ```json blocks in text.
 */
function extractReviewComments(output: string): {
  comments: Array<{ filePath: string; lineNumber: number; comment: string }>;
  error?: string;
} {
  const jsonMatch = output.match(/```json\s*\n([\s\S]*?)```/);
  if (!jsonMatch) {
    return { comments: [], error: 'No ```json block found in agent output' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as unknown;
    if (!Array.isArray(parsed)) {
      return { comments: [], error: 'JSON block is not an array' };
    }

    const comments: Array<{
      filePath: string;
      lineNumber: number;
      comment: string;
    }> = [];
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).filePath === 'string' &&
        typeof (item as Record<string, unknown>).lineNumber === 'number' &&
        typeof (item as Record<string, unknown>).comment === 'string'
      ) {
        comments.push({
          filePath: (item as Record<string, unknown>).filePath as string,
          lineNumber: (item as Record<string, unknown>).lineNumber as number,
          comment: (item as Record<string, unknown>).comment as string,
        });
      }
    }

    if (comments.length === 0 && parsed.length > 0) {
      return {
        comments: [],
        error: `JSON array has ${parsed.length} items but none match {filePath, lineNumber, comment} shape`,
      };
    }

    return { comments };
  } catch (e) {
    return {
      comments: [],
      error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * After a step completes, check if any dependent steps should transition from pending to ready.
 */
async function updateDependentStepStatuses(taskId: string): Promise<void> {
  const steps = await TaskStepRepository.findByTaskId(taskId);
  const completedIds = new Set(
    steps.filter((s) => s.status === 'completed').map((s) => s.id),
  );

  for (const step of steps) {
    if (step.status !== 'pending') continue;
    const allDepsCompleted = step.dependsOn.every((depId) =>
      completedIds.has(depId),
    );
    if (allDepsCompleted) {
      if (step.type === 'pr-review') {
        const depStep = steps.find((s) => s.id === step.dependsOn[0]);
        const output = depStep?.output ?? '';
        const { comments, error } = extractReviewComments(output);

        const currentMeta = (step.meta ?? {}) as Record<string, unknown>;
        const updatedMeta = {
          ...currentMeta,
          comments: comments.map((c) => ({ ...c, enabled: true })),
          parseError: error ?? undefined,
        };

        await TaskStepRepository.update(step.id, {
          status: 'ready',
          meta: updatedMeta as import('@shared/types').TaskStepMeta,
        });
      } else {
        await TaskStepRepository.update(step.id, { status: 'ready' });
      }
    }
  }
}

export const StepService = {
  findByTaskId: (taskId: string) => TaskStepRepository.findByTaskId(taskId),

  findById: (id: string) => TaskStepRepository.findById(id),

  create: async (data: {
    taskId: string;
    name: string;
    dependsOn?: string[];
    promptTemplate: string;
    interactionMode?: string | null;
    modelPreference?: string | null;
    agentBackend?: string | null;
    images?: import('@shared/agent-backend-types').PromptImagePart[] | null;
    sortOrder?: number;
  }): Promise<TaskStep> => {
    debug('create step taskId=%s name=%s', data.taskId, data.name);
    return TaskStepRepository.create(
      data as Parameters<typeof TaskStepRepository.create>[0],
    );
  },

  update: async (
    stepId: string,
    data: Parameters<typeof TaskStepRepository.update>[1],
  ): Promise<TaskStep> => {
    debug('update step=%s %o', stepId, Object.keys(data));
    return TaskStepRepository.update(stepId, data);
  },

  delete: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) return;

    // Remove this stepId from other steps' dependsOn arrays
    const siblings = await TaskStepRepository.findByTaskId(step.taskId);
    for (const sibling of siblings) {
      if (sibling.dependsOn.includes(stepId)) {
        const newDeps = sibling.dependsOn.filter((id) => id !== stepId);
        await TaskStepRepository.update(sibling.id, { dependsOn: newDeps });
      }
    }

    await TaskStepRepository.delete(stepId);

    // Re-evaluate dependent statuses
    await updateDependentStepStatuses(step.taskId);
    await StepService.syncTaskStatus(step.taskId);
  },

  reorder: (taskId: string, stepIds: string[]) =>
    TaskStepRepository.reorder(taskId, stepIds),

  /**
   * Resolve the prompt template and validate dependencies before starting a step.
   * Returns the resolved prompt string.
   */
  resolveAndValidate: async (
    stepId: string,
  ): Promise<{
    resolvedPrompt: string;
    step: TaskStep;
    warnings: string[];
  }> => {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    const task = await TaskRepository.findById(step.taskId);
    if (!task) throw new Error(`Task not found for step: ${stepId}`);

    const steps = await TaskStepRepository.findByTaskId(step.taskId);

    // Validate all dependencies are completed
    for (const depId of step.dependsOn) {
      const dep = steps.find((s) => s.id === depId);
      if (!dep) throw new Error(`Dependency step not found: ${depId}`);
      if (dep.status !== 'completed') {
        throw new Error(
          `Dependency "${dep.name}" (${depId}) is not completed (status: ${dep.status})`,
        );
      }
    }

    // Resolve template
    const { resolvedPrompt, warnings } = resolvePromptTemplate({
      template: step.promptTemplate,
      taskPrompt: task.prompt,
      taskName: task.name,
      steps,
    });

    // Save resolved prompt
    await TaskStepRepository.update(stepId, { resolvedPrompt });

    return { resolvedPrompt, step, warnings };
  },

  /**
   * Capture the output from the last assistant message or result entry.
   */
  captureOutput: async (stepId: string): Promise<string | null> => {
    const messages = await AgentMessageRepository.findByStepId(stepId);
    if (messages.length === 0) return null;

    // Look for last 'result' entry
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'result' && msg.value) {
        return msg.value;
      }
    }

    // Fallback to last 'assistant-message'
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'assistant-message' && msg.value) {
        return msg.value;
      }
    }

    return null;
  },

  /**
   * Mark step as completed, capture output, update dependents, sync task status.
   */
  completeStep: async (stepId: string): Promise<void> => {
    const output = await StepService.captureOutput(stepId);
    await TaskStepRepository.update(stepId, { status: 'completed', output });

    const step = await TaskStepRepository.findById(stepId);
    if (step) {
      await updateDependentStepStatuses(step.taskId);
      await StepService.syncTaskStatus(step.taskId);
    }
  },

  /**
   * Mark step as errored, sync task status.
   */
  errorStep: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    await TaskStepRepository.update(stepId, { status: 'errored' });
    if (step) await StepService.syncTaskStatus(step.taskId);
  },

  /**
   * Mark step as interrupted, sync task status.
   */
  interruptStep: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    await TaskStepRepository.update(stepId, { status: 'interrupted' });
    if (step) await StepService.syncTaskStatus(step.taskId);
  },

  /**
   * Recompute and update task.status from step statuses.
   */
  syncTaskStatus: async (taskId: string): Promise<void> => {
    const steps = await TaskStepRepository.findByTaskId(taskId);
    const newStatus = computeTaskStatus(steps);
    debug('syncTaskStatus taskId=%s newStatus=%s', taskId, newStatus);
    await TaskRepository.update(taskId, { status: newStatus });
  },
};
