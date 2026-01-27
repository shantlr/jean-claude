# Token Management Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate token storage from provider configuration, allowing one token to authenticate multiple providers with encryption and expiration tracking.

**Architecture:** New `tokens` table stores encrypted PATs with metadata (label, providerType, expiresAt). Providers reference tokens via `tokenId` FK. Encryption service extracts existing logic. Renderer never sees decrypted token values - only metadata. Azure DevOps API fetches PAT expiration when possible.

**Tech Stack:** Electron, SQLite/Kysely, React, TanStack Query, safeStorage encryption

---

## Task 1: Create Encryption Service

Extract existing encryption functions from `providers.ts` into a dedicated service.

**Files:**
- Create: `electron/services/encryption-service.ts`

**Step 1: Create the encryption service**

```typescript
// electron/services/encryption-service.ts
import { safeStorage } from 'electron';

export const encryptionService = {
  encrypt(plainText: string): string {
    return safeStorage.encryptString(plainText).toString('base64');
  },

  decrypt(encryptedBase64: string): string {
    return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
  },
};
```

**Step 2: Commit**

```bash
git add electron/services/encryption-service.ts
git commit -m "feat: extract encryption service from providers repository"
```

---

## Task 2: Create Database Migration

Create migration to add `tokens` table and recreate `providers` table with `tokenId`.

**Files:**
- Create: `electron/database/migrations/018_tokens_and_providers_rework.ts`
- Modify: `electron/database/migrator.ts`

**Step 1: Create the migration file**

```typescript
// electron/database/migrations/018_tokens_and_providers_rework.ts
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
      .addColumn('tokenId', 'text', (col) => col.references('tokens.id').onDelete('set null'))
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .execute();

    // 6. Re-enable FK constraints and verify integrity
    await sql`PRAGMA foreign_keys = ON`.execute(trx);
    const fkCheck = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(trx);
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
```

**Step 2: Register migration in migrator.ts**

Add import and registration:

```typescript
import * as m018 from './migrations/018_tokens_and_providers_rework';

// In migrations record:
'018_tokens_and_providers_rework': m018,
```

**Step 3: Commit**

```bash
git add electron/database/migrations/018_tokens_and_providers_rework.ts electron/database/migrator.ts
git commit -m "feat: add migration for tokens table and providers rework"
```

---

## Task 3: Update Database Schema Types

Update schema types for new tokens table and modified providers table.

**Files:**
- Modify: `electron/database/schema.ts`

**Step 1: Add TokenTable interface and update ProviderTable**

Add after existing interfaces:

```typescript
export interface TokenTable {
  id: Generated<string>;
  label: string;
  tokenEncrypted: string;
  providerType: ProviderType;
  expiresAt: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}
```

Update ProviderTable (replace `token` with `tokenId`):

```typescript
export interface ProviderTable {
  id: Generated<string>;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}
```

Update Database interface:

```typescript
export interface Database {
  tokens: TokenTable;
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
  agent_messages: AgentMessageTable;
  settings: SettingsTable;
}
```

Add Kysely types for tokens:

```typescript
export type TokenRow = Selectable<TokenTable>;
export type NewTokenRow = Insertable<TokenTable>;
export type UpdateTokenRow = Updateable<TokenTable>;
```

**Step 2: Commit**

```bash
git add electron/database/schema.ts
git commit -m "feat: update database schema types for tokens and providers"
```

---

## Task 4: Update Shared Types

Add Token types to shared types and update Provider types.

**Files:**
- Modify: `shared/types.ts`

**Step 1: Add Token types (without sensitive tokenEncrypted)**

Add after ProviderType:

```typescript
// Token metadata - sensitive token value never exposed to renderer
export interface Token {
  id: string;
  label: string;
  providerType: ProviderType;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewToken {
  id?: string;
  label: string;
  token: string; // Plain token sent during creation, never returned
  providerType: ProviderType;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateToken {
  label?: string;
  token?: string; // Optional: only when refreshing
  expiresAt?: string | null;
  updatedAt?: string;
}
```

**Step 2: Update Provider types (replace token with tokenId)**

