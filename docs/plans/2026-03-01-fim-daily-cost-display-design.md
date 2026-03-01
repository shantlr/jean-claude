# FIM Daily Cost Display — Design

## Goal

Display today's Mistral FIM (autocomplete) cost in the app header, visible only when autocomplete is enabled. Tracks token usage locally since Mistral has no public usage/billing API.

## Data Layer

### New table: `completion_usage` (migration 032)

| Column            | Type    | Notes                                |
| ----------------- | ------- | ------------------------------------ |
| `date`            | TEXT PK | ISO date string, e.g. `"2026-03-01"`|
| `promptTokens`    | INTEGER | Cumulative input tokens for the day  |
| `completionTokens`| INTEGER | Cumulative output tokens for the day |
| `requests`        | INTEGER | Total FIM requests for the day       |

One row per day. Upserted (INSERT OR UPDATE) on each successful completion.

### Repository

New `CompletionUsageRepository` with two methods:

- `recordUsage({ date, promptTokens, completionTokens })` — upserts today's row, incrementing counters
- `getDailyUsage(date)` — returns the row for a given date, or zeros if none

## Service Changes

### `completion-service.ts`

After a successful FIM completion response, extract `result.usage.promptTokens` and `result.usage.completionTokens` from the Mistral SDK response and call `CompletionUsageRepository.recordUsage()`.

New exported function:

```ts
getDailyUsage(): Promise<{
  date: string;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  costUsd: number;
}>
```

Cost formula: `(promptTokens × 0.30 + completionTokens × 0.90) / 1_000_000`

Based on Codestral pricing: $0.30/M input tokens, $0.90/M output tokens.

## IPC

New handler: `completion:getDailyUsage` → calls `getDailyUsage()` and returns the result.

Add to preload bridge and API type definitions.

## UI

### New component: `completion-cost-display.tsx`

Location: `src/layout/ui-header/completion-cost-display.tsx` (co-located with `usage-display.tsx`)

Behavior:
- Reads completion setting via `useCompletionSetting()` — renders nothing if disabled
- Fetches daily usage via React Query hook (`useCompletionDailyUsage`) with 60s refetch
- Displays a small chip: **"FIM $0.12"** in neutral styling
- Tooltip breakdown: prompt tokens, completion tokens, request count, individual costs

### Header integration

Render `<CompletionCostDisplay />` next to `<UsageDisplay />` in the header.

## Pricing Reference

| Model      | Input (per 1M tokens) | Output (per 1M tokens) |
| ---------- | --------------------- | ---------------------- |
| Codestral  | $0.30                 | $0.90                  |

Source: [Mistral AI Pricing](https://docs.mistral.ai/deployment/laplateforme/pricing/)
