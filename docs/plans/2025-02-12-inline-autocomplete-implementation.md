# Inline Ghost Text Autocomplete — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline ghost text completions (like GitHub Copilot) to prompt textareas, powered by Mistral FIM API via raw `fetch`.

**Architecture:** Settings stored in existing key-value `settings` table. A completion service in the main process makes FIM API calls. A React hook manages debouncing and ghost text state. An overlay div on the textarea renders ghost text.

**Tech Stack:** Electron IPC, React, TanStack Query, Tailwind CSS, Mistral FIM API (raw fetch)

**Design doc:** `docs/plans/2025-02-12-inline-autocomplete-design.md`

---

### Task 1: Add Completion Setting Type

**Files:**
- Modify: `shared/types.ts`

**Step 1: Add the CompletionSetting interface and validator**

In `shared/types.ts`, add before `SETTINGS_DEFINITIONS`:

```typescript
// Completion settings (FIM autocomplete)
export interface CompletionSetting {
  enabled: boolean;
  baseUrl: string;
  apiKey: string; // Stored encrypted
  model: string;
}

function isCompletionSetting(v: unknown): v is CompletionSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.enabled !== 'boolean') return false;
  if (typeof obj.baseUrl !== 'string') return false;
  if (typeof obj.apiKey !== 'string') return false;
  if (typeof obj.model !== 'string') return false;
  return true;
}
```

**Step 2: Register in SETTINGS_DEFINITIONS**

Add to `SETTINGS_DEFINITIONS` object:

```typescript
completion: {
  defaultValue: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    model: '',
  } as CompletionSetting,
  validate: isCompletionSetting,
},
```

**Step 3: Verify**

Run: `pnpm ts-check`

---

### Task 2: Create Completion Service

**Files:**
- Create: `electron/services/completion-service.ts`

**Step 1: Create the service**

```typescript
import { SettingsRepository } from '../database/repositories';
import { encryptionService } from './encryption-service';
import { dbg } from '../lib/debug';

export interface CompletionRequest {
  prompt: string;
  suffix?: string;
}

interface FimResponse {
  choices?: Array<{
    message?: { content?: string };
    // Some providers use text field directly
    text?: string;
  }>;
}

export async function complete({
  prompt,
  suffix,
}: CompletionRequest): Promise<string | null> {
  try {
    const settings = await SettingsRepository.get('completion');

    if (!settings.enabled || !settings.baseUrl || !settings.model) {
      return null;
    }

    const apiKey = settings.apiKey
      ? encryptionService.decrypt(settings.apiKey)
      : '';

    const baseUrl = settings.baseUrl.replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/v1/fim/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        prompt,
        suffix: suffix || undefined,
        max_tokens: 64,
        temperature: 0,
        stop: ['\n\n'],
      }),
    });

    if (!response.ok) {
      dbg.services(
        'Completion API error: %d %s',
        response.status,
        response.statusText,
      );
      return null;
    }

    const data = (await response.json()) as FimResponse;
    const text =
      data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? null;

    return text?.trim() || null;
  } catch (error) {
    dbg.services('Completion error: %O', error);
    return null;
  }
}

export async function testCompletion(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const result = await complete({ prompt: 'function hello() {' });
    return { success: result !== null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 2: Verify**

Run: `pnpm ts-check`

---

### Task 3: Add IPC Handlers & Preload Bridge

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add import and handler in `electron/ipc/handlers.ts`**

Add import at the top with other service imports:

```typescript
import { complete as completeText, testCompletion } from '../services/completion-service';
```

Add handlers inside `registerIpcHandlers()`, near the settings handlers:

```typescript
  // Completion
  ipcMain.handle(
    'completion:complete',
    (_, params: { prompt: string; suffix?: string }) =>
      completeText(params),
  );
  ipcMain.handle('completion:test', () => testCompletion());