```typescript
export interface Provider {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProvider {
  id?: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateProvider {
  type?: ProviderType;
  label?: string;
  baseUrl?: string;
  tokenId?: string | null;
  updatedAt?: string;
}
```

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add Token types and update Provider types in shared types"
```

---

## Task 5: Create Token Repository

Create repository for token CRUD operations with encryption.

**Files:**
- Create: `electron/database/repositories/tokens.ts`
- Modify: `electron/database/repositories/index.ts`

**Step 1: Create tokens repository**

```typescript
// electron/database/repositories/tokens.ts
import { db } from '../index';
import { encryptionService } from '../../services/encryption-service';
import type { TokenRow } from '../schema';
import type { Token, NewToken, UpdateToken } from '../../../shared/types';

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
      .where('providerType', '=', providerType)
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
```

**Step 2: Export from index.ts**

Add to `electron/database/repositories/index.ts`:

```typescript
export { TokenRepository } from './tokens';
```

**Step 3: Commit**

```bash
git add electron/database/repositories/tokens.ts electron/database/repositories/index.ts
git commit -m "feat: add TokenRepository with encryption"
```

---

## Task 6: Update Provider Repository

Remove token handling, add tokenId, use TokenRepository for token lookup.

**Files:**
- Modify: `electron/database/repositories/providers.ts`

**Step 1: Rewrite providers repository**

```typescript
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
```

**Step 2: Commit**

```bash
git add electron/database/repositories/providers.ts
git commit -m "refactor: update ProviderRepository to use tokenId instead of token"
```

---

## Task 7: Update Azure DevOps Service

Update to use TokenRepository for token lookup instead of receiving raw tokens.

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Update imports and add token lookup helper**

Add imports and update functions to use tokenId:

```typescript
// electron/services/azure-devops-service.ts
import { ProviderRepository } from '../database/repositories/providers';
import { TokenRepository } from '../database/repositories/tokens';

// ... existing interfaces ...

function createAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
}

// Get organizations using a tokenId (looks up decrypted token internally)
export async function getOrganizationsByTokenId(tokenId: string): Promise<AzureDevOpsOrganization[]> {
  const token = await TokenRepository.getDecryptedToken(tokenId);
  if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
  }
  return getOrganizationsWithToken(token);
}

// Internal function that uses raw token
async function getOrganizationsWithToken(token: string): Promise<AzureDevOpsOrganization[]> {
  // Step 1: Get the user's member ID from profile
  const profileResponse = await fetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
    {
      headers: {
        Authorization: createAuthHeader(token),
      },
    }
  );

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to authenticate with Azure DevOps: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  // Step 2: Get the list of organizations
  const accountsResponse = await fetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.0`,
    {
      headers: {
        Authorization: createAuthHeader(token),
      },
    }
  );

  if (!accountsResponse.ok) {
    const error = await accountsResponse.text();
    throw new Error(`Failed to fetch organizations: ${error}`);
  }

  const accounts: AccountsResponse = await accountsResponse.json();

  return accounts.value.map((account) => ({
    id: account.accountId,
    name: account.accountName,
    url: `https://dev.azure.com/${account.accountName}`,
  }));
}

// Validate token and get organizations (for initial token creation)
export async function validateTokenAndGetOrganizations(token: string): Promise<AzureDevOpsOrganization[]> {
  return getOrganizationsWithToken(token);
}

// Get PAT expiration date from Azure DevOps API
export async function getTokenExpiration(tokenId: string): Promise<string | null> {
  const token = await TokenRepository.getDecryptedToken(tokenId);
  if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
  }

  try {
    // First get organizations to find one we can query
    const orgs = await getOrganizationsWithToken(token);
    if (orgs.length === 0) {
      return null;
    }

    const orgName = orgs[0].name;

    // Query PAT lifecycle API
    const response = await fetch(
      `https://vssps.dev.azure.com/${orgName}/_apis/tokens/pats?api-version=7.1-preview.1`,
      {
        headers: {
          Authorization: createAuthHeader(token),
        },
      }
    );

    if (!response.ok) {
      // API might not be accessible with this token's scopes
      return null;
    }

    const data = await response.json();

    // Find the current token in the list (compare by checking auth works)
    // The API returns PATs but doesn't identify which one we're using
    // Best effort: return the earliest expiring non-expired token
    const pats = data.patTokens || [];
    const now = new Date();

    const validPats = pats
      .filter((pat: { validTo: string }) => new Date(pat.validTo) > now)
      .sort((a: { validTo: string }, b: { validTo: string }) =>
        new Date(a.validTo).getTime() - new Date(b.validTo).getTime()
      );

    if (validPats.length > 0) {
      return validPats[0].validTo;
    }

    return null;
  } catch {
    // If anything fails, return null (user can set manually)
    return null;
  }
}

