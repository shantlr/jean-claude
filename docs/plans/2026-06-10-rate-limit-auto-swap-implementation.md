# Rate Limit Auto-Swap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-route new tasks and AI generation to fallback backends when utilization exceeds user-configured thresholds.

**Architecture:** New `RateLimitSwapService` reads utilization from existing `AgentUsageService`, resolves backend swaps based on `rateLimitSwap` setting rules. Integrates at 2 call sites: `agent-service.ts` (tasks) and `ai-generation-service.ts` (AI gen). Settings UI added to existing backend config panel.

**Tech Stack:** TypeScript, Zustand, React Query, Kysely (for `swappedFrom` column)

---

### Task 1: Types — `RateLimitSwapSetting` + Setting Registration

**Files:**
- Modify: `shared/types.ts:639-663` (near other backend settings)
- Modify: `shared/types.ts:1076-1164` (SETTINGS_DEFINITIONS)

**Step 1: Add types to `shared/types.ts`**

After `BackendDefaultModelsSetting` (~line 663), add:

```ts
export interface RateLimitSwapRule {
  backend: AgentBackendType;
  threshold: number; // 0-1
  swapTo: {
    backend: AgentBackendType;
    model?: string;
  };
}

export interface RateLimitSwapSetting {
  enabled: boolean;
  rules: RateLimitSwapRule[];
}
```

**Step 2: Add validator function**

Near existing validators (search for `isBackendsSetting`), add:

```ts
function isRateLimitSwapSetting(value: unknown): value is RateLimitSwapSetting {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === 'boolean' && Array.isArray(v.rules);
}
```

**Step 3: Register in `SETTINGS_DEFINITIONS`**

After `backendDefaultModels` entry (~line 1121), add:

```ts
rateLimitSwap: {
  defaultValue: {
    enabled: false,
    rules: [],
  } as RateLimitSwapSetting,
  validate: isRateLimitSwapSetting,
},
```

**Step 4: Add `AppSettings` key**

Find the `AppSettings` interface and add:
```ts
rateLimitSwap: RateLimitSwapSetting;
```

**Step 5: Run type check**

Run: `pnpm ts-check`
Expected: PASS (no consumers yet)

**Step 6: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add RateLimitSwapSetting type and setting registration"
```

---

### Task 2: Service — `RateLimitSwapService`

**Files:**
- Create: `electron/services/rate-limit-swap-service.ts`
- Test: `electron/services/rate-limit-swap-service.test.ts`

**Step 1: Write failing tests**

Create `electron/services/rate-limit-swap-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitSwapService } from './rate-limit-swap-service';

// Mock dependencies
vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: vi.fn(),
  },
}));

// We'll need to mock AgentUsageService — it's a singleton instance
// Mock the module that exports the service instance
vi.mock('./agent-usage-service', () => ({
  agentUsageService: {
    getUsage: vi.fn(),
  },
}));

import { SettingsRepository } from '../database/repositories/settings';
import { agentUsageService } from './agent-usage-service';

describe('RateLimitSwapService', () => {
  let service: RateLimitSwapService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RateLimitSwapService();
  });

  it('returns original backend when disabled', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: false,
      rules: [{ backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode' } }],
    });

    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('returns original backend when no matching rule', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [{ backend: 'opencode', threshold: 0.8, swapTo: { backend: 'claude-code' } }],
    });

    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('swaps when utilization exceeds threshold', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [{ backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode', model: 'sonnet' } }],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.85, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
    });

    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'opencode', model: 'sonnet', swapped: true });
  });

  it('does not swap when utilization below threshold', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [{ backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode' } }],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.5, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
    });

    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('does not swap when target also over its threshold', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [
        { backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode' } },
        { backend: 'opencode', threshold: 0.9, swapTo: { backend: 'claude-code' } },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.85, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
      // opencode usage not available via claude-code provider — need to handle mapping
    });

    // Target has no usage data → treated as 0% → swap allowed
    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'opencode', swapped: true });
  });

  it('does not swap when usage data unavailable (optimistic)', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [{ backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode' } }],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({});

    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('applies hysteresis — does not swap back until below threshold - 10%', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      rules: [{ backend: 'claude-code', threshold: 0.8, swapTo: { backend: 'opencode' } }],
    });

    // First call: 85% → swap
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.85, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
    });
    const result1 = await service.resolveBackend('claude-code');
    expect(result1.swapped).toBe(true);

    // Second call: 75% → still swapped (hysteresis, need < 70%)
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.75, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
    });
    const result2 = await service.resolveBackend('claude-code');
    expect(result2.swapped).toBe(true);

    // Third call: 65% → swap back (below 70%)
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': {
        data: { limits: [{ key: 'primary', label: 'Primary', isPrimary: true, range: { utilization: 0.65, resetsAt: new Date(), timeUntilReset: '10m', windowDurationMs: 300000 } }] },
        error: null,
      },
    });
    const result3 = await service.resolveBackend('claude-code');
    expect(result3.swapped).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- electron/services/rate-limit-swap-service.test.ts`
Expected: FAIL — module not found

**Step 3: Implement service**

Create `electron/services/rate-limit-swap-service.ts`:

```ts
import { AgentBackendType } from '../../shared/agent-backend-types';
import { RateLimitSwapSetting } from '../../shared/types';
import { UsageProviderType } from '../../shared/usage-types';
import { SettingsRepository } from '../database/repositories/settings';
import { agentUsageService } from './agent-usage-service';

