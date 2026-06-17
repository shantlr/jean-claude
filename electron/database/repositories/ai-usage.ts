import { sql } from 'kysely';

import type {
  AiUsageDashboard,
  AiUsageDashboardParams,
  AiUsageEvent,
  AiUsageTaskUsage,
} from '@shared/ai-usage-types';

import { db } from '../index';
import type { NewAiUsageEventRow } from '../schema';

const emptyTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  providerCostUsd: 0,
  providerApiCostUsd: 0,
  requests: 0,
  taskCount: 0,
};

function addTotals<T extends typeof emptyTotals>(
  totals: T,
  event: AiUsageEvent,
): T {
  totals.inputTokens += event.inputTokens;
  totals.outputTokens += event.outputTokens;
  totals.cacheReadTokens += event.cacheReadTokens;
  totals.cacheCreationTokens += event.cacheCreationTokens;
  totals.totalTokens += event.totalTokens;
  totals.estimatedCostUsd += event.estimatedCostUsd;
  totals.providerCostUsd += event.providerCostUsd ?? 0;
  totals.providerApiCostUsd += event.providerApiCostUsd ?? 0;
  totals.requests += 1;
  return totals;
}

function eventFromRow(row: AiUsageEvent): AiUsageEvent {
  return {
    ...row,
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    cacheReadTokens: Number(row.cacheReadTokens),
    cacheCreationTokens: Number(row.cacheCreationTokens),
    totalTokens: Number(row.totalTokens),
    estimatedCostUsd: Number(row.estimatedCostUsd),
    providerCostUsd:
      row.providerCostUsd === null ? null : Number(row.providerCostUsd),
    providerApiCostUsd:
      row.providerApiCostUsd === null ? null : Number(row.providerApiCostUsd),
    taskName: row.taskName ?? null,
    projectName: row.projectName ?? null,
  };
}