export async function getProviderDetails(providerId: string): Promise<AzureDevOpsOrgDetails> {
  const provider = await ProviderRepository.findById(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }
  if (provider.type !== 'azure-devops') {
    throw new Error(`Provider is not Azure DevOps: ${provider.type}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${providerId}`);
  }

  // Extract org name from baseUrl
  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Fetch all projects in the organization
  const projectsResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/projects?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    }
  );

  if (!projectsResponse.ok) {
    const error = await projectsResponse.text();
    throw new Error(`Failed to fetch projects: ${error}`);
  }

  const projectsData: ProjectsResponse = await projectsResponse.json();

  // Fetch repos for all projects in parallel
  const projectsWithRepos = await Promise.all(
    projectsData.value.map(async (project) => {
      const reposResponse = await fetch(
        `https://dev.azure.com/${orgName}/${project.id}/_apis/git/repositories?api-version=7.0`,
        {
          headers: { Authorization: authHeader },
        }
      );

      let repos: AzureDevOpsRepo[] = [];
      if (reposResponse.ok) {
        const reposData: ReposResponse = await reposResponse.json();
        repos = reposData.value.map((repo) => ({
          id: repo.id,
          name: repo.name,
          url: repo.webUrl,
          projectId: repo.project.id,
        }));
      }

      return {
        project: {
          id: project.id,
          name: project.name,
          url: `https://dev.azure.com/${orgName}/${encodeURIComponent(project.name)}`,
        },
        repos,
      };
    })
  );

  return { projects: projectsWithRepos };
}
```

**Step 2: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "refactor: update Azure DevOps service to use TokenRepository"
```

---

## Task 8: Update IPC Handlers

Add token handlers and update provider/azureDevOps handlers.

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add token imports and handlers**

Add imports:

```typescript
import { TokenRepository } from '../database/repositories';
import type { NewToken, UpdateToken } from '../../shared/types';
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
} from '../services/azure-devops-service';
```

Remove old import:

```typescript
// Remove: import { getOrganizations, getProviderDetails } from '../services/azure-devops-service';
```

Add token handlers after provider handlers:

```typescript
// Tokens
ipcMain.handle('tokens:findAll', () => TokenRepository.findAll());
ipcMain.handle('tokens:findById', (_, id: string) => TokenRepository.findById(id));
ipcMain.handle('tokens:findByProviderType', (_, providerType: string) =>
  TokenRepository.findByProviderType(providerType)
);
ipcMain.handle('tokens:create', (_, data: NewToken) => TokenRepository.create(data));
ipcMain.handle('tokens:update', (_, id: string, data: UpdateToken) =>
  TokenRepository.update(id, data)
);
ipcMain.handle('tokens:delete', (_, id: string) => TokenRepository.delete(id));
```

Update Azure DevOps handlers:

```typescript
// Azure DevOps
ipcMain.handle('azureDevOps:getOrganizations', (_, tokenId: string) =>
  getOrganizationsByTokenId(tokenId)
);
ipcMain.handle('azureDevOps:validateToken', (_, token: string) =>
  validateTokenAndGetOrganizations(token)
);
ipcMain.handle('azureDevOps:getTokenExpiration', (_, tokenId: string) =>
  getTokenExpiration(tokenId)
);
```

