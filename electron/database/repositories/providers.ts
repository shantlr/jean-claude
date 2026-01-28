// electron/database/repositories/providers.ts
import { db } from '../index';
import type { Provider, NewProvider, UpdateProvider } from '../../../shared/types';

export const ProviderRepository = {
  findAll: async (): Promise<Provider[]> => {
    return db.selectFrom('providers').selectAll().execute();
  },

  findById: async (id: string): Promise<Provider | undefined> => {
    return db
      .selectFrom('providers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  },

  create: async (data: NewProvider): Promise<Provider> => {
    const now = new Date().toISOString();
    const id = data.id ?? crypto.randomUUID();

    return db
      .insertInto('providers')
      .values({
        id,
        type: data.type,
        label: data.label,
        baseUrl: data.baseUrl,
        tokenId: data.tokenId,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update: async (id: string, data: UpdateProvider): Promise<Provider> => {
    const updateData: Record<string, unknown> = {
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };

    if (data.type !== undefined) updateData.type = data.type;
    if (data.label !== undefined) updateData.label = data.label;
    if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl;
    if (data.tokenId !== undefined) updateData.tokenId = data.tokenId;

    return db
      .updateTable('providers')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('providers').where('id', '=', id).execute();
  },
};
