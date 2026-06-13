# Context Usage Accuracy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make task detail context indicator reflect current live/estimated context usage for Claude Code and OpenCode instead of cumulative token spend.

**Architecture:** Move context math into one pure utility, feed it normalized result entries plus backend/model metadata, and show source quality in UI. Claude Code uses latest result usage after compact and excludes output tokens; OpenCode uses latest assistant/step usage including reasoning/cache, matching OpenCode UI behavior. Model context windows come from backend model metadata where available, with small static fallback map.

**Tech Stack:** TypeScript, React, Vitest, TanStack Query, Claude Agent SDK normalized messages, OpenCode SDK v2.

---

## Findings To Preserve

- `src/hooks/use-context-usage.ts` currently sums all `result.usage.inputTokens + outputTokens` after last compact marker.
- Claude Code statusline context uses latest API response: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, divided by `context_window_size`; output excluded.
- OpenCode SDK v2 exposes assistant/step `tokens` and model `limit.context`, but no precomputed context percentage.
- OpenCode UI computes context usage from latest assistant tokens: `input + output + reasoning + cache.read + cache.write`, divided by `model.limit.context`.
- OpenCode `client.v2.session.context()` returns active context messages after last compaction, not aggregate token usage.

## Target Semantics

| Backend | Context Tokens | Window | Source Label |
|---|---:|---:|---|
| Claude Code | latest result input + cache read + cache creation after compact | model metadata/fallback | `latest-response` |
| OpenCode | latest result/assistant input + output + reasoning + cache read + cache creation after compact | OpenCode model `limit.context` | `opencode-estimate` |
| unknown/no usage | none | model metadata/fallback | hidden |

## Task 1: Add Pure Context Calculator

**Files:**
- Create: `src/lib/context-usage.ts`
- Create: `src/lib/context-usage.test.ts`
- Modify: `shared/normalized-message-v2.ts`

**Step 1: Extend token usage type**

Modify `shared/normalized-message-v2.ts`:

```ts
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}
```

**Step 2: Write failing tests**

Create `src/lib/context-usage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { calculateContextUsage } from './context-usage';

describe('calculateContextUsage', () => {
  it('uses latest Claude Code result after compact and excludes output tokens', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'old',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 90_000, outputTokens: 10_000 },
        },
        {
          id: 'compact',
          date: '2026-01-01T00:00:01.000Z',
          type: 'system-status',
          status: null,
        },
        {
          id: 'latest',
          date: '2026-01-01T00:00:02.000Z',
          type: 'result',
          isError: false,
          usage: {
            inputTokens: 10_000,
            outputTokens: 5_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 15_000,
      contextWindow: 200_000,
      percentage: 7.5,
      hasData: true,
      source: 'latest-response',
      isEstimate: false,
    });
  });

  it('uses latest OpenCode usage and includes output, reasoning, and cache tokens', () => {
    const result = calculateContextUsage({
      backend: 'opencode',
      contextWindow: 128_000,
      entries: [
        {
          id: 'a',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: {
            inputTokens: 20_000,
            outputTokens: 4_000,
            reasoningTokens: 1_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 30_000,
      contextWindow: 128_000,
      percentage: 23.4375,
      hasData: true,
      source: 'opencode-estimate',
      isEstimate: true,
    });
  });

  it('returns no data when no post-compact result has usage', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'compact',
          date: '2026-01-01T00:00:00.000Z',
          type: 'system-status',
          status: null,
        },
      ],
    });

    expect(result.hasData).toBe(false);
    expect(result.contextTokens).toBe(0);
  });
});
```

**Step 3: Run failing test**

Run: `pnpm vitest run src/lib/context-usage.test.ts`

Expected: fail because `src/lib/context-usage.ts` missing.

**Step 4: Implement calculator**

Create `src/lib/context-usage.ts`:

```ts
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { NormalizedEntry, TokenUsage } from '@shared/normalized-message-v2';

export type ContextUsageSource = 'latest-response' | 'opencode-estimate';

export interface ContextUsage {
  contextTokens: number;
  contextWindow: number;
  percentage: number;
  hasData: boolean;
  source?: ContextUsageSource;
  isEstimate: boolean;
}

export function calculateContextUsage({
  entries,
  backend,
  contextWindow,
}: {
  entries: NormalizedEntry[];
  backend: AgentBackendType;
  contextWindow: number;
}): ContextUsage {
  const usage = findLatestUsageAfterCompact(entries);
  if (!usage) {
    return {
      contextTokens: 0,
      contextWindow,
      percentage: 0,
      hasData: false,
      isEstimate: backend === 'opencode',
    };
  }

  const isOpenCode = backend === 'opencode';
  const contextTokens = isOpenCode
    ? sumOpenCodeContextTokens(usage)
    : sumClaudeContextTokens(usage);

  return {
    contextTokens,
    contextWindow,
    percentage:
      contextWindow > 0 ? Math.min(100, (contextTokens / contextWindow) * 100) : 0,
    hasData: contextTokens > 0,
    source: isOpenCode ? 'opencode-estimate' : 'latest-response',
    isEstimate: isOpenCode,
  };
}

function findLatestUsageAfterCompact(entries: NormalizedEntry[]): TokenUsage | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'system-status' && entry.status === null) return null;
    if (entry.type === 'result' && entry.usage) return entry.usage;
  }
  return null;
}

function sumClaudeContextTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  );
}

function sumOpenCodeContextTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.reasoningTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  );
}
```