**Step 2: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add token IPC handlers and update Azure DevOps handlers"
```

---

## Task 9: Update Preload Script

Expose token API methods and update Azure DevOps methods.

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add tokens API and update azureDevOps**

Add after providers section:

```typescript
tokens: {
  findAll: () => ipcRenderer.invoke('tokens:findAll'),
  findById: (id: string) => ipcRenderer.invoke('tokens:findById', id),
  findByProviderType: (providerType: string) =>
    ipcRenderer.invoke('tokens:findByProviderType', providerType),
  create: (data: unknown) => ipcRenderer.invoke('tokens:create', data),
  update: (id: string, data: unknown) =>
    ipcRenderer.invoke('tokens:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('tokens:delete', id),
},
```

Update azureDevOps section:

```typescript
azureDevOps: {
  getOrganizations: (tokenId: string) =>
    ipcRenderer.invoke('azureDevOps:getOrganizations', tokenId),
  validateToken: (token: string) =>
    ipcRenderer.invoke('azureDevOps:validateToken', token),
  getTokenExpiration: (tokenId: string) =>
    ipcRenderer.invoke('azureDevOps:getTokenExpiration', tokenId),
},
```

**Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose token API and update Azure DevOps API in preload"
```

---

## Task 10: Update API Types

Add token API types and update existing types.

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add Token imports and API interface**

Add to imports:

```typescript
import type {
  // ... existing ...
  Token,
  NewToken,
  UpdateToken,
} from '../../shared/types';
```

Add tokens API interface:

```typescript
tokens: {
  findAll: () => Promise<Token[]>;
  findById: (id: string) => Promise<Token | undefined>;
  findByProviderType: (providerType: string) => Promise<Token[]>;
  create: (data: NewToken) => Promise<Token>;
  update: (id: string, data: UpdateToken) => Promise<Token>;
  delete: (id: string) => Promise<void>;
};
```

Update azureDevOps interface:

```typescript
azureDevOps: {
  getOrganizations: (tokenId: string) => Promise<AzureDevOpsOrganization[]>;
  validateToken: (token: string) => Promise<AzureDevOpsOrganization[]>;
  getTokenExpiration: (tokenId: string) => Promise<string | null>;
};
```

Add stub implementations for tokens:

```typescript
tokens: {
  findAll: async () => [],
  findById: async () => undefined,
  findByProviderType: async () => [],
  create: async () => { throw new Error('API not available'); },
  update: async () => { throw new Error('API not available'); },
  delete: async () => {},
},
```

Update azureDevOps stubs:

```typescript
azureDevOps: {
  getOrganizations: async () => { throw new Error('API not available'); },
  validateToken: async () => { throw new Error('API not available'); },
  getTokenExpiration: async () => null,
},
```

**Step 2: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add token API types and update Azure DevOps API types"
```

---

## Task 11: Create Token Hooks

Create React Query hooks for token operations.

**Files:**
- Create: `src/hooks/use-tokens.ts`

**Step 1: Create the hooks file**

```typescript
// src/hooks/use-tokens.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import type { NewToken, UpdateToken } from '../../shared/types';

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: api.tokens.findAll,
  });
}

export function useToken(id: string) {
  return useQuery({
    queryKey: ['tokens', id],
    queryFn: () => api.tokens.findById(id),
    enabled: !!id,
  });
}

export function useTokensByProviderType(providerType: string) {
  return useQuery({
    queryKey: ['tokens', 'byProviderType', providerType],
    queryFn: () => api.tokens.findByProviderType(providerType),
    enabled: !!providerType,
  });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewToken) => api.tokens.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

export function useUpdateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateToken }) =>
      api.tokens.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['tokens', id] });
    },
  });
}

export function useDeleteToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tokens.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-tokens.ts
git commit -m "feat: add React Query hooks for tokens"
```

---

## Task 12: Update Azure DevOps Hooks

Update hooks to work with tokenId and add token validation.

**Files:**
- Modify: `src/hooks/use-azure-devops.ts`

**Step 1: Update hooks**

```typescript
// src/hooks/use-azure-devops.ts
import { useMutation } from '@tanstack/react-query';

import { api, AzureDevOpsOrganization } from '@/lib/api';

