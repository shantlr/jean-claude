import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // 1. Disable FK constraints to prevent cascade deletes
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    // 2. Create tokens table
    await trx.schema
      .createTable('tokens')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('label', 'text', (col) => col.notNull())
      .addColumn('tokenEncrypted', 'text', (col) => col.notNull())
      .addColumn('providerType', 'text', (col) => col.notNull())
      .addColumn('expiresAt', 'text')
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .execute();

    // 3. Clear provider references from projects (to avoid FK issues)
    await sql`UPDATE projects SET provider_id = NULL`.execute(trx);

    // 4. Drop old providers table
    await trx.schema.dropTable('providers').execute();

    // 5. Create new providers table with tokenId
    await trx.schema
      .createTable('providers')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('label', 'text', (col) => col.notNull())
      .addColumn('baseUrl', 'text', (col) => col.notNull())
      .addColumn('tokenId', 'text', (col) =>
        col.references('tokens.id').onDelete('set null'),
      )
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .execute();

    // 6. Re-enable FK constraints and verify integrity
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
  await db.transaction().execute(async (trx) => {
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    // Drop new providers table
    await trx.schema.dropTable('providers').execute();

    // Recreate old providers table with token column
    await trx.schema
      .createTable('providers')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('label', 'text', (col) => col.notNull())
      .addColumn('baseUrl', 'text', (col) => col.notNull())
      .addColumn('token', 'text', (col) => col.notNull())
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .execute();

    // Drop tokens table
    await trx.schema.dropTable('tokens').execute();

    await sql`PRAGMA foreign_keys = ON`.execute(trx);
  });
}
