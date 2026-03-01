# Per-Model Rate Limits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded fiveHour/sevenDay usage fields with a dynamic limits array to surface per-model rate limits (e.g. Opus) in the tooltip.

**Architecture:** Shared `UsageDisplayData` changes from `{ fiveHour, sevenDay }` to `{ limits: UsageLimit[] }`. Each provider dynamically produces the array. The UI iterates over limits instead of checking two hardcoded fields.

**Tech Stack:** TypeScript, React, Electron IPC (unchanged plumbing)

---

### Task 1: Update shared types

**Files:**
- Modify: `shared/usage-types.ts:1-28`

**Step 1: Replace the types**

Replace the `UsageLimitData`, `ClaudeUsageResponse`, and `UsageDisplayData` types. Remove `ClaudeUsageResponse` (dynamic parsing replaces it). Extract the inline range shape into a reusable `UsageRange`. Add `UsageLimit` with key/label/isPrimary.

```typescript
// API response types matching Anthropic's OAuth usage endpoint
export interface UsageLimitData {
  utilization: number;
  resets_at: string;
}

// Internal types for the app
export interface UsageRange {
  utilization: number;
  resetsAt: Date;
  timeUntilReset: string;
  windowDurationMs: number;
}

export interface UsageLimit {
  key: string;
  label: string;
  isPrimary: boolean;
  range: UsageRange;
}

export interface UsageDisplayData {
  limits: UsageLimit[];
}
```

Key changes:
- `ClaudeUsageResponse` removed — the Claude provider will parse the response dynamically
- `UsageRange` extracted from the inline type that was repeated for `fiveHour`/`sevenDay`
- `UsageLimit` wraps a range with metadata (key, label, isPrimary)
- `UsageDisplayData` is now `{ limits: UsageLimit[] }` instead of `{ fiveHour, sevenDay }`

**Step 2: Run ts-check to confirm expected downstream errors**

Run: `pnpm ts-check 2>&1 | head -40`
Expected: Type errors in `claude-usage-provider.ts`, `codex-usage-provider.ts`, and `usage-display.tsx` referencing `fiveHour`/`sevenDay`/`ClaudeUsageResponse`.

---

### Task 2: Update Claude usage provider — dynamic parsing

**Files:**
- Modify: `electron/services/usage-providers/claude-usage-provider.ts`

**Step 1: Replace import and transform method**

Remove the `ClaudeUsageResponse` import. Change the `as` cast on line 60 to `Record<string, unknown>`. Replace `transformResponse` (lines 108-134) with dynamic field parsing.

The new `transformResponse` should:
1. Iterate over every key in the API response object
2. Check if the value looks like a `UsageLimitData` (has numeric `utilization` and string `resets_at`)
3. Derive a human-readable label from the key: split on `_`, map known tokens (`five` → "5", `seven` → "7", `hour` → "hour", `day` → "day"), title-case the rest
4. Infer window duration from the key prefix: starts with `five_hour` → 5h ms, starts with `seven_day` → 7d ms, fallback to 24h ms
5. Mark `five_hour` (exact key) as `isPrimary: true`
6. Sort: primary first, then alphabetically by key

```typescript
import type {
  UsageLimitData,
  UsageRange,
  UsageDisplayData,
  UsageResult,
} from '@shared/usage-types';

// ... (no more ClaudeUsageResponse import)

// In getUsage(), change line 60 from:
//   const apiData = (await response.json()) as ClaudeUsageResponse;
// to:
//   const apiData = (await response.json()) as Record<string, unknown>;

private transformResponse(apiData: Record<string, unknown>): UsageDisplayData {
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
  const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_MS = 24 * 60 * 60 * 1000;

  const limits: UsageDisplayData['limits'] = [];

  for (const [key, value] of Object.entries(apiData)) {
    if (!this.isUsageLimitData(value)) continue;

    const windowDurationMs = key.startsWith('five_hour')
      ? FIVE_HOUR_MS
      : key.startsWith('seven_day')
        ? SEVEN_DAY_MS
        : DEFAULT_MS;

    limits.push({
      key,
      label: this.keyToLabel(key),
      isPrimary: key === 'five_hour',
      range: {
        utilization: value.utilization,
        resetsAt: new Date(value.resets_at),
        timeUntilReset: formatTimeUntil(new Date(value.resets_at)),
        windowDurationMs,
      },
    });
  }

  // Sort: primary first, then alphabetically
  limits.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return { limits };
}

private isUsageLimitData(value: unknown): value is UsageLimitData {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).utilization === 'number' &&
    typeof (value as Record<string, unknown>).resets_at === 'string'
  );
}

private keyToLabel(key: string): string {
  const TOKEN_MAP: Record<string, string> = {
    five: '5',
    seven: '7',
    hour: 'hour',
    day: 'day',
  };
  return key
    .split('_')
    .map((t) => TOKEN_MAP[t] ?? t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}
```

**Step 2: Run ts-check to confirm this file compiles**

Run: `pnpm ts-check 2>&1 | head -30`
Expected: Errors only in `codex-usage-provider.ts` and `usage-display.tsx` (not in this file).

---

### Task 3: Update Codex usage provider

**Files:**
- Modify: `electron/services/usage-providers/codex-usage-provider.ts:245-269`

**Step 1: Replace transformRateLimits**

Update the method to produce a `limits` array instead of `fiveHour`/`sevenDay`.