const HYSTERESIS_MARGIN = 0.1;

export interface SwapResult {
  backend: AgentBackendType;
  model?: string;
  swapped: boolean;
}

// Map agent backends to usage provider types
const BACKEND_TO_USAGE_PROVIDER: Partial<Record<AgentBackendType, UsageProviderType>> = {
  'claude-code': 'claude-code',
  // opencode doesn't have a direct usage provider — expand as needed
};

export class RateLimitSwapService {
  // Track which backends are currently in "swapped" state for hysteresis
  private swappedBackends = new Set<AgentBackendType>();

  async resolveBackend(requestedBackend: AgentBackendType): Promise<SwapResult> {
    const settings = await SettingsRepository.get<RateLimitSwapSetting>('rateLimitSwap');

    if (!settings?.enabled || !settings.rules?.length) {
      return { backend: requestedBackend, swapped: false };
    }

    const rule = settings.rules.find((r) => r.backend === requestedBackend);
    if (!rule) {
      return { backend: requestedBackend, swapped: false };
    }

    const utilization = await this.getUtilization(requestedBackend);

    // No data → optimistic, don't swap
    if (utilization === null) {
      return { backend: requestedBackend, swapped: false };
    }

    const isCurrentlySwapped = this.swappedBackends.has(requestedBackend);

    if (isCurrentlySwapped) {
      // Hysteresis: only swap back when below threshold - margin
      if (utilization < rule.threshold - HYSTERESIS_MARGIN) {
        this.swappedBackends.delete(requestedBackend);
        return { backend: requestedBackend, swapped: false };
      }
      // Still in swapped state
      return {
        backend: rule.swapTo.backend,
        model: rule.swapTo.model,
        swapped: true,
      };
    }

    // Check if should swap
    if (utilization >= rule.threshold) {
      // Check target isn't also overloaded
      const targetRule = settings.rules.find((r) => r.backend === rule.swapTo.backend);
      if (targetRule) {
        const targetUtilization = await this.getUtilization(rule.swapTo.backend);
        if (targetUtilization !== null && targetUtilization >= targetRule.threshold) {
          // Both overloaded — don't swap
          return { backend: requestedBackend, swapped: false };
        }
      }

      this.swappedBackends.add(requestedBackend);
      return {
        backend: rule.swapTo.backend,
        model: rule.swapTo.model,
        swapped: true,
      };
    }

    return { backend: requestedBackend, swapped: false };
  }

  private async getUtilization(backend: AgentBackendType): Promise<number | null> {
    const providerType = BACKEND_TO_USAGE_PROVIDER[backend];
    if (!providerType) return null;

    const usage = await agentUsageService.getUsage([providerType]);
    const result = usage[providerType];

    if (!result?.data?.limits?.length) return null;

    // Use primary limit's utilization, or first limit
    const primary = result.data.limits.find((l) => l.isPrimary) ?? result.data.limits[0];
    return primary.range.utilization;
  }

  /** Reset hysteresis state (e.g., on settings change) */
  reset(): void {
    this.swappedBackends.clear();
  }
}

