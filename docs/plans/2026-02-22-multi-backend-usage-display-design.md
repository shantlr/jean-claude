# Multi-Backend Usage Display

Extend the rate limit usage display to support multiple agent backends (Claude Code, Codex) with per-backend icons in the header and independent enable/disable settings.

## Current State

- `AgentUsageService` fetches Claude Code OAuth usage from `https://api.anthropic.com/api/oauth/usage`
- OAuth token retrieved from macOS Keychain (`Claude Code-credentials`)
- Single `UsageDisplay` component shows a progress bar + percentage for the 5-hour window only
- 7-day data is fetched but never displayed
- No user setting to control usage display visibility
- Tightly coupled to Claude Code — no abstraction for other backends

## Goals

- Abstract the usage service to support multiple backend types via a provider pattern
- Add Codex rate limit retrieval via the Codex App Server JSON-RPC protocol
- Replace the wide progress bar in the header with compact per-backend icon chips
- Add per-backend usage display toggles in General settings
- Default to no backends enabled (user opts in)

## Types & Data Model

### shared/usage-types.ts

Existing types remain unchanged:

```ts
interface UsageDisplayData {
  fiveHour: { utilization: number; resetsAt: Date; timeUntilReset: string; windowDurationMs: number } | null;
  sevenDay: { utilization: number; resetsAt: Date; timeUntilReset: string; windowDurationMs: number } | null;
}

interface UsageResult {
  data: UsageDisplayData | null;
  error: UsageError | null;
}
```

New additions:

```ts
// Per-backend usage results
type BackendUsageMap = Partial<Record<AgentBackendType, UsageResult>>;
```

### shared/types.ts — AppSettings

New setting key:

```ts
usageDisplay: {
  enabledBackends: AgentBackendType[];
}
```

Default value: `{ enabledBackends: [] }` — nothing shown until user enables.

## Backend Usage Providers (Main Process)

### Provider Interface

`electron/services/usage-providers/types.ts`:

```ts
interface BackendUsageProvider {
  getUsage(): Promise<UsageResult>;
  dispose(): void;
}
```

### Claude Code Provider

`electron/services/usage-providers/claude-usage-provider.ts`

Extracted from current `AgentUsageService`:
- Retrieves OAuth token from macOS Keychain
- Calls `https://api.anthropic.com/api/oauth/usage`
- Maps `five_hour.utilization` (0-1) → multiply by 100 for percentage
- Maps `five_hour.resets_at` (ISO string) → `Date`
- Same for `seven_day`

### Codex Provider

`electron/services/usage-providers/codex-usage-provider.ts`

Uses the Codex App Server JSON-RPC protocol:

**Connection lifecycle:**
1. Spawn `codex app-server` as a child process (stdio transport, newline-delimited JSON)
2. Send `initialize` handshake with client metadata
3. Send `initialized` notification
4. Ready for requests

**Fetching usage:**
- Send `{ "method": "account/rateLimits/read", "id": N }`
- Response shape:
  ```json
  {
    "id": N,
    "result": {
      "rateLimits": {
        "limitId": "codex",
        "primary": { "usedPercent": 25, "windowDurationMins": 299, "resetsAt": 1730947200 },
        "secondary": { "usedPercent": 10, "windowDurationMins": 10079, "resetsAt": 1731500000 }
      }
    }
  }
  ```

**Mapping to UsageDisplayData:**
- `primary.usedPercent` → `fiveHour.utilization` (already 0-100 scale)
- `primary.resetsAt` (unix seconds) → `fiveHour.resetsAt` (new Date(seconds * 1000))
- `primary.windowDurationMins` → `fiveHour.windowDurationMs` (mins * 60 * 1000)
- Same for `secondary` → `sevenDay`

**Push notifications:**
- Listen for `account/rateLimits/updated` notifications on stdin
- Cache the latest data so `getUsage()` returns instantly between polls

