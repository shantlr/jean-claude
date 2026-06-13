import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import type {
  InteractionMode,
  ModelPreference,
  TaskStep,
  TaskStepMeta,
  TaskStepType,
  ThinkingEffort,
} from '@shared/types';

import { AgentMessageRepository } from '../database/repositories/agent-messages';
import { ProjectRepository } from '../database/repositories/projects';
import { SettingsRepository } from '../database/repositories/settings';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { TaskRepository } from '../database/repositories/tasks';
import { createDebug } from '../lib/debug';

import { summarizeNormalizedMessages } from './session-summary-service';
import { buildSummaryGenerationPrompt } from './session-summary-service';

const debug = createDebug('jc:step-service');

function canUseStepAsContinueSource(status: TaskStep['status']): boolean {
  return (
    status === 'completed' || status === 'interrupted' || status === 'errored'
  );
}

/**
 * Simple text condensation fallback for `{{summary(...)}}` when the argument
 * resolves to a raw value rather than a step reference (which uses normalized
 * messages instead). Collapses whitespace and truncates to 320 characters.
 */
function condenseText(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const condensed = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!condensed) return '';
  if (condensed.length <= 320) return condensed;
  return `${condensed.slice(0, 317).trim()}...`;
}

async function resolvePromptTemplate({
  template,
  taskPrompt,
  taskName,
  taskId,
  projectId,
  steps,
  summaryBackend,
  summaryModels,
  onSummaryLifecycle,
}: {
  template: string;
  taskPrompt: string;
  taskName: string | null;
  taskId: string;
  projectId: string;
  steps: TaskStep[];
  summaryBackend: AgentBackendType;
  summaryModels: Record<
    import('@shared/agent-backend-types').AgentBackendType,
    import('@shared/types').ModelPreference
  >;
  onSummaryLifecycle?: {
    onStart?: (step: TaskStep, prompt: string) => Promise<void> | void;
    onResolved?: (step: TaskStep, summary: string) => Promise<void> | void;
  };
}): Promise<{ resolvedPrompt: string; warnings: string[] }> {
  const warnings: string[] = [];

  // {{step.<id>}} is an alias for {{step.<id>.output}} — both return step.output.
  function resolveValueExpression(expression: string): string {
    if (expression === 'task.prompt') return taskPrompt;
    if (expression === 'task.name') return taskName ?? '';

    const stepMatch = expression.match(/^step\.([a-zA-Z0-9_-]+)(?:\.output)?$/);
    if (stepMatch) {
      const stepId = stepMatch[1];
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        warnings.push(`Unknown step ID: ${stepId}`);
        return `{{${expression}}}`;
      }
      if (!canUseStepAsContinueSource(step.status)) {
        warnings.push(`Step "${step.name}" (${stepId}) is not completed`);
        return `{{${expression}}}`;
      }
      if (step.output === null) {
        warnings.push(`Step "${step.name}" (${stepId}) has no output`);
        return '';
      }
      return step.output;
    }

    warnings.push(`Unknown expression: ${expression}`);
    return `{{${expression}}}`;
  }

  async function resolveSummaryExpression(
    argExpression: string,
  ): Promise<string> {
    const stepMatch = argExpression.match(
      /^step\.([a-zA-Z0-9_-]+)(?:\.output)?$/,
    );
    if (stepMatch) {
      const stepId = stepMatch[1];
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        throw new Error(`Failed to summarize: unknown step ID ${stepId}`);
      }

      if (!canUseStepAsContinueSource(step.status)) {
        throw new Error(
          `Failed to summarize: step "${step.name}" (${stepId}) is not in a summarizable terminal state (status: ${step.status})`,
        );
      }

      const messages = await AgentMessageRepository.findByStepId(step.id);
      if (messages.length === 0) {
        throw new Error(
          `Failed to summarize: step "${step.name}" (${stepId}) has no messages`,
        );
      }

      const model = summaryModels[summaryBackend] ?? 'default';
      const summaryStartedAt = Date.now();
      const summaryPrompt = buildSummaryGenerationPrompt(messages);

      try {
        debug(
          'Starting prompt summary for step %s (%s): sourceStep=%s backend=%s model=%s messages=%d',
          stepId,
          step.name,
          step.id,
          summaryBackend,
          model,
          messages.length,
        );
        await onSummaryLifecycle?.onStart?.(step, summaryPrompt);
        const summary = await summarizeNormalizedMessages({
          backend: summaryBackend,
          model,
          messages,
          usageContext: {
            feature: 'step-summary',
            projectId,
            taskId,
            stepId: step.id,
          },
        });
        debug(
          'Finished prompt summary for step %s (%s): sourceStep=%s durationMs=%d summaryLength=%d',
          stepId,
          step.name,
          step.id,
          Date.now() - summaryStartedAt,
          summary.length,
        );
        await onSummaryLifecycle?.onResolved?.(step, summary);
        return summary;
      } catch (error) {
        debug(
          'Prompt summary failed for step %s (%s): sourceStep=%s durationMs=%d error=%O',
          stepId,
          step.name,
          step.id,
          Date.now() - summaryStartedAt,
          error,
        );
        throw new Error(
          `Failed to summarize step "${step.name}" (${stepId}) using backend ${summaryBackend}`,
        );
      }
    }

    const rawValue = resolveValueExpression(argExpression);
    if (rawValue.startsWith('{{') && rawValue.endsWith('}}')) {
      throw new Error(
        `Failed to summarize: unresolved expression ${argExpression}`,
      );
    }
    return condenseText(rawValue);
  }

  async function resolveTemplate(): Promise<string> {
    const pattern = /\{\{(.+?)\}\}/g;
    let result = '';
    let cursor = 0;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(template)) !== null) {
      result += template.slice(cursor, match.index);

      const expression = match[1]?.trim() ?? '';
      const summaryMatch = expression.match(/^summary\((.+)\)$/);

      if (summaryMatch) {
        const argExpression = summaryMatch[1]?.trim();
        if (!argExpression) {
          warnings.push('summary() requires one argument');
          result += match[0];
        } else {
          result += await resolveSummaryExpression(argExpression);
        }
      } else {
        result += resolveValueExpression(expression);
      }

      cursor = match.index + match[0].length;
    }

    result += template.slice(cursor);
    return result;
  }

  const resolvedPrompt = await resolveTemplate();
  return { resolvedPrompt, warnings };
}

