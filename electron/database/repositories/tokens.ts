// electron/database/repositories/tokens.ts
import type {
  Token,
  NewToken,
  UpdateToken,
  ProviderType,
} from '../../../shared/types';
import { encryptionService } from '../../services/encryption-service';
import { db } from '../index';
import type { TokenRow } from '../schema';

// Convert DB row to Token (without encrypted value)
function toToken(row: TokenRow): Token {
  return {
    id: row.id,
    label: row.label,
    providerType: row.providerType,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const TokenRepository = {
  findAll: async (): Promise<Token[]> => {
    const rows = await db.selectFrom('tokens').selectAll().execute();
    return rows.map(toToken);
  },

  findById: async (id: string): Promise<Token | undefined> => {
    const row = await db
      .selectFrom('tokens')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toToken(row) : undefined;
  },

  findByProviderType: async (providerType: string): Promise<Token[]> => {
    const rows = await db
      .selectFrom('tokens')
      .selectAll()
      .where('providerType', '=', providerType as ProviderType)
      .execute();
    return rows.map(toToken);
  },

  // Internal: get decrypted token for API calls (never exposed via IPC)
  getDecryptedToken: async (id: string): Promise<string | undefined> => {
    const row = await db
      .selectFrom('tokens')
      .select('tokenEncrypted')
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? encryptionService.decrypt(row.tokenEncrypted) : undefined;
  },

  create: async (data: NewToken): Promise<Token> => {
    const now = new Date().toISOString();
    const id = data.id ?? crypto.randomUUID();

    const row = await db
      .insertInto('tokens')
      .values({
        id,
        label: data.label,
        tokenEncrypted: encryptionService.encrypt(data.token),
        providerType: data.providerType,
        expiresAt: data.expiresAt ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toToken(row);
  },

  update: async (id: string, data: UpdateToken): Promise<Token> => {
    const updateData: Record<string, unknown> = {
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };

    if (data.label !== undefined) updateData.label = data.label;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
    if (data.token !== undefined) {
      updateData.tokenEncrypted = encryptionService.encrypt(data.token);
    }

    const row = await db
      .updateTable('tokens')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return toToken(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('tokens').where('id', '=', id).execute();
  },
};
