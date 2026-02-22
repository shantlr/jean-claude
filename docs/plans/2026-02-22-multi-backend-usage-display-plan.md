# Multi-Backend Usage Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the rate limit usage display to support multiple agent backends (Claude Code, Codex) with compact per-backend icons in the header and per-backend enable/disable settings.

**Architecture:** Provider pattern for backend-specific usage fetching, orchestrated by a refactored `AgentUsageService`. Claude Code uses its existing OAuth API; Codex uses the App Server JSON-RPC over stdio. The renderer polls a single IPC endpoint that returns a `BackendUsageMap`.

**Tech Stack:** TypeScript, Electron IPC, React Query, Zustand settings, Codex CLI App Server (JSON-RPC 2.0 over stdio child process)

**Design doc:** `docs/plans/2026-02-22-multi-backend-usage-display-design.md`

---

### Task 1: Add `BackendUsageMap` type and `usageDisplay` setting

**Files:**
- Modify: `shared/usage-types.ts`
- Modify: `shared/types.ts:382-436`

**Step 1: Add BackendUsageMap to usage types**

In `shared/usage-types.ts`, add at the end of the file:

```ts
import type { AgentBackendType } from './agent-backend-types';

// Per-backend usage results
export type BackendUsageMap = Partial<Record<AgentBackendType, UsageResult>>;
```

**Step 2: Add UsageDisplaySetting type and setting definition**

In `shared/types.ts`, add after the `CompletionSetting` type (around line 367):

```ts
export interface UsageDisplaySetting {
  enabledBackends: AgentBackendType[];
}
```

Add a validator function after `isBackendsSetting` (around line 409):

```ts
function isUsageDisplaySetting(v: unknown): v is UsageDisplaySetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.enabledBackends)) return false;
  if (
    !obj.enabledBackends.every((b: unknown) =>
      VALID_BACKENDS.includes(b as AgentBackendType),
    )
  )
    return false;
  return true;
}
```

Add to `SETTINGS_DEFINITIONS` (after the `completion` entry):

```ts
usageDisplay: {
  defaultValue: {
    enabledBackends: [],
  } as UsageDisplaySetting,
  validate: isUsageDisplaySetting,
},
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add shared/usage-types.ts shared/types.ts
git commit -m "feat: add BackendUsageMap type and usageDisplay setting"
```

---

### Task 2: Create BackendUsageProvider interface and Claude Code provider

**Files:**
- Create: `electron/services/usage-providers/types.ts`
- Create: `electron/services/usage-providers/claude-usage-provider.ts`

**Step 1: Create the provider interface**

Create `electron/services/usage-providers/types.ts`:

```ts
import type { UsageResult } from '@shared/usage-types';

export interface BackendUsageProvider {
  getUsage(): Promise<UsageResult>;
  dispose(): void;
}
```

**Step 2: Extract Claude Code provider from existing service**

Create `electron/services/usage-providers/claude-usage-provider.ts`. This is a direct extraction from `electron/services/agent-usage-service.ts` — the existing `getUsage()`, `getOAuthToken()`, `transformResponse()`, and `formatTimeUntil()` methods move here unchanged:

