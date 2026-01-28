# Azure DevOps Settings Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Azure DevOps tab to settings page allowing users to connect multiple organizations using PATs.

**Architecture:** Token-first flow where user pastes PAT, we fetch accessible organizations from Azure DevOps API, user selects which to add. Uses existing `providers` table with `type='azure-devops'`. Settings tabs become route-based (`/settings/general`, `/settings/azure-devops`, `/settings/debug`).

**Tech Stack:** React, TanStack Router (nested routes), TanStack Query (mutations), Electron IPC, Azure DevOps REST API.

---

### Task 1: Azure DevOps Service (Backend)

**Files:**

- Create: `electron/services/azure-devops-service.ts`

**Step 1: Create the service file**

```typescript
// electron/services/azure-devops-service.ts

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
}

interface ProfileResponse {
  id: string;
  displayName: string;
  emailAddress: string;
}

interface AccountsResponse {
  count: number;
  value: Array<{
    accountId: string;
    accountName: string;
    accountUri: string;
  }>;
}

export async function getOrganizations(
  token: string,
): Promise<AzureDevOpsOrganization[]> {
  // Step 1: Get the user's member ID from profile
  const profileResponse = await fetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      },
    },
  );

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to authenticate with Azure DevOps: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  // Step 2: Get the list of organizations the user has access to
  const accountsResponse = await fetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.0`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      },
    },
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
```

**Step 2: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add Azure DevOps service for fetching organizations"
```

---

### Task 2: IPC Handler for Azure DevOps

**Files:**

- Modify: `electron/ipc/handlers.ts`

**Step 1: Add import and handler**

At the top of the file, add the import:

```typescript
import { getOrganizations } from '../services/azure-devops-service';
```

In `registerIpcHandlers()`, add after the Providers section (around line 220):

```typescript
// Azure DevOps
ipcMain.handle('azureDevOps:getOrganizations', (_, token: string) =>
  getOrganizations(token),
);
```

**Step 2: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handler for Azure DevOps getOrganizations"
```

---

### Task 3: Preload Bridge for Azure DevOps

**Files:**

- Modify: `electron/preload.ts`

**Step 1: Add azureDevOps to exposed API**

Add after the `providers` section (around line 70):

```typescript
  azureDevOps: {
    getOrganizations: (token: string) =>
      ipcRenderer.invoke('azureDevOps:getOrganizations', token),
  },
```

**Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose azureDevOps API in preload bridge"
```

---

### Task 4: API Types for Azure DevOps

**Files:**

- Modify: `src/lib/api.ts`

**Step 1: Add AzureDevOpsOrganization type**

After the `WorktreeFileContent` interface (around line 45), add:

```typescript
export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
}
```

**Step 2: Add azureDevOps to Api interface**

In the `Api` interface, add after `providers` section (around line 100):

```typescript
azureDevOps: {
  getOrganizations: (token: string) => Promise<AzureDevOpsOrganization[]>;
}
```

**Step 3: Add stub to fallback api object**

In the fallback api object, add after `providers` section (around line 200):

```typescript
      azureDevOps: {
        getOrganizations: async () => { throw new Error('API not available'); },
      },
```

**Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add azureDevOps types to renderer API"
```

---

### Task 5: React Hook for Azure DevOps

**Files:**

- Create: `src/hooks/use-azure-devops.ts`

**Step 1: Create the hook file**

```typescript
// src/hooks/use-azure-devops.ts
import { useMutation } from '@tanstack/react-query';

import { api, AzureDevOpsOrganization } from '@/lib/api';

export function useGetAzureDevOpsOrganizations() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (token: string) => api.azureDevOps.getOrganizations(token),
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-azure-devops.ts
git commit -m "feat: add useGetAzureDevOpsOrganizations hook"
```

---

### Task 6: Refactor Settings to Route-Based Tabs

**Files:**

- Create: `src/routes/settings/index.tsx`
- Create: `src/routes/settings/general.tsx`
- Create: `src/routes/settings/debug.tsx`
- Modify: `src/routes/settings.tsx`

**Step 1: Create settings index route (redirect)**

```typescript
// src/routes/settings/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/general' });
  },
  component: () => null,
});
```

**Step 2: Create general settings route**

Extract the editor settings content from `settings.tsx`:

```typescript
// src/routes/settings/general.tsx
import { createFileRoute } from '@tanstack/react-router';
import { Check, FolderOpen } from 'lucide-react';
import { useState } from 'react';

import {
  useEditorSetting,
  useUpdateEditorSetting,
  useAvailableEditors,
} from '@/hooks/use-settings';
import { api } from '@/lib/api';

import { PRESET_EDITORS, type EditorSetting } from '../../../shared/types';