```typescript
private transformRateLimits(rateLimits: RateLimitData): UsageDisplayData {
  const limits: UsageDisplayData['limits'] = [];

  if (rateLimits.primary) {
    limits.push({
      key: 'primary',
      label: 'Primary',
      isPrimary: true,
      range: {
        utilization: rateLimits.primary.usedPercent,
        resetsAt: new Date(rateLimits.primary.resetsAt * 1000),
        timeUntilReset: formatTimeUntil(
          new Date(rateLimits.primary.resetsAt * 1000),
        ),
        windowDurationMs: rateLimits.primary.windowDurationMins * 60 * 1000,
      },
    });
  }

  if (rateLimits.secondary) {
    limits.push({
      key: 'secondary',
      label: 'Secondary',
      isPrimary: false,
      range: {
        utilization: rateLimits.secondary.usedPercent,
        resetsAt: new Date(rateLimits.secondary.resetsAt * 1000),
        timeUntilReset: formatTimeUntil(
          new Date(rateLimits.secondary.resetsAt * 1000),
        ),
        windowDurationMs:
          rateLimits.secondary.windowDurationMins * 60 * 1000,
      },
    });
  }

  return { limits };
}
```

Also update the import on line 4 — remove `UsageDisplayData` if it's only used for the return type (it's already imported).

**Step 2: Run ts-check**

Run: `pnpm ts-check 2>&1 | head -30`
Expected: Errors only in `usage-display.tsx`.

---

### Task 4: Update the UI component

**Files:**
- Modify: `src/layout/ui-header/usage-display.tsx`

**Step 1: Update helper functions**

Replace `hasAnyRangeOver` and `hasSecondaryRangeOver` (lines 51-65) to iterate over the limits array:

```typescript
/** Returns true if any limit has raw utilization >= threshold. */
function hasAnyRangeOver(data: UsageDisplayData, threshold: number): boolean {
  return data.limits.some((l) => l.range.utilization >= threshold);
}

/** Returns true if any non-primary limit has raw utilization >= threshold. */
function hasSecondaryRangeOver(
  data: UsageDisplayData,
  threshold: number,
): boolean {
  return data.limits.some(
    (l) => !l.isPrimary && l.range.utilization >= threshold,
  );
}
```

**Step 2: Update TooltipRangeRow prop type**

Change line 104 from:
```typescript
range: UsageDisplayData['fiveHour'] & {};
```
to:
```typescript
range: UsageRange;
```

And add `UsageRange` to the import from `@shared/usage-types` (line 8-13):
```typescript
import type {
  UsageDisplayData,
  UsageLevel,
  UsageProviderType,
  UsageRange,
  UsageResult,
} from '@shared/usage-types';
```

**Step 3: Update TooltipContent**

Replace the hardcoded `data.fiveHour`/`data.sevenDay` rendering (lines 144-152) with a map over limits:

```typescript
function TooltipContent({
  providerType,
  data,
}: {
  providerType: UsageProviderType;
  data: UsageDisplayData;
}) {
  const meta = getProviderMeta(providerType);

  return (
    <div className="space-y-1.5">
      <div className="font-medium text-neutral-200">{meta.label}</div>
      {data.limits.map((limit) => (
        <TooltipRangeRow
          key={limit.key}
          label={limit.label}
          range={limit.range}
        />
      ))}
    </div>
  );
}
```

**Step 4: Update ProviderUsageChip**

Find the primary limit from the array instead of accessing `result.data.fiveHour`.

Change the early-return guard (line 165):
```typescript
// Old:
if (!result.data?.fiveHour) {
// New:
const primary = result.data?.limits.find((l) => l.isPrimary);
if (!primary) {
```

Change the destructuring and ratio calculation (lines 189-194):
```typescript
// Old:
const { fiveHour } = result.data;
const usageRatio = getUsageRatio({
  utilization: fiveHour.utilization,
  resetsAt: fiveHour.resetsAt,
  windowDurationMs: fiveHour.windowDurationMs,
});
// New:
const usageRatio = getUsageRatio({
  utilization: primary.range.utilization,
  resetsAt: primary.range.resetsAt,
  windowDurationMs: primary.range.windowDurationMs,
});
```

Change the display percentage (lines 209-211):
```typescript
// Old:
const displayPercentage = isExhausted
  ? '100'
  : Math.min(fiveHour.utilization, 100).toFixed(0);
// New:
const displayPercentage = isExhausted
  ? '100'
  : Math.min(primary.range.utilization, 100).toFixed(0);
```

**Step 5: Run ts-check and lint**

Run: `pnpm ts-check`
Expected: No errors.

Run: `pnpm lint --fix && pnpm lint`
Expected: No errors.

---

### Task 5: Verify and commit

**Step 1: Run full checks**

```bash
pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint
```

Expected: All pass with no errors.

**Step 2: Commit**

```bash
git add shared/usage-types.ts electron/services/usage-providers/claude-usage-provider.ts electron/services/usage-providers/codex-usage-provider.ts src/layout/ui-header/usage-display.tsx docs/plans/2026-03-01-per-model-rate-limits-design.md docs/plans/2026-03-01-per-model-rate-limits-plan.md
git commit -m "feat: dynamic per-model rate limits in usage tooltip

Replace hardcoded fiveHour/sevenDay fields with a limits array.
Claude provider dynamically parses all API response fields.
Tooltip shows all limits with consistent color rules."
```