```

**Step 2: Add to preload bridge in `electron/preload.ts`**

Add before the closing `});` of `contextBridge.exposeInMainWorld('api', {`:

```typescript
  completion: {
    complete: (params: { prompt: string; suffix?: string }) =>
      ipcRenderer.invoke('completion:complete', params),
    test: () => ipcRenderer.invoke('completion:test'),
  },
```

**Step 3: Add types to `src/lib/api.ts`**

Add to the `Api` interface (after the `claudeProjects` section):

```typescript
  completion: {
    complete: (params: {
      prompt: string;
      suffix?: string;
    }) => Promise<string | null>;
    test: () => Promise<{ success: boolean; error?: string }>;
  };
```

Add to the fallback `api` object (after the `claudeProjects` fallback):

```typescript
      completion: {
        complete: async () => null,
        test: async () => ({ success: false, error: 'API not available' }),
      },
```

**Step 4: Verify**

Run: `pnpm ts-check`

---

### Task 4: Add Completion Settings Hook

**Files:**
- Modify: `src/hooks/use-settings.ts`

**Step 1: Add convenience hooks for completion setting**

Add at the end of the file:

```typescript
// Convenience hooks for completion setting
export function useCompletionSetting() {
  return useSetting('completion');
}

export function useUpdateCompletionSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: CompletionSetting) =>
      api.settings.set('completion', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'completion'] });
    },
  });
}
```

Add the import for `CompletionSetting`:

```typescript
import type {
  AppSettings,
  BackendsSetting,
  CompletionSetting,
  EditorSetting,
} from '@shared/types';
```

**Step 2: Verify**

Run: `pnpm ts-check`

---

### Task 5: Create Autocomplete Settings Page

**Files:**
- Create: `src/routes/settings/autocomplete.tsx`
- Modify: `src/routes/settings.tsx` (add tab)

**Step 1: Create the settings page**

Create `src/routes/settings/autocomplete.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useCompletionSetting,
  useUpdateCompletionSetting,
} from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { encryptionService } from '@shared/types';

export const Route = createFileRoute('/settings/autocomplete')({
  component: AutocompleteSettingsPage,
});