export const Route = createFileRoute('/settings/general')({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { data: editorSetting, isLoading } = useEditorSetting();
  const { data: availableEditors } = useAvailableEditors();
  const updateEditor = useUpdateEditorSetting();
  const [customCommand, setCustomCommand] = useState('');

  const handleSelectPreset = (id: string) => {
    updateEditor.mutate({ type: 'preset', id });
    setCustomCommand('');
  };

  const handleSetCustomCommand = () => {
    if (customCommand.trim()) {
      updateEditor.mutate({ type: 'command', command: customCommand.trim() });
    }
  };

  const handleBrowseApp = async () => {
    const result = await api.dialog.openApplication();
    if (result) {
      updateEditor.mutate({
        type: 'app',
        path: result.path,
        name: result.name,
      });
      setCustomCommand('');
    }
  };

  const getEditorLabel = (setting: EditorSetting): string => {
    if (setting.type === 'preset') {
      const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
      return editor?.label ?? setting.id;
    }
    if (setting.type === 'command') {
      return setting.command;
    }
    return setting.name;
  };

  const isPresetSelected = (id: string): boolean => {
    return editorSetting?.type === 'preset' && editorSetting.id === id;
  };

  const isEditorAvailable = (id: string): boolean => {
    return availableEditors?.find((e) => e.id === id)?.available ?? false;
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">Editor</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Choose which editor to open projects in
      </p>

      {/* Preset editors */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_EDITORS.map((editor) => {
          const available = isEditorAvailable(editor.id);
          const selected = isPresetSelected(editor.id);

          return (
            <button
              key={editor.id}
              onClick={() => handleSelectPreset(editor.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                  : available
                    ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-600'
              }`}
            >
              {editor.label}
              {available && <Check className="h-3 w-3 text-green-500" />}
            </button>
          );
        })}
      </div>

      {/* Custom command */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-neutral-400">
          Custom command
        </label>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetCustomCommand()}
            placeholder="e.g., vim, emacs, nano"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSetCustomCommand}
            disabled={!customCommand.trim()}
            className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-700"
          >
            Set
          </button>
        </div>
      </div>

      {/* Browse for app */}
      <div className="mt-4">
        <button
          onClick={handleBrowseApp}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700"
        >
          <FolderOpen className="h-4 w-4" />
          Browse for application...
        </button>
      </div>

      {/* Current selection */}
      {editorSetting && (
        <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
          <span className="text-sm text-neutral-500">Current editor: </span>
          <span className="text-sm font-medium text-neutral-200">
            {getEditorLabel(editorSetting)}
          </span>
          {editorSetting.type === 'app' && (
            <span className="ml-2 text-xs text-neutral-500">
              ({editorSetting.path})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create debug route**

```typescript
// src/routes/settings/debug.tsx
import { createFileRoute } from '@tanstack/react-router';

import { DebugDatabase } from '@/features/settings/ui-debug-database';

export const Route = createFileRoute('/settings/debug')({
  component: DebugSettingsPage,
});

function DebugSettingsPage() {
  return <DebugDatabase />;
}
```

**Step 4: Update settings.tsx to be a layout**

```typescript
// src/routes/settings.tsx
import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const matchRoute = useMatchRoute();

  const tabs = [
    { to: '/settings/general', label: 'General' },
    { to: '/settings/azure-devops', label: 'Azure DevOps' },
    { to: '/settings/debug', label: 'Debug' },
  ] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-tl-lg border-l border-t border-neutral-800 p-6">
      {/* Tab navigation */}
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const isActive = matchRoute({ to: tab.to });
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-8 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/routes/settings.tsx src/routes/settings/
git commit -m "refactor: convert settings page to route-based tabs"
```

---

### Task 7: Azure DevOps Tab - Organization List

**Files:**

- Create: `src/features/settings/ui-azure-devops-tab/index.tsx`
- Create: `src/features/settings/ui-azure-devops-tab/organization-list.tsx`
- Create: `src/features/settings/ui-azure-devops-tab/organization-card.tsx`

**Step 1: Create organization card component**

```typescript
// src/features/settings/ui-azure-devops-tab/organization-card.tsx
import { X } from 'lucide-react';

import { Provider } from '../../../../shared/types';

export function OrganizationCard({
  provider,
  onDelete,
}: {
  provider: Provider;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
          </svg>
        </div>
        <div>
          <div className="font-medium text-neutral-200">{provider.label}</div>
          <div className="text-sm text-neutral-500">{provider.baseUrl}</div>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        title="Remove organization"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

**Step 2: Create organization list component**

```typescript
// src/features/settings/ui-azure-devops-tab/organization-list.tsx
import { useProviders, useDeleteProvider } from '@/hooks/use-providers';

import { OrganizationCard } from './organization-card';

export function OrganizationList() {
  const { data: providers = [] } = useProviders();
  const deleteProvider = useDeleteProvider();

  const azureDevOpsProviders = providers.filter((p) => p.type === 'azure-devops');

  if (azureDevOpsProviders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 px-6 py-8 text-center">
        <p className="text-neutral-500">No organizations connected yet</p>
        <p className="mt-1 text-sm text-neutral-600">
          Click "Add Organization" to connect your Azure DevOps account
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {azureDevOpsProviders.map((provider) => (
        <OrganizationCard
          key={provider.id}
          provider={provider}
          onDelete={() => deleteProvider.mutate(provider.id)}
        />
      ))}
    </div>
  );
}
```

**Step 3: Create main tab component**

```typescript
// src/features/settings/ui-azure-devops-tab/index.tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { AddOrganizationPane } from './add-organization-pane';
import { OrganizationList } from './organization-list';

export function AzureDevOpsTab() {
  const [showAddPane, setShowAddPane] = useState(false);

  return (
    <div className="flex h-full gap-6">
      {/* Main content */}
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">Organizations</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Connect your Azure DevOps organizations
            </p>
          </div>
          <button
            onClick={() => setShowAddPane(true)}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add Organization
          </button>
        </div>

        <OrganizationList />
      </div>

      {/* Right pane for adding */}
      {showAddPane && (
        <AddOrganizationPane onClose={() => setShowAddPane(false)} />
      )}
    </div>
  );
}
```

**Step 4: Commit (partial - pane comes in next task)**

```bash
git add src/features/settings/ui-azure-devops-tab/organization-card.tsx src/features/settings/ui-azure-devops-tab/organization-list.tsx src/features/settings/ui-azure-devops-tab/index.tsx
git commit -m "feat: add Azure DevOps tab with organization list"
```

---

### Task 8: Azure DevOps Tab - Add Organization Pane

**Files:**

- Create: `src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx`

**Step 1: Create the pane component**

```typescript
// src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx
import { ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useGetAzureDevOpsOrganizations } from '@/hooks/use-azure-devops';
import { useCreateProvider, useProviders } from '@/hooks/use-providers';
import { AzureDevOpsOrganization } from '@/lib/api';

type PaneStep = 'token' | 'select';

export function AddOrganizationPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<PaneStep>('token');
  const [token, setToken] = useState('');
  const [organizations, setOrganizations] = useState<AzureDevOpsOrganization[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());

  const { data: existingProviders = [] } = useProviders();
  const getOrganizations = useGetAzureDevOpsOrganizations();
  const createProvider = useCreateProvider();

  const existingOrgUrls = new Set(
    existingProviders
      .filter((p) => p.type === 'azure-devops')
      .map((p) => p.baseUrl)
  );

  const handleConnect = async () => {
    try {
      const orgs = await getOrganizations.mutateAsync(token);
      // Filter out already connected organizations
      const newOrgs = orgs.filter((org) => !existingOrgUrls.has(org.url));

      if (newOrgs.length === 0) {
        // All organizations are already connected
        alert('All accessible organizations are already connected.');
        return;
      }

      setOrganizations(newOrgs);
      // Auto-select all if only one
      if (newOrgs.length === 1) {
        setSelectedOrgs(new Set([newOrgs[0].id]));
      }
      setStep('select');
    } catch (error) {
      // Error is displayed via getOrganizations.error
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
    const selectedOrgsList = organizations.filter((org) => selectedOrgs.has(org.id));

    for (const org of selectedOrgsList) {
      await createProvider.mutateAsync({
        type: 'azure-devops',
        label: org.name,
        baseUrl: org.url,
        token: token,
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

      {step === 'token' && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Personal Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && token && handleConnect()}
              placeholder="Enter your PAT"
              className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <a
            href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            How to create a PAT
            <ExternalLink className="h-3 w-3" />
          </a>

          {getOrganizations.error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {getOrganizations.error.message}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={!token || getOrganizations.isPending}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            {getOrganizations.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      )}

      {step === 'select' && (
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
              onClick={() => setStep('token')}
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

**Step 2: Commit**

```bash
git add src/features/settings/ui-azure-devops-tab/add-organization-pane.tsx
git commit -m "feat: add organization pane with token-first flow"
```

---

### Task 9: Azure DevOps Route

**Files:**

- Create: `src/routes/settings/azure-devops.tsx`

**Step 1: Create the route file**

```typescript
// src/routes/settings/azure-devops.tsx
import { createFileRoute } from '@tanstack/react-router';

import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';

export const Route = createFileRoute('/settings/azure-devops')({
  component: AzureDevOpsSettingsPage,
});

function AzureDevOpsSettingsPage() {
  return <AzureDevOpsTab />;
}
```

**Step 2: Commit**

```bash
git add src/routes/settings/azure-devops.tsx
git commit -m "feat: add Azure DevOps settings route"
```

---

### Task 10: Final Verification

**Step 1: Run lint**

```bash
pnpm lint
```

Fix any linting errors.

**Step 2: Run build**

```bash
pnpm build
```

Verify no TypeScript errors.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint and build issues"
```