```ts
import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  ClaudeUsageResponse,
  UsageResult,
  UsageDisplayData,
} from '@shared/usage-types';

import type { BackendUsageProvider } from './types';

const execAsync = promisify(exec);

export class ClaudeUsageProvider implements BackendUsageProvider {
  private cachedToken: string | null = null;
  private tokenCacheTime: number = 0;
  private readonly TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getUsage(): Promise<UsageResult> {
    try {
      const token = await this.getOAuthToken();
      if (!token) {
        return {
          data: null,
          error: {
            type: 'no_token',
            message: 'Claude Code OAuth token not found',
          },
        };
      }

      const response = await fetch(
        'https://api.anthropic.com/api/oauth/usage',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'anthropic-beta': 'oauth-2025-04-20',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.cachedToken = null;
        }
        return {
          data: null,
          error: {
            type: 'api_error',
            message: `API error: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      const apiData = (await response.json()) as ClaudeUsageResponse;
      return {
        data: this.transformResponse(apiData),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: {
          type: 'api_error',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      };
    }
  }

  dispose(): void {
    this.cachedToken = null;
  }

  private async getOAuthToken(): Promise<string | null> {
    if (
      this.cachedToken &&
      Date.now() - this.tokenCacheTime < this.TOKEN_CACHE_TTL
    ) {
      return this.cachedToken;
    }

    try {
      const { stdout } = await execAsync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf-8' },
      );

      const credentials = JSON.parse(stdout.trim());
      const token = credentials?.claudeAiOauth?.accessToken;

      if (token) {
        this.cachedToken = token;
        this.tokenCacheTime = Date.now();
      }

      return token || null;
    } catch {
      return null;
    }
  }

  private transformResponse(apiData: ClaudeUsageResponse): UsageDisplayData {
    const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
    const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

    return {
      fiveHour: apiData.five_hour
        ? {
            utilization: apiData.five_hour.utilization,
            resetsAt: new Date(apiData.five_hour.resets_at),
            timeUntilReset: this.formatTimeUntil(
              new Date(apiData.five_hour.resets_at),
            ),
            windowDurationMs: FIVE_HOUR_MS,
          }
        : null,
      sevenDay: apiData.seven_day
        ? {
            utilization: apiData.seven_day.utilization,
            resetsAt: new Date(apiData.seven_day.resets_at),
            timeUntilReset: this.formatTimeUntil(
              new Date(apiData.seven_day.resets_at),
            ),
            windowDurationMs: SEVEN_DAY_MS,
          }
        : null,
    };
  }

  private formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) return 'now';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/services/usage-providers/
git commit -m "feat: extract Claude Code usage provider from monolithic service"
```

---

### Task 3: Create Codex usage provider (App Server JSON-RPC)

**Files:**
- Create: `electron/services/usage-providers/codex-usage-provider.ts`

**Step 1: Implement the Codex provider**

Create `electron/services/usage-providers/codex-usage-provider.ts`:

```ts
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';

import type { UsageResult, UsageDisplayData } from '@shared/usage-types';

import type { BackendUsageProvider } from './types';

// JSON-RPC types for the Codex App Server protocol
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id?: number;
  params?: Record<string, unknown>;
}

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number; // unix seconds
}

interface RateLimitData {
  limitId: string;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
}

interface RateLimitsResult {
  rateLimits: RateLimitData;
  rateLimitsByLimitId?: Record<string, RateLimitData>;
}

export class CodexUsageProvider implements BackendUsageProvider {
  private process: ChildProcess | null = null;
  private initialized = false;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  private cachedResult: UsageResult | null = null;
  private spawnAttempts = 0;
  private readonly MAX_SPAWN_ATTEMPTS = 3;
  private disposed = false;

  async getUsage(): Promise<UsageResult> {
    try {
      await this.ensureConnected();

      const result = await this.sendRequest<RateLimitsResult>(
        'account/rateLimits/read',
      );

      const data = this.transformRateLimits(result.rateLimits);
      this.cachedResult = { data, error: null };
      return this.cachedResult;
    } catch (err) {
      // Return cached data if available on transient failure
      if (this.cachedResult) {
        return this.cachedResult;
      }
      return {
        data: null,
        error: {
          type: 'api_error',
          message:
            err instanceof Error ? err.message : 'Codex App Server error',
        },
      };
    }
  }

  dispose(): void {
    this.disposed = true;
    this.killProcess();
  }

