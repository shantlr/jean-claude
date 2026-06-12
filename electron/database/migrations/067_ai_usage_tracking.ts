import { Kysely, sql } from 'kysely';

import type { NormalizedEntry } from '@shared/normalized-message-v2';

import {
  AI_USAGE_PRICING_VERSION,
  estimateAiUsageCost,
} from '../../services/model-pricing';

function formatTaskPromptFallback(prompt: string | null): string | null {
  const firstLine = prompt?.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

async function backfillAgentResultUsage(db: Kysely<unknown>): Promise<void> {
  const rows = await sql<{
    messageId: string;
    createdAt: string;
    taskId: string;
    stepId: string | null;
    data: string;
    messageModel: string | null;
    taskName: string | null;
    taskPrompt: string | null;
    projectName: string | null;
    projectId: string;
    stepBackend: string | null;
    stepModel: string | null;
  }>`
    SELECT
      agent_messages.id AS messageId,
      agent_messages.date AS createdAt,
      agent_messages.taskId AS taskId,
      agent_messages.stepId AS stepId,
      agent_messages.data AS data,
      agent_messages.model AS messageModel,
      tasks.name AS taskName,
      tasks.prompt AS taskPrompt,
      projects.name AS projectName,
      tasks.projectId AS projectId,
      task_steps.agentBackend AS stepBackend,
      task_steps.modelPreference AS stepModel
    FROM agent_messages
    INNER JOIN tasks ON tasks.id = agent_messages.taskId
    LEFT JOIN projects ON projects.id = tasks.projectId
    LEFT JOIN task_steps ON task_steps.id = agent_messages.stepId
    WHERE agent_messages.type = 'result'
    ORDER BY agent_messages.createdAt ASC, agent_messages.id ASC
  `.execute(db);

  for (const row of rows.rows) {
    const entry = JSON.parse(row.data) as NormalizedEntry;
    if (entry.type !== 'result' || !entry.usage) continue;

    const cacheReadTokens = entry.usage.cacheReadTokens ?? 0;
    const cacheCreationTokens = entry.usage.cacheCreationTokens ?? 0;
    const totalTokens =
      entry.usage.inputTokens +
      entry.usage.outputTokens +
      cacheReadTokens +
      cacheCreationTokens;
    if (totalTokens === 0) continue;

    const backend = row.stepBackend ?? 'claude-code';
    const model = row.messageModel ?? row.stepModel ?? 'default';
    const { estimatedCostUsd, pricingStatus } = estimateAiUsageCost({
      model,
      usage: entry.usage,
    });

    await sql`
      INSERT OR IGNORE INTO ai_usage_events (
        id,
        createdAt,
        sourceId,
        feature,
        projectId,
        taskId,
        stepId,
        taskName,
        projectName,
        backend,
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        totalTokens,
        estimatedCostUsd,
        providerCostUsd,
        providerApiCostUsd,
        pricingStatus,
        pricingVersion
      ) VALUES (
        ${`agent-message:${row.messageId}`},
        ${row.createdAt},
        ${`agent-message:${row.messageId}`},
        'agent',
        ${row.projectId},
        ${row.taskId},
        ${row.stepId},
        ${row.taskName ?? formatTaskPromptFallback(row.taskPrompt)},
        ${row.projectName},
        ${backend},
        ${model},
        ${entry.usage.inputTokens},
        ${entry.usage.outputTokens},
        ${cacheReadTokens},
        ${cacheCreationTokens},
        ${totalTokens},
        ${estimatedCostUsd},
        ${entry.cost ?? null},
        ${entry.apiCost ?? (backend === 'claude-code' ? estimatedCostUsd : null)},
        ${pricingStatus},
        ${AI_USAGE_PRICING_VERSION}
      )
    `.execute(db);
  }
}

async function rebuildRollups(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT OR REPLACE INTO ai_usage_task_totals (
      taskId,
      projectId,
      taskName,
      projectName,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens,
      estimatedCostUsd,
      providerCostUsd,
      providerApiCostUsd,
      requests,
      updatedAt
    )
    SELECT
      taskId,
      COALESCE(MAX(projectId), '') AS projectId,
      MAX(taskName) AS taskName,
      MAX(projectName) AS projectName,
      SUM(inputTokens) AS inputTokens,
      SUM(outputTokens) AS outputTokens,
      SUM(cacheReadTokens) AS cacheReadTokens,
      SUM(cacheCreationTokens) AS cacheCreationTokens,
      SUM(totalTokens) AS totalTokens,
      SUM(estimatedCostUsd) AS estimatedCostUsd,
      SUM(COALESCE(providerCostUsd, 0)) AS providerCostUsd,
      SUM(COALESCE(providerApiCostUsd, 0)) AS providerApiCostUsd,
      COUNT(*) AS requests,
      datetime('now') AS updatedAt
    FROM ai_usage_events
    WHERE taskId IS NOT NULL
    GROUP BY taskId
  `.execute(db);

  await sql`
    INSERT OR REPLACE INTO ai_usage_daily_totals (
      date,
      feature,
      backend,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens,
      estimatedCostUsd,
      providerCostUsd,
      providerApiCostUsd,
      requests,
      updatedAt
    )
    SELECT
      substr(createdAt, 1, 10) AS date,
      feature,
      backend,
      model,
      SUM(inputTokens) AS inputTokens,
      SUM(outputTokens) AS outputTokens,
      SUM(cacheReadTokens) AS cacheReadTokens,
      SUM(cacheCreationTokens) AS cacheCreationTokens,
      SUM(totalTokens) AS totalTokens,
      SUM(estimatedCostUsd) AS estimatedCostUsd,
      SUM(COALESCE(providerCostUsd, 0)) AS providerCostUsd,
      SUM(COALESCE(providerApiCostUsd, 0)) AS providerApiCostUsd,
      COUNT(*) AS requests,
      datetime('now') AS updatedAt
    FROM ai_usage_events
    GROUP BY substr(createdAt, 1, 10), feature, backend, model
  `.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ai_usage_events')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('sourceId', 'text')
    .addColumn('feature', 'text', (col) => col.notNull())
    .addColumn('projectId', 'text')
    .addColumn('taskId', 'text')
    .addColumn('stepId', 'text')
    .addColumn('taskName', 'text')
    .addColumn('projectName', 'text')
    .addColumn('backend', 'text', (col) => col.notNull())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('inputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('outputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cacheReadTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cacheCreationTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('totalTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('estimatedCostUsd', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('providerCostUsd', 'real')
    .addColumn('providerApiCostUsd', 'real')
    .addColumn('pricingStatus', 'text', (col) => col.notNull())
    .addColumn('pricingVersion', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_ai_usage_events_created')
    .on('ai_usage_events')
    .column('createdAt')
    .execute();

  await db.schema
    .createIndex('idx_ai_usage_events_task')
    .on('ai_usage_events')
    .columns(['taskId', 'createdAt'])
    .execute();

  await db.schema
    .createIndex('idx_ai_usage_events_source')
    .on('ai_usage_events')
    .column('sourceId')
    .unique()
    .execute();

  await db.schema
    .createTable('ai_usage_task_totals')
    .addColumn('taskId', 'text', (col) => col.primaryKey())
    .addColumn('projectId', 'text', (col) => col.notNull())
    .addColumn('taskName', 'text')
    .addColumn('projectName', 'text')
    .addColumn('inputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('outputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cacheReadTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cacheCreationTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('totalTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('estimatedCostUsd', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('providerCostUsd', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('providerApiCostUsd', 'real', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('requests', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('ai_usage_daily_totals')
    .addColumn('date', 'text', (col) => col.notNull())
    .addColumn('feature', 'text', (col) => col.notNull())
    .addColumn('backend', 'text', (col) => col.notNull())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('inputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('outputTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cacheReadTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cacheCreationTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('totalTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('estimatedCostUsd', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('providerCostUsd', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('providerApiCostUsd', 'real', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('requests', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_ai_usage_daily_totals', [
      'date',
      'feature',
      'backend',
      'model',
    ])
    .execute();

  await backfillAgentResultUsage(db);
  await rebuildRollups(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ai_usage_daily_totals').execute();
  await db.schema.dropTable('ai_usage_task_totals').execute();
  await db.schema.dropTable('ai_usage_events').execute();
}