// Get organizations using an existing token (by ID)
export function useGetAzureDevOpsOrganizations() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (tokenId: string) => api.azureDevOps.getOrganizations(tokenId),
  });
}

// Validate a raw token and get organizations (for token creation flow)
export function useValidateAzureDevOpsToken() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (token: string) => api.azureDevOps.validateToken(token),
  });
}

// Get token expiration from Azure DevOps API
export function useGetAzureDevOpsTokenExpiration() {
  return useMutation<string | null, Error, string>({
    mutationFn: (tokenId: string) => api.azureDevOps.getTokenExpiration(tokenId),
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-azure-devops.ts
git commit -m "refactor: update Azure DevOps hooks for token-based auth"
```

---

## Task 13: Create Tokens Tab UI

Create the Tokens settings tab with list and add/edit functionality.

**Files:**
- Create: `src/features/settings/ui-tokens-tab/index.tsx`
- Create: `src/features/settings/ui-tokens-tab/token-list.tsx`
- Create: `src/features/settings/ui-tokens-tab/token-card.tsx`
- Create: `src/features/settings/ui-tokens-tab/add-token-pane.tsx`
- Create: `src/features/settings/ui-tokens-tab/edit-token-pane.tsx`
- Create: `src/features/settings/ui-tokens-tab/delete-token-dialog.tsx`
- Create: `src/routes/settings/tokens.tsx`
- Modify: `src/routes/settings.tsx`

**Step 1: Create TokensTab index**

```typescript
// src/features/settings/ui-tokens-tab/index.tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { Token } from '../../../../shared/types';

import { AddTokenPane } from './add-token-pane';
import { EditTokenPane } from './edit-token-pane';
import { TokenList } from './token-list';

export function TokensTab() {
  const [showAddPane, setShowAddPane] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);

  const showEditPane = selectedToken !== null;

  const handleSelectToken = (token: Token | null) => {
    setSelectedToken(token);
    if (token !== null) {
      setShowAddPane(false);
    }
  };

  const handleShowAddPane = () => {
    setShowAddPane(true);
    setSelectedToken(null);
  };

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">Tokens</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Manage your Personal Access Tokens for git providers
            </p>
          </div>
          <button
            onClick={handleShowAddPane}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add Token
          </button>
        </div>

        <TokenList
          selectedTokenId={selectedToken?.id ?? null}
          onSelectToken={handleSelectToken}
        />
      </div>

      {showAddPane && <AddTokenPane onClose={() => setShowAddPane(false)} />}

      {showEditPane && (
        <EditTokenPane
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Create TokenList**

```typescript
// src/features/settings/ui-tokens-tab/token-list.tsx
import { useTokens } from '@/hooks/use-tokens';

import type { Token } from '../../../../shared/types';

import { TokenCard } from './token-card';

export function TokenList({
  selectedTokenId,
  onSelectToken,
}: {
  selectedTokenId: string | null;
  onSelectToken: (token: Token | null) => void;
}) {
  const { data: tokens = [], isLoading } = useTokens();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-neutral-500">
        Loading tokens...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-neutral-400">No tokens configured</p>
        <p className="mt-1 text-sm text-neutral-500">
          Add a token to connect to your git providers
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tokens.map((token) => (
        <TokenCard
          key={token.id}
          token={token}
          isSelected={token.id === selectedTokenId}
          onSelect={() =>
            onSelectToken(token.id === selectedTokenId ? null : token)
          }
        />
      ))}
    </div>
  );
}
```

**Step 3: Create TokenCard**

```typescript
// src/features/settings/ui-tokens-tab/token-card.tsx
import { AlertCircle, CheckCircle, Clock, Key } from 'lucide-react';

import type { Token } from '../../../../shared/types';

const PROVIDER_LABELS: Record<string, string> = {
  'azure-devops': 'Azure DevOps',
  github: 'GitHub',
  gitlab: 'GitLab',
};

function getExpirationStatus(expiresAt: string | null): {
  label: string;
  color: string;
  icon: typeof CheckCircle;
} {
  if (!expiresAt) {
    return { label: 'No expiration', color: 'text-neutral-400', icon: Clock };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return { label: 'Expired', color: 'text-red-400', icon: AlertCircle };
  }
  if (daysUntil <= 7) {
    return { label: `Expires in ${daysUntil} days`, color: 'text-yellow-400', icon: AlertCircle };
  }
  if (daysUntil <= 30) {
    return { label: `Expires in ${daysUntil} days`, color: 'text-yellow-500', icon: Clock };
  }
  return { label: `Expires in ${daysUntil} days`, color: 'text-green-400', icon: CheckCircle };
}

export function TokenCard({
  token,
  isSelected,
  onSelect,
}: {
  token: Token;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const expiration = getExpirationStatus(token.expiresAt);
  const ExpirationIcon = expiration.icon;

  return (
    <button
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-neutral-400" />
          <span className="font-medium text-neutral-200">{token.label}</span>
        </div>
        <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
          {PROVIDER_LABELS[token.providerType] || token.providerType}
        </span>
      </div>

      <div className={`flex items-center gap-1.5 text-sm ${expiration.color}`}>
        <ExpirationIcon className="h-3.5 w-3.5" />
        {expiration.label}
      </div>
    </button>
  );
}
```

**Step 4: Create AddTokenPane**

```typescript
// src/features/settings/ui-tokens-tab/add-token-pane.tsx
import { ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useValidateAzureDevOpsToken } from '@/hooks/use-azure-devops';
import { useCreateToken } from '@/hooks/use-tokens';

import type { ProviderType } from '../../../../shared/types';

type Step = 'form' | 'validating';

const PROVIDER_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'azure-devops', label: 'Azure DevOps' },
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
];

export function AddTokenPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('form');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [providerType, setProviderType] = useState<ProviderType>('azure-devops');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validateToken = useValidateAzureDevOpsToken();
  const createToken = useCreateToken();

  const handleSubmit = async () => {
    setError(null);
    setStep('validating');

    try {
      // For Azure DevOps, validate the token first
      if (providerType === 'azure-devops') {
        await validateToken.mutateAsync(token);
      }

      // Create the token
      await createToken.mutateAsync({
        label,
        token,
        providerType,
        expiresAt: expiresAt || null,
        updatedAt: new Date().toISOString(),
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
      setStep('form');
    }
  };

  const isValid = label.trim() && token.trim();

  return (
    <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-neutral-200">Add Token</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Provider Type
          </label>
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as ProviderType)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Work Azure PAT"
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Personal Access Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your PAT"
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Expiration Date (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {providerType === 'azure-devops' && (
          <a
            href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            How to create a PAT
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid || step === 'validating'}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
        >
          {step === 'validating' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            'Add Token'
          )}
        </button>
      </div>
    </div>
  );
}
```

**Step 5: Create EditTokenPane**

```typescript
// src/features/settings/ui-tokens-tab/edit-token-pane.tsx
import { Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useGetAzureDevOpsTokenExpiration } from '@/hooks/use-azure-devops';
import { useDeleteToken, useUpdateToken } from '@/hooks/use-tokens';

import type { Token } from '../../../../shared/types';

import { DeleteTokenDialog } from './delete-token-dialog';

export function EditTokenPane({
  token,
  onClose,
}: {
  token: Token;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(token.label);
  const [newToken, setNewToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    token.expiresAt ? token.expiresAt.split('T')[0] : ''
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateToken = useUpdateToken();
  const deleteToken = useDeleteToken();
  const getExpiration = useGetAzureDevOpsTokenExpiration();

  const handleSave = async () => {
    setError(null);
    try {
      await updateToken.mutateAsync({
        id: token.id,
        data: {
          label,
          ...(newToken ? { token: newToken } : {}),
          expiresAt: expiresAt || null,
          updatedAt: new Date().toISOString(),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token');
    }
  };

  const handleRefreshExpiration = async () => {
    try {
      const expiration = await getExpiration.mutateAsync(token.id);
      if (expiration) {
        setExpiresAt(expiration.split('T')[0]);
      }
    } catch {
      // Silently fail - user can set manually
    }
  };

  const handleDelete = async () => {
    await deleteToken.mutateAsync(token.id);
    onClose();
  };

  const hasChanges =
    label !== token.label ||
    newToken !== '' ||
    expiresAt !== (token.expiresAt ? token.expiresAt.split('T')[0] : '');

  return (
    <>
      <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-neutral-200">Edit Token</h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              New Token (leave empty to keep current)
            </label>
            <input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Enter new PAT to update"
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-400">
                Expiration Date
              </label>
              {token.providerType === 'azure-devops' && (
                <button
                  onClick={handleRefreshExpiration}
                  disabled={getExpiration.isPending}
                  className="flex cursor-pointer items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  {getExpiration.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Fetch from API
                </button>
              )}
            </div>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateToken.isPending}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {updateToken.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>

      {showDeleteDialog && (
        <DeleteTokenDialog
          tokenLabel={token.label}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          isDeleting={deleteToken.isPending}
        />
      )}
    </>
  );
}
```

**Step 6: Create DeleteTokenDialog**

```typescript
// src/features/settings/ui-tokens-tab/delete-token-dialog.tsx
import { AlertTriangle, Loader2 } from 'lucide-react';

export function DeleteTokenDialog({
  tokenLabel,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  tokenLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">Delete Token</h3>
            <p className="text-sm text-neutral-400">This action cannot be undone</p>
          </div>
        </div>

        <p className="mb-6 text-sm text-neutral-300">
          Are you sure you want to delete <strong>{tokenLabel}</strong>? Any providers
          using this token will be disconnected.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 7: Create tokens route**

```typescript
// src/routes/settings/tokens.tsx
import { createFileRoute } from '@tanstack/react-router';

import { TokensTab } from '@/features/settings/ui-tokens-tab';

export const Route = createFileRoute('/settings/tokens')({
  component: TokensSettingsPage,
});

function TokensSettingsPage() {
  return <TokensTab />;
}
```

**Step 8: Update settings layout to add Tokens tab**

In `src/routes/settings.tsx`, add the Tokens tab:

```typescript
const tabs = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/tokens', label: 'Tokens' },
  { to: '/settings/azure-devops', label: 'Azure DevOps' },
  { to: '/settings/debug', label: 'Debug' },
] as const;
```

**Step 9: Commit**

```bash
git add src/features/settings/ui-tokens-tab/ src/routes/settings/tokens.tsx src/routes/settings.tsx
git commit -m "feat: add Tokens settings tab with list, add, edit, and delete functionality"
```

---

## Task 14: Update Azure DevOps Tab UI

Update to use tokens instead of entering PAT directly.

**Files:**
- Modify: `src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx`
- Modify: `src/features/settings/ui-azure-devops-tab/organization-card.tsx`

**Step 1: Update AddOrganizationPane to use token selector**

Replace with:

```typescript
// src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';

import { useGetAzureDevOpsOrganizations } from '@/hooks/use-azure-devops';
import { useCreateProvider, useProviders } from '@/hooks/use-providers';
import { useTokensByProviderType } from '@/hooks/use-tokens';
import { AzureDevOpsOrganization } from '@/lib/api';

type PaneStep = 'selectToken' | 'selectOrgs';

export function AddOrganizationPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<PaneStep>('selectToken');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<AzureDevOpsOrganization[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const { data: tokens = [], isLoading: tokensLoading } = useTokensByProviderType('azure-devops');
  const { data: existingProviders = [] } = useProviders();
  const getOrganizations = useGetAzureDevOpsOrganizations();
  const createProvider = useCreateProvider();

  const existingOrgUrls = new Set(
    existingProviders
      .filter((p) => p.type === 'azure-devops')
      .map((p) => p.baseUrl)
  );

  const handleSelectToken = async (tokenId: string) => {
    setSelectedTokenId(tokenId);
    try {
      const orgs = await getOrganizations.mutateAsync(tokenId);
      const newOrgs = orgs.filter((org) => !existingOrgUrls.has(org.url));

      if (newOrgs.length === 0) {
        alert('All accessible organizations are already connected.');
        return;
      }

      setOrganizations(newOrgs);
      if (newOrgs.length === 1) {
        setSelectedOrgs(new Set([newOrgs[0].id]));
      }
      setStep('selectOrgs');
    } catch {
      // Error displayed via getOrganizations.error
    }
  };

  const handleToggleOrg = (orgId: string) => {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (!selectedTokenId) return;

    const selectedOrgsList = organizations.filter((org) => selectedOrgs.has(org.id));

    for (const org of selectedOrgsList) {
      await createProvider.mutateAsync({
        type: 'azure-devops',
        label: org.name,
        baseUrl: org.url,
        tokenId: selectedTokenId,
        updatedAt: new Date().toISOString(),
      });
    }

    onClose();
  };

  return (
    <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-neutral-200">Add Organization</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === 'selectToken' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Select a token to authenticate with Azure DevOps:
          </p>

          {tokensLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-4 text-center">
              <p className="text-sm text-neutral-400">No Azure DevOps tokens found</p>
              <Link
                to="/settings/tokens"
                className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300"
              >
                Add a token first →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => handleSelectToken(token.id)}
                  disabled={getOrganizations.isPending}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-left hover:border-neutral-500 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-neutral-200">
                    {token.label}
                  </span>
                  {getOrganizations.isPending && selectedTokenId === token.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  )}
                </button>
              ))}
            </div>
          )}

          {getOrganizations.error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {getOrganizations.error.message}
            </div>
          )}
        </div>
      )}

      {step === 'selectOrgs' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-400">
            Select organizations to add:
          </p>

          <div className="flex flex-col gap-2">
            {organizations.map((org) => (
              <label
                key={org.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 hover:border-neutral-500"
              >
                <input
                  type="checkbox"
                  checked={selectedOrgs.has(org.id)}
                  onChange={() => handleToggleOrg(org.id)}
                  className="h-4 w-4 rounded border-neutral-500 bg-neutral-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-200">{org.name}</div>
                  <div className="text-xs text-neutral-500">{org.url}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('selectToken')}
              className="flex-1 cursor-pointer rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600"
            >
              Back
            </button>
            <button
              onClick={handleAddSelected}
              disabled={selectedOrgs.size === 0 || createProvider.isPending}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {createProvider.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Add ${selectedOrgs.size > 0 ? `(${selectedOrgs.size})` : ''}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update OrganizationCard to show token reference (optional enhancement)**

Add token label display if desired:

```typescript
// In organization-card.tsx, optionally show token info
// This requires joining token data - can be added later
```

**Step 3: Commit**

```bash
git add src/features/settings/ui-azure-devops-tab/
git commit -m "refactor: update Azure DevOps tab to use token selector instead of PAT input"
```

---

## Task 15: Update Database Schema Re-exports

Ensure schema.ts properly re-exports the new Token types.

**Files:**
- Modify: `electron/database/schema.ts`

**Step 1: Add Token to re-exports**

Add to the re-export section:

```typescript
export type {
  Provider,
  NewProvider,
  UpdateProvider,
  Token,
  NewToken,
  UpdateToken,
  // ... other exports
} from '../../shared/types';
```

**Step 2: Commit**

```bash
git add electron/database/schema.ts
git commit -m "chore: add Token types to schema re-exports"
```

---

## Task 16: Final Testing and Cleanup

Run the app and verify all functionality works.

**Step 1: Start the app**

```bash
pnpm dev
```

**Step 2: Test token creation**

1. Go to Settings → Tokens
2. Click "Add Token"
3. Select Azure DevOps, enter label and PAT
4. Verify token appears in list with expiration status

**Step 3: Test provider creation**

1. Go to Settings → Azure DevOps
2. Click "Add Organization"
3. Select the token you created
4. Select organizations and add them

**Step 4: Verify provider works**

1. Click on an organization card
2. Verify projects/repos load correctly

**Step 5: Test token editing**

1. Go to Settings → Tokens
2. Click on a token
3. Edit label, test "Fetch from API" for expiration
4. Save changes

**Step 6: Test token deletion**

1. Delete a token
2. Verify associated providers show disconnected state

**Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```