**Lifecycle:**
- Lazy: process only spawned on first `getUsage()` call
- Respawn on unexpected exit (with backoff)
- `dispose()`: kills the child process on app quit

### Orchestrator

`electron/services/agent-usage-service.ts` — refactored:

```ts
class AgentUsageService {
  private providers = new Map<AgentBackendType, BackendUsageProvider>();

  async getUsage(backends: AgentBackendType[]): Promise<BackendUsageMap> {
    const results = await Promise.allSettled(
      backends.map(async (backend) => {
        const provider = this.getOrCreateProvider(backend);
        return [backend, await provider.getUsage()] as const;
      })
    );
    // Build BackendUsageMap from settled results
  }

  private getOrCreateProvider(backend: AgentBackendType): BackendUsageProvider { ... }

  dispose() {
    for (const provider of this.providers.values()) provider.dispose();
  }
}
```

## IPC Changes

| Old | New |
|-----|-----|
| `agent:usage:get` → `agentUsageService.getUsage()` | `agent:usage:getAll` → `agentUsageService.getUsage(backends)` |

The renderer passes the list of enabled backends (from settings) as a parameter.

## Renderer

### Hook: `src/hooks/use-usage.ts`

```ts
export function useBackendUsage() {
  const { data: usageSettings } = useUsageDisplaySetting();
  const enabledBackends = usageSettings?.enabledBackends ?? [];

  return useQuery({
    queryKey: ['backend-usage', enabledBackends],
    queryFn: () => api.usage.getAll(enabledBackends),
    enabled: enabledBackends.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
```

### Header: `src/layout/ui-header/usage-display.tsx`

Redesigned from progress bar to compact chips:

```
[🟠 CC 42%]  [🟢 CX 18%]
```

Each enabled backend renders:
- Color-coded dot/icon based on usage level (excellent→critical, same thresholds)
- Short label: "CC" for claude-code, "CX" for codex/opencode
- Percentage (5-hour utilization)
- Hover tooltip: full details (percentage, usage ratio, reset time)

States:
- Loading: small spinner per backend
- Error: grayed icon with error tooltip
- No backends enabled: render nothing

### Settings: `src/features/settings/ui-general-settings/index.tsx`

Under the existing **Agent Backends** section, add per-backend "Show usage" toggle:

```
Agent Backends
├── ☑ Claude Code          [★ Default]  [☐ Show usage in header]
├── ☑ OpenCode                          [☐ Show usage in header]
```

Only enabled backends can have their usage toggled on. Disabling a backend auto-removes it from usage display.

## Migration

No database migration needed — the `usageDisplay` setting uses the existing key-value `settings` table with a new key.

## Summary of File Changes

| File | Change |
|------|--------|
| `shared/usage-types.ts` | Add `BackendUsageMap` type |
| `shared/types.ts` | Add `usageDisplay` to `AppSettings` with default `[]` |
| `electron/services/usage-providers/types.ts` | New: `BackendUsageProvider` interface |
| `electron/services/usage-providers/claude-usage-provider.ts` | New: extracted from current service |
| `electron/services/usage-providers/codex-usage-provider.ts` | New: App Server JSON-RPC client |
| `electron/services/agent-usage-service.ts` | Refactored: provider registry + `getUsage(backends)` |
| `electron/ipc/handlers.ts` | Replace `agent:usage:get` with `agent:usage:getAll` |
| `electron/preload.ts` | Update usage bridge method |
| `src/lib/api.ts` | Update usage API type |
| `src/hooks/use-usage.ts` | Rewrite: `useBackendUsage()` with settings awareness |
| `src/hooks/use-settings.ts` | Add `useUsageDisplaySetting` / `useUpdateUsageDisplaySetting` |
| `src/layout/ui-header/usage-display.tsx` | Redesign: compact chips with tooltip |
| `src/features/settings/ui-general-settings/index.tsx` | Add usage toggles to backends section |