/**
 * Returns the step with the most recent `updatedAt` timestamp, or undefined if
 * the array is empty.  ISO-8601 strings are compared lexicographically which is
 * equivalent to chronological order.
 */
export function getMostRecentlyUpdatedStep(
  steps: TaskStep[],
): TaskStep | undefined {
  return steps.reduce<TaskStep | undefined>(
    (latest, s) => (!latest || s.updatedAt > latest.updatedAt ? s : latest),
    undefined,
  );
}

/**
 * Compute task status from step statuses.
 */
function computeTaskStatus(
  steps: TaskStep[],
): 'running' | 'errored' | 'interrupted' | 'completed' | 'waiting' {
  if (steps.some((s) => s.status === 'running')) return 'running';

  // Use the most recently updated step's status for errored/interrupted rather
  // than any step, so that earlier failed steps don't keep the task marked as
  // errored once a newer step has progressed past that state.
  const mostRecentStep = getMostRecentlyUpdatedStep(steps);
  if (mostRecentStep?.status === 'errored') return 'errored';
  if (mostRecentStep?.status === 'interrupted') return 'interrupted';

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
 * Returns IDs of steps that became ready and have autoStart enabled.
 */
async function updateDependentStepStatuses(taskId: string): Promise<string[]> {
  const steps = await TaskStepRepository.findByTaskId(taskId);
  const terminalIds = new Set(
    steps.filter((s) => canUseStepAsContinueSource(s.status)).map((s) => s.id),
  );

  const autoStartStepIds: string[] = [];

  for (const step of steps) {
    if (step.status !== 'pending') continue;
    const allDepsCompleted = step.dependsOn.every((depId) =>
      terminalIds.has(depId),
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

      if (step.autoStart) {
        autoStartStepIds.push(step.id);
      }
    }
  }

  return autoStartStepIds;
}

export const StepService = {
  findByTaskId: (taskId: string) => TaskStepRepository.findByTaskId(taskId),

  findById: (id: string) => TaskStepRepository.findById(id),

  create: async (data: {
    taskId: string;
    name: string;
    type?: TaskStepType;
    dependsOn?: string[];
    promptTemplate: string;
    interactionMode?: InteractionMode | null;
    modelPreference?: ModelPreference | null;
    thinkingEffort?: ThinkingEffort | null;
    agentBackend?: AgentBackendType | null;
    images?: PromptImagePart[] | null;
    meta?: TaskStepMeta;
    autoStart?: boolean;
    sortOrder?: number;
  }): Promise<TaskStep> => {
    debug('create step taskId=%s name=%s', data.taskId, data.name);
    const createdStep = await TaskStepRepository.create(
      data as Parameters<typeof TaskStepRepository.create>[0],
    );
    debug(
      'created step id=%s status=%s dependsOn=%d autoStart=%s',
      createdStep.id,
      createdStep.status,
      createdStep.dependsOn.length,
      createdStep.autoStart ? 'yes' : 'no',
    );

    if ((data.dependsOn?.length ?? 0) > 0) {
      debug(
        're-evaluating dependent statuses after create step=%s taskId=%s',
        createdStep.id,
        data.taskId,
      );
      await updateDependentStepStatuses(data.taskId);
      const refreshedStep = await TaskStepRepository.findById(createdStep.id);
      if (refreshedStep) {
        debug(
          'refreshed created step id=%s status=%s dependsOn=%d autoStart=%s',
          refreshedStep.id,
          refreshedStep.status,
          refreshedStep.dependsOn.length,
          refreshedStep.autoStart ? 'yes' : 'no',
        );
        return refreshedStep;
      }
    }

    return createdStep;
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
    options?: {
      onSummaryLifecycle?: {
        onStart?: (step: TaskStep, prompt: string) => Promise<void> | void;
        onResolved?: (step: TaskStep, summary: string) => Promise<void> | void;
      };
    },
  ): Promise<{
    resolvedPrompt: string;
    step: TaskStep;
    warnings: string[];
  }> => {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    const task = await TaskRepository.findById(step.taskId);
    if (!task) throw new Error(`Task not found for step: ${stepId}`);

    const project = await ProjectRepository.findById(task.projectId);
    if (!project)
      throw new Error(`Project not found for task: ${task.projectId}`);

    const summaryModelsSetting = await SettingsRepository.get('summaryModels');

    const steps = await TaskStepRepository.findByTaskId(step.taskId);

    // Validate all dependencies are completed
    for (const depId of step.dependsOn) {
      const dep = steps.find((s) => s.id === depId);
      if (!dep) throw new Error(`Dependency step not found: ${depId}`);
      if (!canUseStepAsContinueSource(dep.status)) {
        throw new Error(
          `Dependency "${dep.name}" (${depId}) is not in a terminal summarizable state (status: ${dep.status})`,
        );
      }
    }

    const summaryBackend = (step.agentBackend ??
      project.defaultAgentBackend ??
      'claude-code') as AgentBackendType;

    debug(
      'Resolving prompt template for step %s (%s): backend=%s dependsOn=%d',
      step.id,
      step.name,
      summaryBackend,
      step.dependsOn.length,
    );

    // Resolve template
    const { resolvedPrompt, warnings } = await resolvePromptTemplate({
      template: step.promptTemplate,
      taskPrompt: task.prompt,
      taskName: task.name,
      taskId: task.id,
      projectId: task.projectId,
      steps,
      summaryBackend,
      summaryModels: summaryModelsSetting.models,
      onSummaryLifecycle: options?.onSummaryLifecycle,
    });

    debug(
      'Resolved prompt template for step %s (%s): warnings=%d promptLength=%d',
      step.id,
      step.name,
      warnings.length,
      resolvedPrompt.length,
    );

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
   * Returns IDs of dependent steps that became ready and have autoStart enabled.
   */
  completeStep: async (stepId: string): Promise<string[]> => {
    const output = await StepService.captureOutput(stepId);
    await TaskStepRepository.update(stepId, { status: 'completed', output });

    const step = await TaskStepRepository.findById(stepId);
    if (step) {
      const autoStartStepIds = await updateDependentStepStatuses(step.taskId);
      await StepService.syncTaskStatus(step.taskId);
      return autoStartStepIds;
    }
    return [];
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
