# Per-Model Rate Limits in Usage Display

## Problem

The Claude usage API returns per-model rate limits (e.g. `seven_day_opus`) alongside the main 5-hour and 7-day limits. The current data model uses hardcoded `fiveHour`/`sevenDay` fields, making it impossible to surface model-specific limits. As Anthropic adds new model limits, the code would need manual updates each time.

## Design

### Data Model

Replace the hardcoded `fiveHour`/`sevenDay` fields in `UsageDisplayData` with a flat array of limits, dynamically parsed from any fields the API returns.

```typescript
interface UsageRange {
  utilization: number;
  resetsAt: Date;
  timeUntilReset: string;
  windowDurationMs: number;
}

interface UsageLimit {
  key: string;          // raw API key: 'five_hour', 'seven_day_opus'
  label: string;        // display label: '5-hour', '7-day Opus'
  isPrimary: boolean;   // true for 'five_hour' only
  range: UsageRange;
}

interface UsageDisplayData {
  limits: UsageLimit[];
}
```

### API Parsing — Claude Provider

- Parse every top-level field from the API response that has a valid `UsageLimitData` shape (has `utilization` number and `resets_at` string).
- Derive labels from keys via naming convention: `five_hour` → "5-hour", `seven_day_opus` → "7-day Opus", `seven_day_oauth_apps` → "7-day OAuth Apps".
- Mark `five_hour` as `isPrimary: true` — it drives the chip display.
- Sort order: primary first, then remaining by key alphabetically.
- Window duration inferred from key prefix: `five_hour*` → 5h ms, `seven_day*` → 7d ms.

### API Parsing — Codex Provider

- Maps `primary` → `isPrimary: true` with label "Primary", `secondary` → label "Secondary".
- Same `UsageDisplayData` shape with a two-entry `limits` array.

### Chip Behavior (unchanged)

- Chip always shows the primary limit's percentage and color.
- Ring warning still triggers if any non-primary limit is ≥ 90% or ≥ 100%.

### Tooltip

- Flat list of all limits, each rendered with the existing `TooltipRangeRow` component.
- Primary limits appear first, then model-specific limits.
- Each row gets color from `getUsageLevel(ratio)` → `LEVEL_TEXT_COLORS[level]` (already implemented).

### Color Rules

Applied consistently via `UsageLevel` across chip, tooltip percentage, and tooltip ratio values. Already implemented in the `TooltipRangeRow` component.

## Scope

### Files Changed

1. `shared/usage-types.ts` — Replace `UsageDisplayData` type with `UsageRange` + `UsageLimit` + limits array.
2. `electron/services/usage-providers/claude-usage-provider.ts` — Dynamic parsing of API response fields, label derivation, window duration inference.
3. `electron/services/usage-providers/codex-usage-provider.ts` — Adapt `transformRateLimits` to produce `limits` array.
4. `src/layout/ui-header/usage-display.tsx` — Update `ProviderUsageChip` and `TooltipContent` to consume `limits` array. Update `hasAnyRangeOver`/`hasSecondaryRangeOver` helpers.

### Not Changed

- IPC layer, hooks, settings — `UsageResult` wrapper stays the same, only inner `UsageDisplayData` shape changes.
- `ClaudeUsageResponse` type — removed in favor of dynamic parsing.