**Step 5: Run test**

Run: `pnpm vitest run src/lib/context-usage.test.ts`

Expected: pass.

## Task 2: Preserve OpenCode Per-Turn Usage Instead Of Session Totals

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts`
- Test: `electron/services/agent-backends/opencode/opencode-backend.test.ts`

**Step 1: Add failing test**

In `opencode-backend.test.ts`, add/adjust a test near existing token aggregation tests:

```ts
it('emits latest OpenCode assistant usage for context display instead of cumulative usage', async () => {
  // Arrange two assistant message.updated events with tokens.
  // First: input 10, output 5, reasoning 1, cache read 2, cache write 3.
  // Second: input 20, output 6, reasoning 4, cache read 1, cache write 0.
  // Act until session.idle completion event.
  // Assert emitted result usage equals second assistant tokens, not sum.
  expect(resultEntry.usage).toEqual({
    inputTokens: 20,
    outputTokens: 6,
    reasoningTokens: 4,
    cacheReadTokens: 1,
    cacheCreationTokens: 0,
  });
});
```

Use existing OpenCode mock helpers in same file; do not introduce new mocking style.

**Step 2: Run focused test**

Run: `pnpm vitest run electron/services/agent-backends/opencode/opencode-backend.test.ts`

Expected: fail; current `state.totalUsage` is cumulative.

**Step 3: Add latest usage to session state**

Modify `OpenCodeSessionState` in `opencode-backend.ts`:

```ts
/** Latest assistant token usage for context display. */
latestUsage?: TokenUsage;
```

**Step 4: Compute latest assistant usage**

Update `updateUsageTotals(state)` to keep existing cumulative cost behavior but also choose latest completed assistant message by `time.created` or `time.completed`:

```ts
let latestAssistant: OcAssistantMessage | undefined;

// inside assistant loop, after tokens check:
if (
  !latestAssistant ||
  (assistant.time.completed ?? assistant.time.created) >
    (latestAssistant.time.completed ?? latestAssistant.time.created)
) {
  latestAssistant = assistant;
}

// after loop:
state.latestUsage = latestAssistant?.tokens
  ? {
      inputTokens: latestAssistant.tokens.input,
      outputTokens: latestAssistant.tokens.output,
      reasoningTokens: latestAssistant.tokens.reasoning,
      cacheReadTokens: latestAssistant.tokens.cache.read,
      cacheCreationTokens: latestAssistant.tokens.cache.write,
      totalTokens: latestAssistant.tokens.total,
    }
  : undefined;
state.normalizationCtx.totalUsage = state.latestUsage;
```

Keep `state.totalUsage` for cost/session accounting if existing tests expect it. Only normalizer context should use latest usage for emitted `result.usage`.

**Step 5: Run focused test**

Run: `pnpm vitest run electron/services/agent-backends/opencode/opencode-backend.test.ts`

Expected: pass or fail only where old cumulative usage expectations need update.

**Step 6: Update stale expectations**

If tests assert emitted `result.usage` cumulative, update them to assert latest response usage. Keep any session-cost tests asserting total cost unchanged.

## Task 3: Add Context Window Metadata To Backend Models

**Files:**
- Modify: `src/hooks/use-backend-models.ts`
- Modify: `src/lib/api.ts`
- Modify: backend model service file found by grep for `getBackendModels`
- Test: matching backend model service test if present

**Step 1: Locate backend model provider**

Run: `grep` via code search for `getBackendModels` in `electron/`.

Expected likely files:

- `electron/ipc/handlers.ts`
- `electron/services/backend-models-service.ts`

**Step 2: Extend frontend model type**

Modify `src/hooks/use-backend-models.ts`:

```ts
export interface BackendModel {
  id: string;
  label: string;
  contextWindow?: number;
  supportsThinking?: boolean;
  thinkingEfforts?: ThinkingEffort[];
}
```

Mirror same shape in `src/lib/api.ts` return type for `api.agent.getBackendModels`.

**Step 3: Populate OpenCode context windows**

In backend model service where OpenCode model list is built, map OpenCode SDK model limit:

```ts
{
  id: `${model.providerID}/${model.id}`,
  label: model.name ?? model.id,
  contextWindow: model.limit?.context,
  supportsThinking: ...,
  thinkingEfforts: ...,
}
```

Use actual model shape from existing implementation; do not force exact field names if they differ.

**Step 4: Add static Claude Code fallback map**

Create or update `src/lib/model-context-window.ts`:

```ts
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference } from '@shared/types';