function formatTaskPromptFallback(
  prompt: string | null | undefined,
): string | null {
  const firstLine = prompt?.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

async function getUsageDisplaySnapshot({
  taskId,
  projectId,
}: {
  taskId: string | null;
  projectId: string | null;
}): Promise<{ taskName: string | null; projectName: string | null }> {
  if (taskId) {
    const task = await db
      .selectFrom('tasks')
      .leftJoin('projects', 'projects.id', 'tasks.projectId')
      .select([
        'tasks.name as taskName',
        'tasks.prompt as taskPrompt',
        'projects.name as projectName',
      ])
      .where('tasks.id', '=', taskId)
      .executeTakeFirst();

    if (task) {
      return {
        taskName: task.taskName ?? formatTaskPromptFallback(task.taskPrompt),
        projectName: task.projectName ?? null,
      };
    }
  }

  if (projectId) {
    const project = await db
      .selectFrom('projects')
      .select('name')
      .where('id', '=', projectId)
      .executeTakeFirst();
    return { taskName: null, projectName: project?.name ?? null };
  }

  return { taskName: null, projectName: null };
}

export const AiUsageRepository = {
  async record(event: NewAiUsageEventRow): Promise<void> {
    const snapshot = await getUsageDisplaySnapshot({
      taskId: event.taskId ?? null,
      projectId: event.projectId ?? null,
    });
    const eventWithSnapshot = {
      ...event,
      taskName: event.taskName ?? snapshot.taskName,
      projectName: event.projectName ?? snapshot.projectName,
    };

    await db
      .insertInto('ai_usage_events')
      .values(eventWithSnapshot)
      .onConflict((oc) =>
        oc.column('sourceId').doUpdateSet({
          createdAt: eventWithSnapshot.createdAt,
          feature: eventWithSnapshot.feature,
          projectId: eventWithSnapshot.projectId ?? null,
          taskId: eventWithSnapshot.taskId ?? null,
          stepId: eventWithSnapshot.stepId ?? null,
          taskName: eventWithSnapshot.taskName ?? null,
          projectName: eventWithSnapshot.projectName ?? null,
          backend: eventWithSnapshot.backend,
          model: eventWithSnapshot.model,
          inputTokens: eventWithSnapshot.inputTokens,
          outputTokens: eventWithSnapshot.outputTokens,
          cacheReadTokens: eventWithSnapshot.cacheReadTokens,
          cacheCreationTokens: eventWithSnapshot.cacheCreationTokens,
          totalTokens: eventWithSnapshot.totalTokens,
          estimatedCostUsd: eventWithSnapshot.estimatedCostUsd,
          providerCostUsd: eventWithSnapshot.providerCostUsd,
          providerApiCostUsd: eventWithSnapshot.providerApiCostUsd,
          pricingStatus: eventWithSnapshot.pricingStatus,
          pricingVersion: eventWithSnapshot.pricingVersion,
        }),
      )
      .execute();
  },

  async recordDelta(event: NewAiUsageEventRow): Promise<void> {
    const snapshot = await getUsageDisplaySnapshot({
      taskId: event.taskId ?? null,
      projectId: event.projectId ?? null,
    });
    const eventWithSnapshot = {
      ...event,
      taskName: event.taskName ?? snapshot.taskName,
      projectName: event.projectName ?? snapshot.projectName,
    };

    await db
      .insertInto('ai_usage_events')
      .values(eventWithSnapshot)
      .onConflict((oc) =>
        oc.column('sourceId').doUpdateSet({
          createdAt: eventWithSnapshot.createdAt,
          feature: eventWithSnapshot.feature,
          projectId: eventWithSnapshot.projectId ?? null,
          taskId: eventWithSnapshot.taskId ?? null,
          stepId: eventWithSnapshot.stepId ?? null,
          taskName: eventWithSnapshot.taskName ?? null,
          projectName: eventWithSnapshot.projectName ?? null,
          backend: eventWithSnapshot.backend,
          model: eventWithSnapshot.model,
          inputTokens: sql`inputTokens + ${eventWithSnapshot.inputTokens}`,
          outputTokens: sql`outputTokens + ${eventWithSnapshot.outputTokens}`,
          cacheReadTokens: sql`cacheReadTokens + ${eventWithSnapshot.cacheReadTokens}`,
          cacheCreationTokens: sql`cacheCreationTokens + ${eventWithSnapshot.cacheCreationTokens}`,
          totalTokens: sql`totalTokens + ${eventWithSnapshot.totalTokens}`,
          estimatedCostUsd: sql`estimatedCostUsd + ${eventWithSnapshot.estimatedCostUsd}`,
          providerCostUsd: eventWithSnapshot.providerCostUsd,
          providerApiCostUsd: eventWithSnapshot.providerApiCostUsd,
          pricingStatus: eventWithSnapshot.pricingStatus,
          pricingVersion: eventWithSnapshot.pricingVersion,
        }),
      )
      .execute();
  },

  async rebuildTaskTotal(taskId: string): Promise<void> {
    const events = (await db
      .selectFrom('ai_usage_events')
      .selectAll()
      .where('taskId', '=', taskId)
      .execute()) as AiUsageEvent[];

    if (events.length === 0) return;

    const totals = events.map(eventFromRow).reduce(addTotals, {
      ...emptyTotals,
    });
    const projectId = events.find((event) => event.projectId)?.projectId;
    if (!projectId) return;
    const snapshot = await getUsageDisplaySnapshot({ taskId, projectId });

    await db
      .insertInto('ai_usage_task_totals')
      .values({
        taskId,
        projectId,
        taskName: snapshot.taskName,
        projectName: snapshot.projectName,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheCreationTokens: totals.cacheCreationTokens,
        totalTokens: totals.totalTokens,
        estimatedCostUsd: totals.estimatedCostUsd,
        providerCostUsd: totals.providerCostUsd,
        providerApiCostUsd: totals.providerApiCostUsd,
        requests: totals.requests,
        updatedAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.column('taskId').doUpdateSet({
          projectId,
          taskName: snapshot.taskName,
          projectName: snapshot.projectName,
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          cacheReadTokens: totals.cacheReadTokens,
          cacheCreationTokens: totals.cacheCreationTokens,
          totalTokens: totals.totalTokens,
          estimatedCostUsd: totals.estimatedCostUsd,
          providerCostUsd: totals.providerCostUsd,
          providerApiCostUsd: totals.providerApiCostUsd,
          requests: totals.requests,
          updatedAt: new Date().toISOString(),
        }),
      )
      .execute();
  },

  async rebuildDailyTotal(date: string): Promise<void> {
    const events = (await db
      .selectFrom('ai_usage_events')
      .selectAll()
      .where('createdAt', '>=', `${date}T00:00:00.000Z`)
      .where('createdAt', '<=', `${date}T23:59:59.999Z`)
      .execute()) as AiUsageEvent[];

    const groups = new Map<string, AiUsageEvent[]>();
    for (const event of events.map(eventFromRow)) {
      const key = `${event.feature}\n${event.backend}\n${event.model}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('ai_usage_daily_totals')
        .where('date', '=', date)
        .execute();

      for (const [key, groupedEvents] of groups) {
        const [feature, backend, model] = key.split('\n') as [
          AiUsageEvent['feature'],
          string,
          string,
        ];
        const totals = groupedEvents.reduce(addTotals, { ...emptyTotals });
        await trx
          .insertInto('ai_usage_daily_totals')
          .values({
            date,
            feature,
            backend,
            model,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheReadTokens: totals.cacheReadTokens,
            cacheCreationTokens: totals.cacheCreationTokens,
            totalTokens: totals.totalTokens,
            estimatedCostUsd: totals.estimatedCostUsd,
            providerCostUsd: totals.providerCostUsd,
            providerApiCostUsd: totals.providerApiCostUsd,
            requests: totals.requests,
            updatedAt: new Date().toISOString(),
          })
          .execute();
      }
    });
  },

  async getDashboard(
    params: AiUsageDashboardParams,
  ): Promise<AiUsageDashboard> {
    let query = db
      .selectFrom('ai_usage_events')
      .selectAll()
      .where('createdAt', '>=', params.since);

    if (params.until) {
      query = query.where('createdAt', '<=', params.until);
    }
    if (params.projectIds?.length) {
      query = query.where('projectId', 'in', params.projectIds);
    }

    const events = ((await query.execute()) as AiUsageEvent[]).map(
      eventFromRow,
    );
    const totals = events.reduce(addTotals, { ...emptyTotals });
    totals.taskCount = new Set(
      events.map((event) => event.taskId).filter(Boolean),
    ).size;

    const byDayMap = new Map<string, typeof emptyTotals>();
    const byFeatureMap = new Map<string, typeof emptyTotals>();
    const byFeatureModelMap = new Map<
      string,
      Map<string, typeof emptyTotals>
    >();
    const byModelMap = new Map<string, typeof emptyTotals>();
    const byTaskMap = new Map<
      string,
      typeof emptyTotals & {
        projectId: string;
        taskName: string | null;
        projectName: string | null;
      }
    >();
    const unknownMap = new Map<
      string,
      { backend: string; model: string; requests: number }
    >();

    for (const event of events) {
      const day = event.createdAt.slice(0, 10);
      addTotals(
        byDayMap.get(day) ?? byDayMap.set(day, { ...emptyTotals }).get(day)!,
        event,
      );
      addTotals(
        byFeatureMap.get(event.feature) ??
          byFeatureMap
            .set(event.feature, { ...emptyTotals })
            .get(event.feature)!,
        event,
      );
      const modelKey = `${event.backend}\n${event.model}`;
      const featureModels =
        byFeatureModelMap.get(event.feature) ??
        byFeatureModelMap.set(event.feature, new Map()).get(event.feature)!;
      addTotals(
        featureModels.get(modelKey) ??
          featureModels.set(modelKey, { ...emptyTotals }).get(modelKey)!,
        event,
      );
      addTotals(
        byModelMap.get(modelKey) ??
          byModelMap.set(modelKey, { ...emptyTotals }).get(modelKey)!,
        event,
      );
      if (event.taskId && event.projectId) {
        const existing = byTaskMap.get(event.taskId);
        const taskTotals = existing ?? {
          ...emptyTotals,
          projectId: event.projectId,
          taskName: event.taskName,
          projectName: event.projectName,
        };
        taskTotals.taskName ??= event.taskName;
        taskTotals.projectName ??= event.projectName;
        addTotals(taskTotals, event);
        byTaskMap.set(event.taskId, taskTotals);
      }
      if (event.pricingStatus === 'unknown') {
        const existing = unknownMap.get(modelKey) ?? {
          backend: event.backend,
          model: event.model,
          requests: 0,
        };
        existing.requests += 1;
        unknownMap.set(modelKey, existing);
      }
    }

    const taskIds = [...byTaskMap.keys()];
    const tasks =
      taskIds.length > 0
        ? await db
            .selectFrom('tasks')
            .leftJoin('projects', 'projects.id', 'tasks.projectId')
            .select([
              'tasks.id as taskId',
              'tasks.name as taskName',
              'tasks.prompt as taskPrompt',
              'projects.name as projectName',
            ])
            .where('tasks.id', 'in', taskIds)
            .execute()
        : [];
    const taskNames = new Map(tasks.map((task) => [task.taskId, task]));

    return {
      totals,
      byDay: [...byDayMap.entries()]
        .map(([date, value]) => ({ date, ...value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byFeature: [...byFeatureMap.entries()]
        .map(([feature, value]) => ({
          feature: feature as AiUsageEvent['feature'],
          ...value,
          models: [...(byFeatureModelMap.get(feature)?.entries() ?? [])]
            .map(([key, modelValue]) => {
              const [backend, model] = key.split('\n');
              return { backend, model, ...modelValue };
            })
            .sort((a, b) => b.totalTokens - a.totalTokens),
        }))
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
      byModel: [...byModelMap.entries()]
        .map(([key, value]) => {
          const [backend, model] = key.split('\n');
          return { backend, model, ...value };
        })
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
      topTasks: [...byTaskMap.entries()]
        .map(([taskId, value]) => ({
          taskId,
          projectId: value.projectId,
          taskName:
            value.taskName ??
            taskNames.get(taskId)?.taskName ??
            formatTaskPromptFallback(taskNames.get(taskId)?.taskPrompt),
          projectName:
            value.projectName ?? taskNames.get(taskId)?.projectName ?? null,
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
          cacheReadTokens: value.cacheReadTokens,
          cacheCreationTokens: value.cacheCreationTokens,
          totalTokens: value.totalTokens,
          estimatedCostUsd: value.estimatedCostUsd,
          providerCostUsd: value.providerCostUsd,
          providerApiCostUsd: value.providerApiCostUsd,
          requests: value.requests,
          updatedAt: new Date().toISOString(),
        }))
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
      unknownPricing: [...unknownMap.values()].sort(
        (a, b) => b.requests - a.requests,
      ),
    };
  },

  async getTaskUsage(taskId: string): Promise<AiUsageTaskUsage> {
    const events = (
      (await db
        .selectFrom('ai_usage_events')
        .selectAll()
        .where('taskId', '=', taskId)
        .orderBy('createdAt', 'desc')
        .execute()) as AiUsageEvent[]
    ).map(eventFromRow);
    const totals = events.reduce(addTotals, { ...emptyTotals });
    totals.taskCount = events.length > 0 ? 1 : 0;
    return { events, totals };
  },
};