export const rateLimitSwapService = new RateLimitSwapService();
```

**Step 4: Run tests**

Run: `pnpm test -- electron/services/rate-limit-swap-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/services/rate-limit-swap-service.ts electron/services/rate-limit-swap-service.test.ts
git commit -m "feat(service): add RateLimitSwapService with hysteresis"
```

---

### Task 3: Integrate — Agent Service (Task Backend Resolution)

**Files:**
- Modify: `electron/services/agent-service.ts:497-502`

**Step 1: Add swap resolution to `createSession()`**

At `agent-service.ts:497`, replace the backend resolution:

Before:
```ts
const backendType: AgentBackendType = (step.agentBackend ??
  'claude-code') as AgentBackendType;
```

After:
```ts
import { rateLimitSwapService } from './rate-limit-swap-service';

// Resolve backend — only auto-swap if step doesn't have explicit override
const requestedBackend: AgentBackendType = (step.agentBackend ??
  'claude-code') as AgentBackendType;
const isExplicitBackend = step.agentBackend != null;

let backendType = requestedBackend;
let swapModel: string | undefined;
if (!isExplicitBackend) {
  const swapResult = await rateLimitSwapService.resolveBackend(requestedBackend);
  backendType = swapResult.backend;
  swapModel = swapResult.model;
  if (swapResult.swapped) {
    console.log(
      `[rate-limit-swap] Task ${step.taskId}: swapped ${requestedBackend} → ${backendType}`,
    );
  }
}
```

Note: `swapModel` will be used in Task 5 when we thread model override through. For now it's available but not yet applied to the backend config.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat(agent): integrate rate-limit swap in createSession"
```

---

### Task 4: Integrate — AI Generation Service

**Files:**
- Modify: `electron/services/ai-generation-service.ts:18-40`

**Step 1: Add swap resolution to `generateText()`**

At the top of `generateText()` function body (before the switch statement), add:

```ts
import { rateLimitSwapService } from './rate-limit-swap-service';

// Inside generateText, before switch:
const swapResult = await rateLimitSwapService.resolveBackend(backend);
const resolvedBackend = swapResult.backend;
const resolvedModel = swapResult.model ?? model;
if (swapResult.swapped) {
  console.log(
    `[rate-limit-swap] AI gen${skillName ? ` (${skillName})` : ''}: swapped ${backend} → ${resolvedBackend} (model: ${resolvedModel})`,
  );
}
```

Then update the switch to use `resolvedBackend` instead of `backend`, and `resolvedModel` instead of `model`.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/ai-generation-service.ts
git commit -m "feat(ai-gen): integrate rate-limit swap in generateText"
```

---

### Task 5: Settings Hooks — Renderer Side

**Files:**
- Modify: `src/hooks/use-settings.ts`

**Step 1: Add convenience hooks**

After `useBackendDefaultModelsSetting()` (~line 173), add:

```ts
export function useRateLimitSwapSetting() {
  return useSetting('rateLimitSwap');
}

export function useUpdateRateLimitSwapSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: RateLimitSwapSetting) =>
      api.settings.set('rateLimitSwap', value),
    onMutate: async (value) => {
      const queryKey = ['settings', 'rateLimitSwap'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RateLimitSwapSetting>(queryKey);
      queryClient.setQueryData(queryKey, value);
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings', 'rateLimitSwap'], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'rateLimitSwap'] });
    },
  });
}
```

Add import for `RateLimitSwapSetting` from `shared/types`.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/use-settings.ts
git commit -m "feat(hooks): add useRateLimitSwapSetting hooks"
```

---

### Task 6: Settings UI — Rate Limit Swap Config Panel

**Files:**
- Create: `src/features/settings/ui-rate-limit-swap-settings/index.tsx`
- Modify: `src/features/settings/ui-backend-config-settings/index.tsx` (import and render)

**Step 1: Create the settings component**

Create `src/features/settings/ui-rate-limit-swap-settings/index.tsx`:

```tsx
import { useCallback, useMemo } from 'react';
import {
  useRateLimitSwapSetting,
  useUpdateRateLimitSwapSetting,
  useBackendsSetting,
} from '@/hooks/use-settings';
import type { AgentBackendType } from '../../../../shared/agent-backend-types';
import type { RateLimitSwapRule } from '../../../../shared/types';

export function RateLimitSwapSettings() {
  const { data: settings } = useRateLimitSwapSetting();
  const { data: backendSettings } = useBackendsSetting();
  const updateSettings = useUpdateRateLimitSwapSetting();

  const enabledBackends = useMemo(
    () => backendSettings?.enabledBackends ?? [],
    [backendSettings],
  );

  const enabled = settings?.enabled ?? false;
  const rules = settings?.rules ?? [];

  const toggleEnabled = useCallback(() => {
    if (!settings) return;
    updateSettings.mutate({ ...settings, enabled: !enabled });
  }, [settings, enabled, updateSettings]);

  const updateRule = useCallback(
    (backend: AgentBackendType, updates: Partial<RateLimitSwapRule>) => {
      if (!settings) return;
      const existingIdx = rules.findIndex((r) => r.backend === backend);
      const newRules = [...rules];
      if (existingIdx >= 0) {
        newRules[existingIdx] = { ...newRules[existingIdx], ...updates };
      } else {
        newRules.push({
          backend,
          threshold: 0.8,
          swapTo: { backend: enabledBackends.find((b) => b !== backend) ?? 'claude-code' },
          ...updates,
        });
      }
      updateSettings.mutate({ ...settings, rules: newRules });
    },
    [settings, rules, enabledBackends, updateSettings],
  );

  const removeRule = useCallback(
    (backend: AgentBackendType) => {
      if (!settings) return;
      updateSettings.mutate({
        ...settings,
        rules: rules.filter((r) => r.backend !== backend),
      });
    },
    [settings, rules, updateSettings],
  );

  if (enabledBackends.length < 2) return null; // Need 2+ backends for swap

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Auto-swap on rate limit</div>
          <div className="text-xs text-text-secondary">
            Route new tasks to fallback backend when utilization exceeds threshold
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggleEnabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled &&
        enabledBackends.map((backend) => {
          const rule = rules.find((r) => r.backend === backend);
          const otherBackends = enabledBackends.filter((b) => b !== backend);

          return (
            <div key={backend} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{backend}</span>
                {rule ? (
                  <button
                    onClick={() => removeRule(backend)}
                    className="text-xs text-text-tertiary hover:text-text-secondary"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      updateRule(backend, {
                        backend,
                        threshold: 0.8,
                        swapTo: { backend: otherBackends[0] },
                      })
                    }
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Add rule
                  </button>
                )}
              </div>

              {rule && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-text-secondary">Threshold</span>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      value={Math.round(rule.threshold * 100)}
                      onChange={(e) =>
                        updateRule(backend, { threshold: Number(e.target.value) / 100 })
                      }
                      className="flex-1"
                    />
                    <span className="w-10 text-right">{Math.round(rule.threshold * 100)}%</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-text-secondary">Swap to</span>
                    <select
                      value={rule.swapTo.backend}
                      onChange={(e) =>
                        updateRule(backend, {
                          swapTo: { ...rule.swapTo, backend: e.target.value as AgentBackendType },
                        })
                      }
                      className="flex-1 rounded border border-border bg-background px-2 py-1"
                    >
                      {otherBackends.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-text-secondary">Model</span>
                    <input
                      type="text"
                      value={rule.swapTo.model ?? ''}
                      placeholder="default"
                      onChange={(e) =>
                        updateRule(backend, {
                          swapTo: { ...rule.swapTo, model: e.target.value || undefined },
                        })
                      }
                      className="flex-1 rounded border border-border bg-background px-2 py-1"
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
```

**Step 2: Import in backend config settings**

In `src/features/settings/ui-backend-config-settings/index.tsx`, import and render `<RateLimitSwapSettings />` at the bottom of the settings panel (after backend list, before closing div).

```tsx
import { RateLimitSwapSettings } from '../ui-rate-limit-swap-settings';

// Render near bottom of BackendConfigSettings component:
<RateLimitSwapSettings />
```

**Step 3: Run type check and lint**