const DEFAULT_CONTEXT_WINDOW = 200_000;

const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  default: 200_000,
  opus: 200_000,
  sonnet: 200_000,
  haiku: 200_000,
};

export function getContextWindowForModel({
  backend,
  model,
  dynamicContextWindow,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  dynamicContextWindow?: number;
}): number {
  if (dynamicContextWindow && dynamicContextWindow > 0) return dynamicContextWindow;
  if (backend === 'claude-code') return CLAUDE_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
  return DEFAULT_CONTEXT_WINDOW;
}
```

**Step 5: Add tests for context window resolver**

Create `src/lib/model-context-window.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getContextWindowForModel } from './model-context-window';

describe('getContextWindowForModel', () => {
  it('prefers dynamic model context window', () => {
    expect(
      getContextWindowForModel({
        backend: 'opencode',
        model: 'anthropic/claude-sonnet-4' as never,
        dynamicContextWindow: 1_000_000,
      }),
    ).toBe(1_000_000);
  });

  it('falls back to Claude Code default window', () => {
    expect(
      getContextWindowForModel({ backend: 'claude-code', model: 'sonnet' }),
    ).toBe(200_000);
  });
});
```

**Step 6: Run tests**

Run: `pnpm vitest run src/lib/model-context-window.test.ts`

Expected: pass.

## Task 4: Wire Task Panel To Backend/Model-Aware Calculator

**Files:**
- Modify: `src/hooks/use-context-usage.ts`
- Modify: `src/features/task/ui-task-panel/index.tsx`
- Modify: `src/features/agent/ui-context-usage-display/index.tsx`

**Step 1: Update hook signature**

Modify `src/hooks/use-context-usage.ts` to wrap pure calculator:

```ts
import { useMemo } from 'react';

import { calculateContextUsage, type ContextUsage } from '@/lib/context-usage';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';

export type { ContextUsage } from '@/lib/context-usage';

export function useContextUsage({
  entries,
  backend,
  contextWindow,
}: {
  entries: NormalizedEntry[];
  backend: AgentBackendType;
  contextWindow: number;
}): ContextUsage {
  return useMemo(
    () => calculateContextUsage({ entries, backend, contextWindow }),
    [entries, backend, contextWindow],
  );
}
```

**Step 2: Compute context window in task panel**

In `src/features/task/ui-task-panel/index.tsx`, move context usage calculation after `effectiveBackend`, `effectiveModel`, and `dynamicModels` are available.

Add helper logic:

```ts
const activeModelMeta = dynamicModels?.find((m) => m.id === effectiveModel);
const contextWindow = getContextWindowForModel({
  backend: effectiveBackend,
  model: effectiveModel,
  dynamicContextWindow: activeModelMeta?.contextWindow,
});
const contextUsage = useContextUsage({
  entries: agentState.messages,
  backend: effectiveBackend,
  contextWindow,
});
```

Remove old `useContextUsage(agentState.messages)` call.

**Step 3: Update tooltip language**

In `ui-context-usage-display`, update title:

```ts
const label = contextUsage.isEstimate ? 'Estimated context' : 'Context';
const tooltipText = `${label}: ${formatNumber(contextUsage.contextTokens)} / ${formatNumber(contextUsage.contextWindow)} tokens`;
```

Optional tiny visible hint: add `aria-label={tooltipText}` only; do not add more UI chrome unless user asks.

**Step 4: Run typecheck for edited UI**

Run: `pnpm ts-check`

Expected: no type errors.

## Task 5: Verify End-To-End Semantics

**Files:**
- No new files unless tests expose gap.

**Step 1: Run focused tests**

Run:

```bash
pnpm vitest run src/lib/context-usage.test.ts src/lib/model-context-window.test.ts electron/services/agent-backends/opencode/opencode-backend.test.ts
```

Expected: all pass.

**Step 2: Run required repo checks**

Per repo instructions, run in order:

```bash
pnpm install
pnpm test
pnpm lint --fix
pnpm ts-check
pnpm lint
```

Expected: all pass.

**Step 3: Manual sanity check**

Open task details with a Claude Code step and an OpenCode step.

Expected:

- Indicator appears only after first result with usage.
- Claude Code percentage no longer grows by summing whole session.
- OpenCode percentage matches OpenCode UI scale more closely.
- Tooltip says `Estimated context` for OpenCode.

## Non-Goals

- Do not re-tokenize full transcript.
- Do not call OpenCode `session.context()` on every render.
- Do not add database schema changes.
- Do not change cost/usage dashboard semantics.
- Do not touch changelogs.

## Open Questions

- If Claude Agent SDK exposes `context_window` directly in future, replace Claude fallback with exact value.
- If OpenCode adds server aggregate context metrics, prefer that over latest assistant token estimate.