function AutocompleteSettingsPage() {
  const { data: setting, isLoading } = useCompletionSetting();
  const updateSetting = useUpdateCompletionSetting();

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Sync local state from loaded setting
  useEffect(() => {
    if (setting) {
      setEnabled(setting.enabled);
      setBaseUrl(setting.baseUrl);
      setModel(setting.model);
      // Don't set apiKey - it's encrypted, show placeholder instead
      setHasApiKey(!!setting.apiKey);
      setApiKey('');
    }
  }, [setting]);

  const handleSave = async () => {
    setTestResult(null);
    setIsTesting(true);

    // Build the setting value
    // If user entered a new API key, encrypt it on the main process side
    // If not, keep the existing encrypted key
    const newSetting = {
      enabled,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim()
        ? apiKey.trim() // Will be encrypted by the settings page handler
        : setting?.apiKey ?? '',
      model: model.trim(),
    };

    updateSetting.mutate(newSetting, {
      onSuccess: async () => {
        if (enabled && newSetting.baseUrl && newSetting.model) {
          // Test the connection
          const result = await api.completion.test();
          if (result.success) {
            setTestResult({ type: 'success', text: 'Connection successful!' });
          } else {
            setTestResult({
              type: 'error',
              text: result.error ?? 'Connection failed',
            });
          }
        } else {
          setTestResult({ type: 'success', text: 'Settings saved.' });
        }
        setIsTesting(false);
        setApiKey('');
        setHasApiKey(!!newSetting.apiKey);
      },
      onError: (error) => {
        setTestResult({
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to save',
        });
        setIsTesting(false);
      },
    });
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">Autocomplete</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Configure inline ghost text completions powered by a FIM (Fill-in-the-Middle) API.
        Works with Mistral Codestral, DeepSeek, or any OpenAI-compatible FIM endpoint.
      </p>

      {/* Enable toggle */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-neutral-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm font-medium text-neutral-200">
          Enable autocomplete
        </span>
      </div>

      {/* Configuration fields */}
      <div className={`mt-6 space-y-4 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}>
        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.mistral.ai"
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-neutral-500">
            The API base URL (without /v1/fim/completions)
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '••••••••••••••••' : 'Enter API key (optional for local servers)'}
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {hasApiKey && (
            <p className="mt-1 text-xs text-neutral-500">
              Leave empty to keep existing key. Enter a new value to replace it.
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="codestral-2501"
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={isTesting || updateSetting.isPending}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(isTesting || updateSetting.isPending) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          Save
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-4 max-w-md rounded-lg border px-4 py-3 ${
            testResult.type === 'success'
              ? 'border-green-700 bg-green-900/30 text-green-400'
              : 'border-red-700 bg-red-900/30 text-red-400'
          }`}
        >
          <span className="text-sm">{testResult.text}</span>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add tab to settings layout**

In `src/routes/settings.tsx`, add to the `tabs` array before `debug`:

```typescript
{ to: '/settings/autocomplete', label: 'Autocomplete' },
```

**Step 3: Verify**

Run: `pnpm ts-check`

---

### Task 6: Handle API Key Encryption in Settings Flow

The API key needs to be encrypted before storage and decrypted when reading. Since the settings repository stores raw JSON, and the completion service decrypts in the main process, we need to encrypt the API key before calling `SettingsRepository.set()`.

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add a custom handler for completion settings**

Instead of using the generic `settings:set` for completion settings (which won't encrypt), add a dedicated handler:

```typescript
  ipcMain.handle(
    'completion:saveSettings',
    async (
      _,
      params: {
        enabled: boolean;
        baseUrl: string;
        apiKey: string;
        model: string;
      },
    ) => {
      const { encryptionService } = await import('../services/encryption-service');

      // Encrypt the API key if provided
      const encryptedApiKey = params.apiKey
        ? encryptionService.encrypt(params.apiKey)
        : '';

      await SettingsRepository.set('completion', {
        enabled: params.enabled,
        baseUrl: params.baseUrl,
        apiKey: encryptedApiKey,
        model: params.model,
      });
    },
  );
```

**Step 2: Add to preload bridge**

Add `saveSettings` to the `completion` section in `electron/preload.ts`:

```typescript
  completion: {
    complete: (params: { prompt: string; suffix?: string }) =>
      ipcRenderer.invoke('completion:complete', params),
    test: () => ipcRenderer.invoke('completion:test'),
    saveSettings: (params: {
      enabled: boolean;
      baseUrl: string;
      apiKey: string;
      model: string;
    }) => ipcRenderer.invoke('completion:saveSettings', params),
  },
```

**Step 3: Add type to `src/lib/api.ts`**

Add `saveSettings` to the `completion` section in the `Api` interface:

```typescript
  completion: {
    complete: (params: {
      prompt: string;
      suffix?: string;
    }) => Promise<string | null>;
    test: () => Promise<{ success: boolean; error?: string }>;
    saveSettings: (params: {
      enabled: boolean;
      baseUrl: string;
      apiKey: string;
      model: string;
    }) => Promise<void>;
  };
```

And in the fallback:

```typescript
      completion: {
        complete: async () => null,
        test: async () => ({ success: false, error: 'API not available' }),
        saveSettings: async () => {},
      },
```

**Step 4: Update the settings page to use `saveSettings`**

In `src/routes/settings/autocomplete.tsx`, update `handleSave` to call `api.completion.saveSettings` instead of the generic settings update:

Replace the `handleSave` function to use:

```typescript
  const handleSave = async () => {
    setTestResult(null);
    setIsTesting(true);

    try {
      await api.completion.saveSettings({
        enabled,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(), // Empty string means keep existing
        model: model.trim(),
      });

      if (enabled && baseUrl.trim() && model.trim()) {
        const result = await api.completion.test();
        if (result.success) {
          setTestResult({ type: 'success', text: 'Connection successful!' });
        } else {
          setTestResult({
            type: 'error',
            text: result.error ?? 'Connection failed',
          });
        }
      } else {
        setTestResult({ type: 'success', text: 'Settings saved.' });
      }
      setApiKey('');
      if (apiKey.trim()) {
        setHasApiKey(true);
      }
    } catch (error) {
      setTestResult({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save',
      });
    } finally {
      setIsTesting(false);
    }
  };
```

This also means the settings page no longer needs `useUpdateCompletionSetting`. Remove it and clean up unused imports. The page should use `useCompletionSetting` only for loading the initial values.

**Step 5: Update `saveSettings` handler to preserve existing API key when empty string is passed**

Update the handler in `electron/ipc/handlers.ts`:

```typescript
  ipcMain.handle(
    'completion:saveSettings',
    async (
      _,
      params: {
        enabled: boolean;
        baseUrl: string;
        apiKey: string;
        model: string;
      },
    ) => {
      const { encryptionService } = await import('../services/encryption-service');

      let encryptedApiKey: string;
      if (params.apiKey) {
        // New key provided — encrypt it
        encryptedApiKey = encryptionService.encrypt(params.apiKey);
      } else {
        // No new key — preserve existing
        const existing = await SettingsRepository.get('completion');
        encryptedApiKey = existing.apiKey;
      }

      await SettingsRepository.set('completion', {
        enabled: params.enabled,
        baseUrl: params.baseUrl,
        apiKey: encryptedApiKey,
        model: params.model,
      });
    },
  );
```

**Step 6: Verify**

Run: `pnpm ts-check`

---

### Task 7: Create `useInlineCompletion` Hook

**Files:**
- Create: `src/hooks/use-inline-completion.ts`

**Step 1: Create the hook**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

const DEBOUNCE_MS = 300;
const MIN_INPUT_LENGTH = 10;

export function useInlineCompletion({
  text,
  cursorPosition,
  enabled,
}: {
  text: string;
  cursorPosition: number;
  enabled: boolean;
}) {
  const [completion, setCompletion] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Clear completion when text changes
  useEffect(() => {
    setCompletion(null);

    if (!enabled || text.length < MIN_INPUT_LENGTH) {
      return;
    }

    // Don't trigger if text starts with / (slash command)
    if (text.startsWith('/')) {
      return;
    }

    // Increment request ID to invalidate any in-flight request
    const currentRequestId = ++requestIdRef.current;

    // Debounce
    debounceTimerRef.current = setTimeout(async () => {
      const prompt = text.slice(0, cursorPosition);
      const suffix =
        cursorPosition < text.length ? text.slice(cursorPosition) : undefined;

      const result = await api.completion.complete({ prompt, suffix });

      // Only apply if this is still the latest request
      if (requestIdRef.current === currentRequestId && result) {
        setCompletion(result);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [text, cursorPosition, enabled]);

  const accept = useCallback(() => {
    setCompletion(null);
    return completion;
  }, [completion]);

  const dismiss = useCallback(() => {
    setCompletion(null);
  }, []);

  return { completion, accept, dismiss };
}
```

**Step 2: Verify**

Run: `pnpm ts-check`

---

### Task 8: Integrate Ghost Text into `PromptTextarea`

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx`

**Step 1: Add new props**

Add to `PromptTextareaProps`:

```typescript
/** Enable inline ghost text completion */
enableCompletion?: boolean;
```

**Step 2: Add completion hook and cursor tracking**

Inside the component, after the existing state declarations:

```typescript
const [cursorPosition, setCursorPosition] = useState(0);
```

Import and call the hook:

```typescript
import { useInlineCompletion } from '@/hooks/use-inline-completion';
```

Inside the component:

```typescript
const { completion, accept, dismiss } = useInlineCompletion({
  text: value,
  cursorPosition,
  enabled: enableCompletion ?? false,
});
```

**Step 3: Track cursor position**

Add cursor tracking handlers. Update `handleChange`:

```typescript
const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
  onChange(e.target.value);
  setCursorPosition(e.target.selectionStart);
  handleInput();
};
```

Add a `onSelect` handler on the textarea to track cursor moves:

```typescript
const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
  const textarea = e.currentTarget;
  setCursorPosition(textarea.selectionStart);
};
```

Pass `onSelect={handleSelect}` to the textarea element.

**Step 4: Add keyboard handling for completion**

In `handleKeyDown`, add before the existing dropdown navigation check:

```typescript
// Handle completion keyboard shortcuts
if (completion) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const completionText = accept();
    if (completionText) {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);
      onChange(before + completionText + after);
    }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    dismiss();
    return;
  }
  // Any other key dismisses the completion (debounce will re-trigger)
  dismiss();
}
```

**Step 5: Add ghost text overlay**

Add the overlay div after the textarea, inside the container div. The overlay should be positioned absolutely on top of the textarea:

```tsx
{/* Ghost text overlay */}
{completion && (
  <div
    className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm"
    style={{ maxHeight: `${maxHeight}px` }}
  >
    <span className="invisible">{value.slice(0, cursorPosition)}</span>
    <span className="text-neutral-500">{completion}</span>
  </div>
)}
```

Make the container `relative` by ensuring the container div has `relative` in its className (it already does via `className="relative flex flex-1 items-end"`).

**Step 6: Pause completion when slash dropdown is open**

The hook already handles this since `text.startsWith('/')` returns early. But also pass `enabled: (enableCompletion ?? false) && !showDropdown` to the hook to be safe.

**Step 7: Verify**

Run: `pnpm ts-check`

---

### Task 9: Add Autocomplete Tab to Settings Navigation

**Files:**
- Modify: `src/routes/settings.tsx`

**Step 1: Add tab**

This may already be done in Task 5. Verify that the tabs array includes:

```typescript
const tabs = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/mcp-servers', label: 'MCP Servers' },
  { to: '/settings/tokens', label: 'Tokens' },
  { to: '/settings/azure-devops', label: 'Azure DevOps' },
  { to: '/settings/autocomplete', label: 'Autocomplete' },
  { to: '/settings/debug', label: 'Debug' },
] as const;
```

**Step 2: Verify**

Run: `pnpm ts-check`

---

### Task 10: Enable Completion in Consumer Components

**Files:**
- Modify: `src/features/agent/ui-message-input/index.tsx`
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Wire up `enableCompletion` in MessageInput**

In `src/features/agent/ui-message-input/index.tsx`, load the completion setting and pass it to `PromptTextarea`:

```typescript
import { useCompletionSetting } from '@/hooks/use-settings';
```

Inside the component:

```typescript
const { data: completionSetting } = useCompletionSetting();
```

Pass to `PromptTextarea`:

```tsx
<PromptTextarea
  enableCompletion={completionSetting?.enabled ?? false}
  // ... existing props
/>
```

**Step 2: Wire up in NewTaskOverlay**

In `src/features/new-task/ui-new-task-overlay/index.tsx`, do the same for the textarea there. Note: the new task overlay uses a plain `<textarea>`, not `PromptTextarea`. For the initial implementation, only enable completion in `PromptTextarea`-based inputs (the message input). The new task overlay can be migrated to use `PromptTextarea` in a follow-up task.

**Step 3: Verify**

Run: `pnpm ts-check`

---

### Task 11: Final Lint & Type Check

**Step 1: Run lint with fix**

Run: `pnpm lint --fix`

**Step 2: Run type check**

Run: `pnpm ts-check`

**Step 3: Fix any errors**

Address any lint or type errors found.
