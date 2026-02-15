import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // PRAGMA foreign_keys must be set outside a transaction in SQLite
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.transaction().execute(async (trx) => {
      // 1. Delete opencode raw messages (breaking change)
      await sql`DELETE FROM raw_messages WHERE rawFormat = 'opencode'`.execute(
        trx,
      );

      // 2. Delete agent_messages that pointed to now-deleted opencode raw messages
      //    (rawMessageId no longer exists in raw_messages)
      await sql`
        DELETE FROM agent_messages
        WHERE rawMessageId IS NOT NULL
          AND rawMessageId NOT IN (SELECT id FROM raw_messages)
      `.execute(trx);

      // 3. Delete completed tasks with zero raw_messages (legacy cleanup)
      await sql`
        DELETE FROM tasks
        WHERE status IN ('completed', 'errored', 'interrupted')
          AND id NOT IN (SELECT DISTINCT taskId FROM raw_messages)
      `.execute(trx);

      // 4. Clean up orphaned agent_messages for deleted tasks
      await sql`
        DELETE FROM agent_messages
        WHERE taskId NOT IN (SELECT id FROM tasks)
      `.execute(trx);

      // 5. Recreate agent_messages with flattened entry schema
      //    (one row per entry instead of one row per message with parts[])
      await sql`DROP TABLE IF EXISTS agent_messages_new`.execute(trx);
      await trx.schema
        .createTable('agent_messages_new')
        .addColumn('id', 'text', (col) =>
          col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
        )
        .addColumn('taskId', 'text', (col) =>
          col.notNull().references('tasks.id').onDelete('cascade'),
        )
        .addColumn('messageIndex', 'integer', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull().defaultTo(''))
        .addColumn('toolId', 'text')
        .addColumn('parentToolId', 'text')
        .addColumn('data', 'text', (col) => col.notNull().defaultTo('{}'))
        .addColumn('model', 'text')
        .addColumn('isSynthetic', 'integer')
        .addColumn('date', 'text', (col) =>
          col.notNull().defaultTo(sql`(datetime('now'))`),
        )
        .addColumn('normalizedVersion', 'integer', (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn('rawMessageId', 'text', (col) =>
          col.references('raw_messages.id').onDelete('set null'),
        )
        .addColumn('createdAt', 'text', (col) =>
          col.notNull().defaultTo(sql`(datetime('now'))`),
        )
        .execute();

      // 6. Drop old (data will be re-normalized from raw_messages), rename new
      await trx.schema.dropTable('agent_messages').execute();
      await sql`ALTER TABLE agent_messages_new RENAME TO agent_messages`.execute(
        trx,
      );

      // 7. Create indexes for efficient lookups
      await sql`CREATE INDEX idx_agent_messages_toolId ON agent_messages(toolId)`.execute(
        trx,
      );
      await sql`CREATE INDEX idx_agent_messages_parentToolId ON agent_messages(parentToolId)`.execute(
        trx,
      );
      await sql`CREATE INDEX idx_agent_messages_taskId_messageIndex ON agent_messages(taskId, messageIndex)`.execute(
        trx,
      );

      // 8. Verify FK integrity
      const fkCheck = await sql<{
        table: string;
      }>`PRAGMA foreign_key_check`.execute(trx);
      if (fkCheck.rows.length > 0) {
        throw new Error(
          `Foreign key violation after v2 migration: ${JSON.stringify(fkCheck.rows)}`,
        );
      }
    });
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Destructive — cannot recover deleted opencode data or exploded entries.
  // Recreate the pre-028 schema shape for rollback purposes.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.transaction().execute(async (trx) => {
      await sql`DROP TABLE IF EXISTS agent_messages_old`.execute(trx);
      await trx.schema
        .createTable('agent_messages_old')
        .addColumn('id', 'text', (col) =>
          col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
        )
        .addColumn('taskId', 'text', (col) =>
          col.notNull().references('tasks.id').onDelete('cascade'),
        )
        .addColumn('messageIndex', 'integer', (col) => col.notNull())
        .addColumn('messageType', 'text', (col) => col.notNull().defaultTo(''))
        .addColumn('normalizedData', 'text')
        .addColumn('normalizedVersion', 'integer', (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn('rawMessageId', 'text', (col) =>
          col.references('raw_messages.id').onDelete('set null'),
        )
        .addColumn('createdAt', 'text', (col) =>
          col.notNull().defaultTo(sql`(datetime('now'))`),
        )
        .execute();

      await trx.schema.dropTable('agent_messages').execute();
      await sql`ALTER TABLE agent_messages_old RENAME TO agent_messages`.execute(
        trx,
      );
    });
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}