  private async ensureConnected(): Promise<void> {
    if (this.process && this.initialized) return;

    if (this.spawnAttempts >= this.MAX_SPAWN_ATTEMPTS) {
      throw new Error(
        'Failed to connect to Codex App Server after multiple attempts',
      );
    }

    this.killProcess();
    this.spawnAttempts++;

    this.process = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Parse newline-delimited JSON from stdout
    const rl = createInterface({ input: this.process.stdout! });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        this.handleMessage(msg);
      } catch {
        // Ignore non-JSON lines
      }
    });

    this.process.on('exit', () => {
      this.process = null;
      this.initialized = false;
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('Codex App Server exited unexpectedly'));
      }
      this.pendingRequests.clear();
    });

    this.process.on('error', () => {
      this.process = null;
      this.initialized = false;
    });

    // Handshake: send initialize request
    const initResult = await this.sendRequest('initialize', {
      clientInfo: {
        name: 'jean-claude',
        title: 'Jean-Claude',
        version: '1.0.0',
      },
    });

    if (!initResult) {
      throw new Error('Codex App Server initialization failed');
    }

    // Send initialized notification (no id = notification)
    this.sendNotification('initialized');
    this.initialized = true;
    this.spawnAttempts = 0; // Reset on success
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Response to a request (has id)
    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(
          new Error(
            (msg.error as { message?: string }).message ?? 'JSON-RPC error',
          ),
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Server notification (no id)
    if (msg.method === 'account/rateLimits/updated' && msg.params) {
      const params = msg.params as { rateLimits?: RateLimitData };
      if (params.rateLimits) {
        const data = this.transformRateLimits(params.rateLimits);
        this.cachedResult = { data, error: null };
      }
    }
  }

  private sendRequest<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Codex App Server not connected'));
        return;
      }

      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        id,
        ...(params ? { params } : {}),
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });

      // 10 second timeout per request
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Codex App Server request timed out: ${method}`));
        }
      }, 10_000);

      this.pendingRequests.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timeout);
          (resolve as (v: unknown) => void)(v);
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private sendNotification(method: string): void {
    if (!this.process?.stdin?.writable) return;

    const notification: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private transformRateLimits(
    rateLimits: RateLimitData,
  ): UsageDisplayData {
    return {
      fiveHour: rateLimits.primary
        ? {
            utilization: rateLimits.primary.usedPercent,
            resetsAt: new Date(rateLimits.primary.resetsAt * 1000),
            timeUntilReset: this.formatTimeUntil(
              new Date(rateLimits.primary.resetsAt * 1000),
            ),
            windowDurationMs:
              rateLimits.primary.windowDurationMins * 60 * 1000,
          }
        : null,
      sevenDay: rateLimits.secondary
        ? {
            utilization: rateLimits.secondary.usedPercent,
            resetsAt: new Date(rateLimits.secondary.resetsAt * 1000),
            timeUntilReset: this.formatTimeUntil(
              new Date(rateLimits.secondary.resetsAt * 1000),
            ),
            windowDurationMs:
              rateLimits.secondary.windowDurationMins * 60 * 1000,
          }
        : null,
    };
  }

  private formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) return 'now';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private killProcess(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.process = null;
      this.initialized = false;
    }
  }
}
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/usage-providers/codex-usage-provider.ts
git commit -m "feat: add Codex usage provider via App Server JSON-RPC"
```

---

### Task 4: Refactor AgentUsageService as provider orchestrator

**Files:**
- Modify: `electron/services/agent-usage-service.ts` (full rewrite)

**Step 1: Rewrite the service**

Replace the entire contents of `electron/services/agent-usage-service.ts` with:

```ts
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { BackendUsageMap, UsageResult } from '@shared/usage-types';

import type { BackendUsageProvider } from './usage-providers/types';
import { ClaudeUsageProvider } from './usage-providers/claude-usage-provider';
import { CodexUsageProvider } from './usage-providers/codex-usage-provider';

class AgentUsageService {
  private providers = new Map<AgentBackendType, BackendUsageProvider>();

  async getUsage(backends: AgentBackendType[]): Promise<BackendUsageMap> {
    if (backends.length === 0) return {};

    const results = await Promise.allSettled(
      backends.map(async (backend) => {
        const provider = this.getOrCreateProvider(backend);
        const result = await provider.getUsage();
        return [backend, result] as const;
      }),
    );

    const usageMap: BackendUsageMap = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [backend, usageResult] = result.value;
        usageMap[backend] = usageResult;
      } else {
        // Promise.allSettled won't throw, but capture the error
        // The backend type is lost here, so the entry is simply missing
      }
    }

    return usageMap;
  }

  dispose(): void {
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
  }

  private getOrCreateProvider(
    backend: AgentBackendType,
  ): BackendUsageProvider {
    let provider = this.providers.get(backend);
    if (!provider) {
      provider = this.createProvider(backend);
      this.providers.set(backend, provider);
    }
    return provider;
  }

  private createProvider(backend: AgentBackendType): BackendUsageProvider {
    switch (backend) {
      case 'claude-code':
        return new ClaudeUsageProvider();
      case 'opencode':
        return new CodexUsageProvider();
      default: {
        const _exhaustive: never = backend;
        throw new Error(`Unknown backend: ${_exhaustive}`);
      }
    }
  }
}

export const agentUsageService = new AgentUsageService();
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/agent-usage-service.ts
git commit -m "feat: refactor AgentUsageService to provider orchestrator pattern"
```

