import { safeStorage } from 'electron';

import { db } from '../index';
import { NewProvider, Provider, UpdateProvider } from '../schema';

function decryptToken(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

function encryptToken(token: string): string {
  return safeStorage.encryptString(token).toString('base64');
}

function decryptProvider(provider: Provider): Provider {
  return {
    ...provider,
    token: decryptToken(provider.token),
  };
}

export const ProviderRepository = {
  findAll: async () => {
    const providers = await db.selectFrom('providers').selectAll().execute();
    return providers.map(decryptProvider);
  },

  findById: async (id: string) => {
    const provider = await db
      .selectFrom('providers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return provider ? decryptProvider(provider) : undefined;
  },

  create: (data: NewProvider) =>
    db
      .insertInto('providers')
      .values({ ...data, token: encryptToken(data.token) })
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateProvider) => {
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    if (data.token) {
      updateData.token = encryptToken(data.token);
    }
    return db
      .updateTable('providers')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: (id: string) =>
    db.deleteFrom('providers').where('id', '=', id).execute(),
};
