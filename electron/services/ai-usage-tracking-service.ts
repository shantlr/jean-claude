import { randomUUID } from 'crypto';

import type { AiUsageContext, AiUsageTokenInput } from '@shared/ai-usage-types';

import { dbg } from '../lib/debug';

import { AI_USAGE_PRICING_VERSION, estimateAiUsageCost } from './model-pricing';

type RecordUsageParams = {
  context: AiUsageContext;
  backend: string;
  model: string | null | undefined;
  usage: AiUsageTokenInput;
  allowEmptyUsage?: boolean;
  cost?: {
    costUsd?: number;
    apiCostUsd?: number;
  };
  sourceId?: string | null;
  incrementExisting?: boolean;
};

type PendingAutocompleteUsage = {
  date: string;
  backend: string;
  model: string;
  usage: AiUsageTokenInput;
};

const AUTOCOMPLETE_BATCH_MS = 5_000;
let autocompleteFlushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAutocompleteUsage = new Map<string, PendingAutocompleteUsage>();
const MIXED_AUTOCOMPLETE_VALUE = 'mixed';

function toInt(value: number | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

function addTokenUsage(
  current: AiUsageTokenInput,
  next: AiUsageTokenInput,
): AiUsageTokenInput {
  return {
    inputTokens: (current.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (current.outputTokens ?? 0) + (next.outputTokens ?? 0),
    cacheReadTokens:
      (current.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
    cacheCreationTokens:
      (current.cacheCreationTokens ?? 0) + (next.cacheCreationTokens ?? 0),
  };
}

function resolveModel(model: string | null | undefined): string {
  return model && model !== 'default' ? model : 'default';
}

export const aiUsageTrackingService = {
  async recordUsage({
    context,
    backend,
    model,
    usage,
    allowEmptyUsage,
    cost,
    sourceId,
    incrementExisting,
  }: RecordUsageParams): Promise<void> {
    // JC_DISABLE_USAGE_TRACKING only disables external rate-limit/usage polling.
    // This local ledger should still record app activity in temp/dev instances.

    const normalizedUsage = {
      inputTokens: toInt(usage.inputTokens),
      outputTokens: toInt(usage.outputTokens),
      cacheReadTokens: toInt(usage.cacheReadTokens),
      cacheCreationTokens: toInt(usage.cacheCreationTokens),
    };
    const totalTokens =
      normalizedUsage.inputTokens +
      normalizedUsage.outputTokens +
      normalizedUsage.cacheReadTokens +
      normalizedUsage.cacheCreationTokens;

    if (totalTokens === 0 && !allowEmptyUsage) {
      dbg.agent(
        'Skipping AI usage feature=%s backend=%s model=%s: zero tokens and empty usage not allowed',
        context.feature,
        backend,
        model ?? 'default',
      );
      return;
    }

    const resolvedModel = resolveModel(model);
    const { estimatedCostUsd, pricingStatus } = estimateAiUsageCost({
      model: resolvedModel,
      usage: normalizedUsage,
    });
    const createdAt = new Date().toISOString();

    dbg.agent(
      'Recording AI usage feature=%s backend=%s model=%s project=%s task=%s tokens=%d allowEmpty=%s source=%s',
      context.feature,
      backend,
      resolvedModel,
      context.projectId ?? '(none)',
      context.taskId ?? '(none)',
      totalTokens,
      !!allowEmptyUsage,
      sourceId ?? '(none)',
    );

    const { AiUsageRepository } = await import('../database/repositories');

    const event = {
      id: randomUUID(),
      createdAt,
      sourceId: sourceId ?? null,
      feature: context.feature,
      projectId: context.projectId,
      taskId: context.taskId ?? null,
      stepId: context.stepId ?? null,
      taskName: context.taskName ?? null,
      projectName: context.projectName ?? null,
      backend,
      model: resolvedModel,
      inputTokens: normalizedUsage.inputTokens,
      outputTokens: normalizedUsage.outputTokens,
      cacheReadTokens: normalizedUsage.cacheReadTokens,
      cacheCreationTokens: normalizedUsage.cacheCreationTokens,
      totalTokens,
      estimatedCostUsd,
      providerCostUsd: cost?.costUsd ?? null,
      providerApiCostUsd:
        cost?.apiCostUsd ??
        (backend === 'claude-code' ? estimatedCostUsd : null),
      pricingStatus,
      pricingVersion: AI_USAGE_PRICING_VERSION,
    };

    if (incrementExisting) {
      await AiUsageRepository.recordDelta(event);
    } else {
      await AiUsageRepository.record(event);
    }

    await Promise.all([
      context.taskId
        ? AiUsageRepository.rebuildTaskTotal(context.taskId)
        : Promise.resolve(),
      AiUsageRepository.rebuildDailyTotal(createdAt.slice(0, 10)),
    ]);

    dbg.agent(
      'Recorded AI usage feature=%s backend=%s model=%s tokens=%d source=%s',
      context.feature,
      backend,
      resolvedModel,
      totalTokens,
      sourceId ?? '(none)',
    );
  },

  recordUsageSafe(params: RecordUsageParams): void {
    this.recordUsage(params).catch((err) => {
      dbg.agent('Failed to record AI usage: %O', err);
    });
  },

  recordAutocompleteUsageBatched({
    backend,
    model,
    usage,
  }: {
    backend: string;
    model: string | null | undefined;
    usage: AiUsageTokenInput;
  }): void {
    const date = new Date().toISOString().slice(0, 10);
    const resolvedModel = resolveModel(model);
    const key = date;
    const existing = pendingAutocompleteUsage.get(key);
    pendingAutocompleteUsage.set(
      key,
      existing
        ? {
            ...existing,
            backend:
              existing.backend === backend ? backend : MIXED_AUTOCOMPLETE_VALUE,
            model:
              existing.model === resolvedModel
                ? resolvedModel
                : MIXED_AUTOCOMPLETE_VALUE,
            usage: addTokenUsage(existing.usage, usage),
          }
        : { date, backend, model: resolvedModel, usage },
    );

    if (autocompleteFlushTimer) return;
    autocompleteFlushTimer = setTimeout(() => {
      autocompleteFlushTimer = null;
      const pending = [...pendingAutocompleteUsage.values()];
      pendingAutocompleteUsage.clear();

      for (const item of pending) {
        this.recordUsage({
          context: {
            feature: 'autocomplete',
            projectId: null,
            taskId: null,
            stepId: null,
          },
          backend: item.backend,
          model: item.model,
          usage: item.usage,
          sourceId: `autocomplete:${item.date}`,
          incrementExisting: true,
        }).catch((err) => {
          dbg.agent('Failed to record batched autocomplete usage: %O', err);
        });
      }
    }, AUTOCOMPLETE_BATCH_MS);
  },
};