---

### Task 5: Update IPC, preload bridge, and API types

**Files:**
- Modify: `electron/ipc/handlers.ts:1376`
- Modify: `electron/preload.ts:314-316`
- Modify: `src/lib/api.ts:561-563`

**Step 1: Update IPC handler**

In `electron/ipc/handlers.ts`, replace line 1376:

```ts
// Old:
ipcMain.handle('agent:usage:get', () => agentUsageService.getUsage());

// New:
ipcMain.handle(
  'agent:usage:getAll',
  (_, backends: string[]) =>
    agentUsageService.getUsage(backends as AgentBackendType[]),
);
```

**Step 2: Update preload bridge**

In `electron/preload.ts`, replace lines 314-316:

```ts
// Old:
usage: {
  get: () => ipcRenderer.invoke('agent:usage:get'),
},

// New:
usage: {
  getAll: (backends: string[]) =>
    ipcRenderer.invoke('agent:usage:getAll', backends),
},
```

**Step 3: Update API types**

In `src/lib/api.ts`, replace lines 561-563. First add the import for `BackendUsageMap` at the top of the file (alongside the existing `UsageResult` import):

```ts
import type { BackendUsageMap } from '@shared/usage-types';
```

Then update the usage section:

```ts
// Old:
usage: {
  get: () => Promise<UsageResult>;
};

// New:
usage: {
  getAll: (backends: string[]) => Promise<BackendUsageMap>;
};
```

Remove the now-unused `UsageResult` import from `src/lib/api.ts` if it's no longer referenced elsewhere in that file.

**Step 4: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: update IPC to support multi-backend usage via getAll"
```

---

### Task 6: Add usage display settings hooks

**Files:**
- Modify: `src/hooks/use-settings.ts`
- Modify: `src/hooks/use-usage.ts` (full rewrite)

**Step 1: Add convenience hooks for usageDisplay setting**

In `src/hooks/use-settings.ts`, add at the end of the file:

```ts
import type { UsageDisplaySetting } from '@shared/types';

// Convenience hooks for usage display setting
export function useUsageDisplaySetting() {
  return useSetting('usageDisplay');
}

export function useUpdateUsageDisplaySetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: UsageDisplaySetting) =>
      api.settings.set('usageDisplay', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'usageDisplay'],
      });
    },
  });
}
```

**Step 2: Rewrite the usage hook**

Replace the entire contents of `src/hooks/use-usage.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { useUsageDisplaySetting } from './use-settings';

