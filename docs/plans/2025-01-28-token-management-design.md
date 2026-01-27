# Token Management Rework Design

## Overview

Rework how providers and tokens are managed by creating a dedicated `tokens` table with encryption, allowing one token to authenticate multiple providers/organizations.

## Goals

- Separate token storage from provider configuration
- One token can authenticate multiple providers (e.g., one Azure PAT for multiple orgs)
- Tokens encrypted at rest using Electron's safeStorage
- Token expiration tracking with auto-fetch from Azure DevOps API
- Token values never exposed to renderer process

## Database Schema

### New `tokens` table

```sql
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,              -- User-provided name (e.g., "Work Azure PAT")
  token_encrypted TEXT NOT NULL,    -- Encrypted via Electron safeStorage
  provider_type TEXT NOT NULL,      -- 'azure_devops' | 'github' | 'gitlab'
  expires_at TEXT,                  -- ISO timestamp, nullable
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Modified `providers` table

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,               -- 'azure_devops' | 'github' | 'gitlab'
  label TEXT NOT NULL,              -- Organization/account name
  base_url TEXT NOT NULL,           -- API base URL
  token_id TEXT,                    -- FK to tokens (nullable)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE SET NULL
);
```

## Migration Strategy

**Migration: `018_tokens_and_providers_rework.ts`**

Destructive migration - existing providers will be dropped:

1. Disable FK constraints
2. Create `tokens` table
3. Set `provider_id = NULL` on all projects
4. Drop old `providers` table
5. Create new `providers` table with `token_id` FK
6. Re-enable FK constraints and verify integrity

Users will need to re-add tokens and providers after migration.

## Security Model

### Token exposure rules

- **Main process**: Has access to decrypted tokens (for API calls)
- **Renderer process**: Only sees token metadata (id, label, providerType, expiresAt) - never the actual token value

### Types separation

**Shared types (exposed to renderer):**
```typescript
export interface Token {
  id: string;
  label: string;
  providerType: 'azure_devops' | 'github' | 'gitlab';
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewToken {
  label: string;
  token: string;  // Plain token sent once during creation, never returned
  providerType: 'azure_devops' | 'github' | 'gitlab';
  expiresAt?: string | null;
}
```

**Internal types (main process only):**
```typescript
export interface TokenRow {
  id: string;
  label: string;
  tokenEncrypted: string;  // Encrypted, stays in main process
  providerType: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

## Encryption Service

Extract existing encryption functions into dedicated service:

**`electron/services/encryption-service.ts`**
```typescript
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

## API Layer

### New token endpoints

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

### Updated Azure DevOps endpoints

```typescript
azureDevOps: {
  getOrganizations: (tokenId: string) => Promise<AzureDevOpsOrganization[]>;  // tokenId instead of raw token
  getTokenExpiration: (tokenId: string) => Promise<string | null>;  // New: fetch PAT expiration
};
```

## Token Expiration Auto-Fetch

For Azure DevOps, use PAT Lifecycle Management API:

**Endpoint:** `GET https://vssps.dev.azure.com/{organization}/_apis/tokens/pats?api-version=7.1-preview.1`

**Flow:**
1. User pastes PAT
2. Call `getOrganizations` to validate & get orgs
3. Using first org, call PAT API to find matching token and get `validTo`
4. If API fails (insufficient scopes), fall back to manual expiration entry
5. Store token with expiration date

## Settings UI Structure

### Tab structure

```
Settings
├── General (existing)
├── Tokens (new)
└── Azure DevOps (updated)
```

### Tokens tab (`/settings/tokens`)

**Layout:**
- List of tokens as cards
- "Add Token" button opens a pane/dialog

**Token card displays:**
- Label (e.g., "Work Azure PAT")
- Provider type badge (Azure DevOps / GitHub / GitLab)
- Expiration status: "Expires in 30 days" / "Expired" / "No expiration"
- Actions: Edit, Refresh expiration, Delete

**Add Token flow:**
1. Select provider type (Azure DevOps, GitHub, GitLab)
2. Enter label
3. Paste token
4. For Azure DevOps: auto-fetch expiration, or manual entry if API fails
5. Save

### Azure DevOps tab (updated)

**Changes:**
- When adding organization, select from existing tokens (dropdown)
- If no tokens exist, prompt user to add one first
- Organization cards show which token they're using

## Implementation Order

1. Create encryption service (extract from providers.ts)
2. Create migration `018_tokens_and_providers_rework.ts`
3. Update database schema types
4. Create TokenRepository
5. Update ProviderRepository (remove token field, add tokenId)
6. Add token IPC handlers
7. Update Azure DevOps service to use tokenId lookups
8. Add token expiration API integration
9. Create Tokens settings tab UI
10. Update Azure DevOps settings tab UI
11. Add React Query hooks for tokens
