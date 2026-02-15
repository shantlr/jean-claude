import { Kysely, sql } from 'kysely';
import { nanoid } from 'nanoid';

// Hardcoded: this was the normalization version when migration 026 was written.
// The V1 normalizer has been deleted; migration 028 re-normalizes everything with V2.
const NORMALIZATION_VERSION_AT_026 = 1;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // 1. Add defaultAgentBackend to projects (nullable — NULL means "use global default")
    await trx.schema
      .alterTable('projects')
      .addColumn('defaultAgentBackend', 'text')
      .execute();

    // 2. Add agentBackend to tasks (NOT NULL, existing rows default to 'claude-code')
    // SQLite ALTER TABLE ADD COLUMN requires a default for NOT NULL columns,
    // so we add with a default first, then the app layer ensures it's always set explicitly.
    await trx.schema
      .alterTable('tasks')
      .addColumn('agentBackend', 'text', (col) =>
        col.notNull().defaultTo('claude-code'),
      )
      .execute();

    // 3. Create raw_messages table
    await trx.schema
      .createTable('raw_messages')
      .addColumn('id', 'text', (col) => col.notNull().unique())
      .addColumn('taskId', 'text', (col) =>
        col.notNull().references('tasks.id').onDelete('cascade'),
      )
      .addColumn('messageIndex', 'integer', (col) => col.notNull())
      .addColumn('backendSessionId', 'text')
      .addColumn('rawData', 'text', (col) => col.notNull())
      .addColumn('rawFormat', 'text', (col) =>
        col.notNull().defaultTo('claude-code'),
      )
      .addColumn('createdAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .execute();

    await trx.schema
      .createIndex('idx_raw_messages_task_id')
      .on('raw_messages')
      .column('taskId')
      .execute();

    // 4. Add new columns to agent_messages for normalized data + raw FK
    await trx.schema
      .alterTable('agent_messages')
      .addColumn('normalizedData', 'text')
      .execute();

    await trx.schema
      .alterTable('agent_messages')
      .addColumn('normalizedVersion', 'integer', (col) =>
        col.defaultTo(NORMALIZATION_VERSION_AT_026),
      )
      .execute();

    await trx.schema
      .alterTable('agent_messages')
      .addColumn('rawMessageId', 'text', (col) =>
        col.references('raw_messages.id'),
      )
      .execute();

    // 5. Eager migration: normalize existing messages and move raw data to raw_messages
    // Each existing agent_message row becomes:
    //   - A raw_messages row (preserving the original messageData)
    //   - normalizedData + rawMessageId on agent_messages
    const batchSize = 500;
    let offset = 0;

    while (true) {
      const rows = await sql<{
        id: string;
        taskId: string;
        messageIndex: number;
        messageData: string;
      }>`SELECT id, taskId, messageIndex, messageData FROM agent_messages ORDER BY id LIMIT ${sql.lit(batchSize)} OFFSET ${sql.lit(offset)}`.execute(
        trx,
      );

      if (rows.rows.length === 0) break;

      for (const row of rows.rows) {
        const rawMessageId = nanoid();

        // Insert raw message
        await sql`INSERT INTO raw_messages (id, taskId, messageIndex, rawData, rawFormat)
          VALUES (${rawMessageId}, ${row.taskId}, ${row.messageIndex}, ${row.messageData}, 'claude-code')`.execute(
          trx,
        );

        // Normalize and update agent_messages
        // V1 normalizer has been deleted — skip normalization here.
        // Migration 028 will re-normalize all messages with the V2 normalizer.
        await sql`UPDATE agent_messages SET
          normalizedData = NULL,
          normalizedVersion = ${NORMALIZATION_VERSION_AT_026},
          rawMessageId = ${rawMessageId}
        WHERE id = ${row.id}`.execute(trx);
      }

      offset += batchSize;
    }

    // 6. Drop the legacy messageData column — raw data is now in raw_messages
    await trx.schema
      .alterTable('agent_messages')
      .dropColumn('messageData')
      .execute();
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Restore messageData on agent_messages from linked raw_messages
    await trx.schema
      .alterTable('agent_messages')
      .addColumn('messageData', 'text', (col) => col.notNull().defaultTo('{}'))
      .execute();

    await sql`UPDATE agent_messages SET
      messageData = COALESCE(
        (SELECT r.rawData FROM raw_messages r WHERE r.id = agent_messages.rawMessageId),
        '{}'
      )`.execute(trx);

    // Drop new columns from agent_messages
    await trx.schema
      .alterTable('agent_messages')
      .dropColumn('normalizedData')
      .execute();

    await trx.schema
      .alterTable('agent_messages')
      .dropColumn('normalizedVersion')
      .execute();

    await trx.schema
      .alterTable('agent_messages')
      .dropColumn('rawMessageId')
      .execute();

    // Drop raw_messages table
    await trx.schema.dropTable('raw_messages').ifExists().execute();

    // Drop backend columns
    await trx.schema
      .alterTable('projects')
      .dropColumn('defaultAgentBackend')
      .execute();

    await trx.schema.alterTable('tasks').dropColumn('agentBackend').execute();
  });
}