Run: `pnpm ts-check && pnpm lint --fix`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/settings/ui-rate-limit-swap-settings/index.tsx src/features/settings/ui-backend-config-settings/index.tsx
git commit -m "feat(settings): add rate-limit auto-swap config UI"
```

---

### Task 7: Usage Display — Swap Active Badge

**Files:**
- Modify: `src/layout/ui-header/usage-display.tsx`

**Step 1: Add IPC for swap status**

First, expose swap state from main process. Add to `electron/ipc/handlers.ts`:

```ts
// In the handlers registration:
ipcMain.handle('rate-limit-swap:status', async () => {
  const { rateLimitSwapService } = await import('../services/rate-limit-swap-service');
  const settings = await SettingsRepository.get('rateLimitSwap');
  if (!settings?.enabled) return { active: false, swaps: [] };

  // Return which backends are currently swapped
  const swaps: Array<{ from: string; to: string }> = [];
  for (const rule of settings.rules ?? []) {
    const result = await rateLimitSwapService.resolveBackend(rule.backend);
    if (result.swapped) {
      swaps.push({ from: rule.backend, to: result.backend });
    }
  }
  return { active: swaps.length > 0, swaps };
});
```

Add to preload bridge and api types accordingly.

**Step 2: Add swap badge to usage display**

In `usage-display.tsx`, fetch swap status alongside usage data. When active, render a small "⇄" badge with tooltip showing which backends are swapped.

```tsx
// Inside UsageDisplay component, after existing usage chips:
{swapStatus?.active && (
  <Tooltip content={`Auto-swapped: ${swapStatus.swaps.map((s) => `${s.from} → ${s.to}`).join(', ')}`}>
    <span className="ml-1 text-xs text-warning">⇄</span>
  </Tooltip>
)}
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/layout/ui-header/usage-display.tsx electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat(ui): show swap-active badge in usage display"
```

---

### Task 8: Toast Notification — First Swap Event

**Files:**
- Modify: `electron/services/rate-limit-swap-service.ts`
- Modify: `electron/ipc/handlers.ts` or use existing IPC event pattern

**Step 1: Add event emission on first swap per window**

In `RateLimitSwapService`, track whether a toast has been sent per backend per reset window:

```ts
private notifiedBackends = new Set<string>();

// Inside resolveBackend, after deciding to swap:
if (!this.notifiedBackends.has(requestedBackend)) {
  this.notifiedBackends.add(requestedBackend);
  // Emit event to renderer via BrowserWindow.webContents.send
  this.emitSwapNotification(requestedBackend, rule.swapTo.backend);
}
```

**Step 2: Listen in renderer**

In the app root or usage display, listen for the IPC event and call `addToast`:

```ts
useEffect(() => {
  const unsubscribe = window.api.onRateLimitSwap?.((data) => {
    addToast({
      message: `Rate limit approaching for ${data.from} — routing new tasks to ${data.to}`,
      type: 'success',
    });
  });
  return unsubscribe;
}, [addToast]);
```

**Step 3: Reset notification state when utilization resets**

In `resolveBackend`, when hysteresis clears (backend goes back to original), also clear the notification flag:

```ts
this.notifiedBackends.delete(requestedBackend);
```

**Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/services/rate-limit-swap-service.ts electron/preload.ts src/lib/api.ts
git commit -m "feat(notification): toast on first rate-limit swap event"
```

---

### Task 9: Final Validation

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: PASS

**Step 2: Run lint**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: lint fixes for rate-limit auto-swap feature"
```

---

## Implementation Order Summary

| Task | What | Files | Depends On |
|------|------|-------|------------|
| 1 | Types + setting registration | `shared/types.ts` | — |
| 2 | Swap service + tests | `electron/services/rate-limit-swap-service.ts` | Task 1 |
| 3 | Agent service integration | `electron/services/agent-service.ts` | Task 2 |
| 4 | AI generation integration | `electron/services/ai-generation-service.ts` | Task 2 |
| 5 | Settings hooks | `src/hooks/use-settings.ts` | Task 1 |
| 6 | Settings UI | `src/features/settings/ui-rate-limit-swap-settings/` | Task 5 |
| 7 | Usage display badge | `src/layout/ui-header/usage-display.tsx` | Task 2 |
| 8 | Toast notification | service + renderer | Task 2 |
| 9 | Final validation | — | All |

Tasks 3+4 can run in parallel. Tasks 5+6 can run in parallel with 3+4. Task 7+8 can run in parallel.
