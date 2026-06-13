# Rate Limit Auto-Swap Design

## Overview

When an agent backend approaches its rate limit, automatically route new tasks and AI generation requests to a configured fallback backend. Uses existing utilization tracking from `AgentUsageService` and `UsageSnapshotTable`.

## Decisions

- **Trigger**: Utilization threshold from existing rate limit tracking (not error-count based)
- **Fallback selection**: User-defined mapping per backend (not auto-lowest)
- **Scope**: Global config only (no per-project override)
- **AI generation**: Same swap rules as tasks (unified config)

## Config Shape

New global setting `rateLimitSwap` in `shared/types.ts`:

```ts
type RateLimitSwapRule = {
  backend: AgentBackendType;    // source backend
  threshold: number;            // 0-1 utilization trigger (e.g. 0.80)
  swapTo: {
    backend: AgentBackendType;  // target backend
    model?: string;             // optional model override
  };
};

type RateLimitSwapSetting = {
  enabled: boolean;
  rules: RateLimitSwapRule[];
};
```

Example:

```json
{
  "rateLimitSwap": {
    "enabled": true,
    "rules": [
      {
        "backend": "claude-code",
        "threshold": 0.80,
        "swapTo": { "backend": "opencode", "model": "sonnet" }
      },
      {
        "backend": "opencode",
        "threshold": 0.90,
        "swapTo": { "backend": "claude-code" }
      }
    ]
  }
}
```

Constraints:
- One rule per source backend max (first match wins, validated at save)
- `enabled` toggle for quick disable without deleting rules

## Resolution Service

New service: `electron/services/rate-limit-swap-service.ts`

```ts
class RateLimitSwapService {
  resolveBackend(requestedBackend: AgentBackendType): {
    backend: AgentBackendType;
    model?: string;
    swapped: boolean;
  }
}
```

Resolution flow:

1. Get current utilization for `requestedBackend` from `AgentUsageService`
2. Find matching rule in `rateLimitSwap.rules`
3. If utilization ≥ threshold → check swap target's utilization too
4. If swap target under its own threshold → return swapped backend/model
5. If swap target also over threshold → return original (don't make it worse)
6. No rule or disabled → return original unchanged

### Integration Points

Callers that resolve backend before use:

- `agent-service.ts` → `createSession()` — task step backend resolution
- `ai-generation-service.ts` → `generateText()` — summaries, name generation
- `completion-service.ts` → `complete()` — autocomplete (Mistral excluded, separate API)

### Anti-Ping-Pong / Hysteresis

- Swap triggers at threshold (e.g. 80%)
- Swap back only when source drops below threshold - 10% (e.g. 70%)
- If both backends over their respective thresholds → no swap, use original

### Caching

Utilization data already cached in `AgentUsageService` (polled periodically). No extra API calls needed.

## UI & Observability

### Settings UI

New section in Settings > Backends:

- Toggle: "Auto-swap on rate limit"
- Per enabled backend: threshold slider (0-100%) + dropdown for swap target backend + optional model picker

### Header Usage Display

Enhance existing `usage-display.tsx`:

- When swap active → badge/icon next to usage bar (e.g. "⇄ swapped to OpenCode")
- Tooltip: "Claude Code at 85% utilization — new tasks routed to OpenCode"

### Task/Step Indicator

- Step metadata stores `swappedFrom` field — original requested backend
- Task detail shows subtle label: "Auto-swapped from Claude Code (rate limit)"

### AI Generation

- Silent swap, debug-logged: "name-gen: swapped claude-code → opencode (utilization 87%)"
- No UI noise for background AI features

### Notification

- Toast on first swap event per cooldown window: "Rate limit approaching for Claude Code — routing new tasks to OpenCode"
- Once per window, not per task

## Edge Cases & Guardrails

| Scenario | Behavior |
|----------|----------|
| No valid swap target | Proceed with original backend |
| Utilization data stale/unavailable | Treat as 0% (optimistic), don't swap on missing data |
| Completion service (Mistral) | Excluded — separate API, not an agent backend |
| User explicitly picks backend on task | Skip swap — user intent overrides auto-routing |
| Rapid oscillation near threshold | Hysteresis: swap at 80%, swap back at 70% |
| Multiple rules for same backend | Validate at save: one rule per source backend max |
| Backend utilization drops after reset | Next `resolveBackend()` call naturally returns original |
| Swap target lacks required capabilities | v1 doesn't gate on capabilities — user configures what works |
