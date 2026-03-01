import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // All phases in a single transaction for full atomicity.
  // If any phase fails the entire migration is rolled back.
  await db.transaction().execute(async (trx) => {
    // Phase 1: Create task_steps table
    await trx.schema
      .createTable('task_steps')
      .addColumn('id', 'text', (col) =>
        col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
      )
      .addColumn('taskId', 'text', (col) =>
        col.notNull().references('tasks.id').onDelete('cascade'),
      )
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull().defaultTo('agent'))
      .addColumn('dependsOn', 'text', (col) => col.notNull().defaultTo('[]'))
      .addColumn('promptTemplate', 'text', (col) => col.notNull())
      .addColumn('resolvedPrompt', 'text')
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('ready'))
      .addColumn('sessionId', 'text')
      .addColumn('interactionMode', 'text')
      .addColumn('modelPreference', 'text')
      .addColumn('agentBackend', 'text')
      .addColumn('output', 'text')
      .addColumn('images', 'text')
      .addColumn('meta', 'text')
      .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('createdAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .addColumn('updatedAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .execute();

    await trx.schema
      .createIndex('task_steps_task_idx')
      .on('task_steps')
      .columns(['taskId'])
      .execute();

    // Phase 2: Backfill one step per existing task
    const tasks = await sql<{
      id: string;
      prompt: string;
      status: string;
      sessionId: string | null;
      interactionMode: string;
      modelPreference: string | null;
      agentBackend: string;
    }>`SELECT id, prompt, status, sessionId, interactionMode, modelPreference, agentBackend FROM tasks`.execute(
      trx,
    );

    const now = new Date().toISOString();
    for (const task of tasks.rows) {
      const stepStatus = task.status === 'waiting' ? 'ready' : task.status;
      const stepId = sql`lower(hex(randomblob(16)))`;
      await sql`INSERT INTO task_steps (id, taskId, name, type, dependsOn, promptTemplate, resolvedPrompt, status, sessionId, interactionMode, modelPreference, agentBackend, output, meta, sortOrder, createdAt, updatedAt)
        VALUES (${stepId}, ${task.id}, ${'Step 1'}, ${'agent'}, ${'[]'}, ${task.prompt}, ${task.prompt}, ${stepStatus}, ${task.sessionId}, ${task.interactionMode}, ${task.modelPreference}, ${task.agentBackend}, ${null}, ${null}, ${0}, ${now}, ${now})`.execute(
        trx,
      );
    }

    // Phase 3: Add stepId to agent_messages and raw_messages, backfill
    await trx.schema
      .alterTable('agent_messages')
      .addColumn('stepId', 'text')
      .execute();
    await trx.schema
      .alterTable('raw_messages')
      .addColumn('stepId', 'text')
      .execute();

    // Backfill stepId from the auto-created single step per task
    await sql`UPDATE agent_messages SET stepId = (
      SELECT ts.id FROM task_steps ts WHERE ts.taskId = agent_messages.taskId LIMIT 1
    )`.execute(trx);

    await sql`UPDATE raw_messages SET stepId = (
      SELECT ts.id FROM task_steps ts WHERE ts.taskId = raw_messages.taskId LIMIT 1
    )`.execute(trx);

    await trx.schema
      .createIndex('agent_messages_step_idx')
      .on('agent_messages')
      .columns(['stepId'])
      .execute();
    await trx.schema
      .createIndex('raw_messages_step_idx')
      .on('raw_messages')
      .columns(['stepId'])
      .execute();

    // Phase 4: Recreate tasks table without moved columns
    // (sessionId, interactionMode, modelPreference, agentBackend)
    // Disable FK constraints to prevent cascade deletes when dropping tasks.
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);

    await trx.schema
      .createTable('tasks_new')
      .addColumn('id', 'text', (col) =>
        col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
      )
      .addColumn('projectId', 'text', (col) =>
        col.notNull().references('projects.id').onDelete('cascade'),
      )
      .addColumn('name', 'text')
      .addColumn('prompt', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('waiting'))
      .addColumn('worktreePath', 'text')
      .addColumn('startCommitHash', 'text')
      .addColumn('sourceBranch', 'text')
      .addColumn('branchName', 'text')
      .addColumn('hasUnread', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('userCompleted', 'integer', (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn('sessionAllowedTools', 'text')
      .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('workItemIds', 'text')
      .addColumn('workItemUrls', 'text')
      .addColumn('pullRequestId', 'text')
      .addColumn('pullRequestUrl', 'text')
      .addColumn('pendingMessage', 'text')
      .addColumn('createdAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .addColumn('updatedAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .execute();

    await sql`INSERT INTO tasks_new (id, projectId, name, prompt, status, worktreePath, startCommitHash, sourceBranch, branchName, hasUnread, userCompleted, sessionAllowedTools, sortOrder, workItemIds, workItemUrls, pullRequestId, pullRequestUrl, pendingMessage, createdAt, updatedAt)
      SELECT id, projectId, name, prompt, status, worktreePath, startCommitHash, sourceBranch, branchName, hasUnread, userCompleted, sessionAllowedTools, sortOrder, workItemIds, workItemUrls, pullRequestId, pullRequestUrl, pendingMessage, createdAt, updatedAt FROM tasks`.execute(
      trx,
    );

    await trx.schema.dropTable('tasks').execute();
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    await sql`PRAGMA foreign_keys = ON`.execute(trx);

    const fkCheck = await sql<{
      table: string;
    }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('agent_messages_step_idx').ifExists().execute();
  await db.schema.dropIndex('raw_messages_step_idx').ifExists().execute();
  await db.schema.alterTable('agent_messages').dropColumn('stepId').execute();
  await db.schema.alterTable('raw_messages').dropColumn('stepId').execute();

  await db.schema.alterTable('tasks').addColumn('sessionId', 'text').execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('interactionMode', 'text', (col) =>
      col.notNull().defaultTo('plan'),
    )
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('modelPreference', 'text')
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('agentBackend', 'text', (col) =>
      col.notNull().defaultTo('claude-code'),
    )
    .execute();

  await sql`UPDATE tasks SET
    sessionId = (SELECT sessionId FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1),
    interactionMode = COALESCE((SELECT interactionMode FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1), 'plan'),
    modelPreference = (SELECT modelPreference FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1),
    agentBackend = COALESCE((SELECT agentBackend FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1), 'claude-code')
  `.execute(db);

  await db.schema.dropTable('task_steps').execute();
}