export function useBackendUsage() {
  const { data: usageSettings } = useUsageDisplaySetting();
  const enabledBackends = usageSettings?.enabledBackends ?? [];

  return useQuery({
    queryKey: ['backend-usage', enabledBackends],
    queryFn: () => api.usage.getAll(enabledBackends),
    enabled: enabledBackends.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: May fail due to old `useClaudeUsage` references in `usage-display.tsx` — that's OK, we fix it in the next task.

**Step 4: Commit**

```bash
git add src/hooks/use-settings.ts src/hooks/use-usage.ts
git commit -m "feat: add usage display settings hooks and multi-backend usage hook"
```

---

### Task 7: Redesign header UsageDisplay component

**Files:**
- Modify: `src/layout/ui-header/usage-display.tsx` (full rewrite)

**Step 1: Rewrite the component**

Replace the entire contents of `src/layout/ui-header/usage-display.tsx`:

```tsx
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { useBackendUsage } from '@/hooks/use-usage';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { UsageDisplayData, UsageLevel, UsageResult } from '@shared/usage-types';

const BACKEND_LABELS: Record<AgentBackendType, string> = {
  'claude-code': 'CC',
  opencode: 'CX',
};

const BACKEND_FULL_NAMES: Record<AgentBackendType, string> = {
  'claude-code': 'Claude Code',
  opencode: 'Codex',
};

function getUsageRatio({
  utilization,
  resetsAt,
  windowDurationMs,
}: {
  utilization: number;
  resetsAt: Date;
  windowDurationMs: number;
}): number {
  const now = new Date();
  const timeRemainingMs = Math.max(0, resetsAt.getTime() - now.getTime());
  const timeElapsedMs = windowDurationMs - timeRemainingMs;
  const timeElapsedRatio = Math.min(
    Math.max(timeElapsedMs / windowDurationMs, 0),
    1,
  );

  const actualUsageRatio = utilization / 100;

  if (timeElapsedRatio === 0) {
    return actualUsageRatio === 0 ? 1 : Number.POSITIVE_INFINITY;
  }

  return actualUsageRatio / timeElapsedRatio;
}

function getUsageLevel(usageRatio: number): UsageLevel {
  if (!Number.isFinite(usageRatio)) return 'critical';
  if (usageRatio >= 1.5) return 'critical';
  if (usageRatio >= 1.3) return 'high';
  if (usageRatio >= 1.0) return 'medium';
  if (usageRatio >= 0.8) return 'low';
  return 'excellent';
}

const LEVEL_DOT_COLORS: Record<UsageLevel, string> = {
  excellent: 'bg-blue-400',
  low: 'bg-green-400',
  medium: 'bg-yellow-400',
  high: 'bg-orange-400',
  critical: 'bg-red-400',
};

const LEVEL_TEXT_COLORS: Record<UsageLevel, string> = {
  excellent: 'text-blue-400',
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

function buildTooltip({
  backend,
  data,
}: {
  backend: AgentBackendType;
  data: UsageDisplayData;
}): string {
  const name = BACKEND_FULL_NAMES[backend];
  const lines: string[] = [name];

  if (data.fiveHour) {
    const ratio = getUsageRatio({
      utilization: data.fiveHour.utilization,
      resetsAt: data.fiveHour.resetsAt,
      windowDurationMs: data.fiveHour.windowDurationMs,
    });
    const formattedRatio = Number.isFinite(ratio) ? ratio.toFixed(1) : '∞';
    lines.push(
      `5h: ${data.fiveHour.utilization.toFixed(0)}% (${formattedRatio}) · resets ${data.fiveHour.timeUntilReset}`,
    );
  }

  if (data.sevenDay) {
    lines.push(
      `7d: ${data.sevenDay.utilization.toFixed(0)}% · resets ${data.sevenDay.timeUntilReset}`,
    );
  }

  return lines.join('\n');
}

function BackendUsageChip({
  backend,
  result,
}: {
  backend: AgentBackendType;
  result: UsageResult;
}) {
  const label = BACKEND_LABELS[backend];

  if (!result.data?.fiveHour) {
    if (result.error?.type === 'no_token') return null;

    return (
      <div
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-neutral-500"
        title={result.error?.message ?? 'No usage data'}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
        <span className="text-xs">{label}</span>
      </div>
    );
  }

  const { fiveHour } = result.data;
  const usageRatio = getUsageRatio({
    utilization: fiveHour.utilization,
    resetsAt: fiveHour.resetsAt,
    windowDurationMs: fiveHour.windowDurationMs,
  });
  const level = getUsageLevel(usageRatio);
  const percentage = Math.min(fiveHour.utilization, 100);
  const tooltip = buildTooltip({ backend, data: result.data });

  return (
    <div
      className="flex items-center gap-1.5 rounded px-1.5 py-0.5"
      title={tooltip}
    >
      <div
        className={clsx('h-1.5 w-1.5 rounded-full', LEVEL_DOT_COLORS[level])}
      />
      <span className={clsx('text-xs font-medium', LEVEL_TEXT_COLORS[level])}>
        {label} {percentage.toFixed(0)}%
      </span>
    </div>
  );
}

export function UsageDisplay() {
  const { data: usageMap, isLoading } = useBackendUsage();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  if (!usageMap || Object.keys(usageMap).length === 0) {
    return null;
  }

  const entries = Object.entries(usageMap) as [AgentBackendType, UsageResult][];

  return (
    <div className="flex items-center gap-1">
      {entries.map(([backend, result]) => (
        <BackendUsageChip key={backend} backend={backend} result={result} />
      ))}
    </div>
  );
}
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 4: Commit**

```bash
git add src/layout/ui-header/usage-display.tsx
git commit -m "feat: redesign usage display as compact per-backend chips with tooltips"
```

---

### Task 8: Add usage display toggles to General settings

**Files:**
- Modify: `src/features/settings/ui-general-settings/index.tsx`

**Step 1: Add usage toggles to the BackendsSettings component**

In `src/features/settings/ui-general-settings/index.tsx`, import the new hooks at the top alongside existing imports:

```ts
import {
  useBackendsSetting,
  useEditorSetting,
  useUpdateBackendsSetting,
  useUpdateEditorSetting,
  useAvailableEditors,
  useUsageDisplaySetting,
  useUpdateUsageDisplaySetting,
} from '@/hooks/use-settings';
```

Then modify the `BackendsSettings` component to add usage toggles. Add inside the component, after the existing hooks:

```ts
const { data: usageDisplaySetting } = useUsageDisplaySetting();
const updateUsageDisplay = useUpdateUsageDisplaySetting();
const usageEnabledBackends = usageDisplaySetting?.enabledBackends ?? [];

const isUsageEnabled = (id: AgentBackendType) =>
  usageEnabledBackends.includes(id);

const handleUsageToggle = (id: AgentBackendType) => {
  let next: AgentBackendType[];
  if (isUsageEnabled(id)) {
    next = usageEnabledBackends.filter((b) => b !== id);
  } else {
    next = [...usageEnabledBackends, id];
  }
  updateUsageDisplay.mutate({ enabledBackends: next });
};
```

Then in the existing `handleToggle` function, add logic to also remove a backend from usage display when disabling it. After the line `next = enabledBackends.filter((b) => b !== id);`, add:

```ts
// Also remove from usage display if it was enabled there
if (isUsageEnabled(id)) {
  updateUsageDisplay.mutate({
    enabledBackends: usageEnabledBackends.filter((b) => b !== id),
  });
}
```

In the JSX, add a "Show usage" toggle button inside each backend row, next to the "Set as default" button. Add it after the existing default button, still inside the `{enabled && (...)}` block:

```tsx
{enabled && (
  <div className="flex items-center gap-2">
    <button
      onClick={() => handleUsageToggle(backend.value)}
      className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        isUsageEnabled(backend.value)
          ? 'bg-green-500/20 text-green-400'
          : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
      }`}
    >
      {isUsageEnabled(backend.value) ? 'Usage: on' : 'Usage: off'}
    </button>

    <button
      onClick={() => handleSetDefault(backend.value)}
      className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        dflt
          ? 'bg-blue-500/20 text-blue-400'
          : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
      }`}
    >
      <Star className={`h-3 w-3 ${dflt ? 'fill-blue-400' : ''}`} />
      {dflt ? 'Default' : 'Set as default'}
    </button>
  </div>
)}
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/settings/ui-general-settings/index.tsx
git commit -m "feat: add per-backend usage display toggles in general settings"
```

---

### Task 9: Final verification and cleanup

**Files:**
- Verify all modified files compile and lint cleanly

**Step 1: Run full type check**

Run: `pnpm ts-check`
Expected: PASS with zero errors

**Step 2: Run full lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 3: Verify no stale references to old hook**

Search for any remaining references to `useClaudeUsage` across the codebase. If found, update them to `useBackendUsage`.

Run: `grep -r "useClaudeUsage\|agent:usage:get[^A]" src/ electron/ --include="*.ts" --include="*.tsx"`
Expected: No matches

**Step 4: Commit any final cleanup**

```bash
git add -A
git commit -m "chore: cleanup stale references from usage service refactor"
```
