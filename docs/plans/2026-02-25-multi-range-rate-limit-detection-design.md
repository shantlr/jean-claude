# Multi-Range Rate Limit Detection

## Problem

The usage display chip in the header only considers the 5-hour (shortest) range for color/level. When the 7-day (weekly) limit is reached or nearly reached, the chip can still show green/blue — misleading the user into thinking they have capacity.

## Design

### Visual layers (priority order, highest wins)

1. **Exhausted (any range ≥ 100%)**: Red text showing "100%", red glow ring. Overrides everything.
2. **Secondary warning (non-primary range ≥ 90%)**: Normal 5h percentage + existing pace-based level color, but with an orange/amber glow ring on the chip.
3. **Base (default)**: Existing behavior — 5h percentage with pace-based level coloring, no glow.

### Thresholds

- Raw `utilization` values (not pace-based ratios) used for the 90% and 100% checks.
- The pace-based ratio (`getUsageRatio` / `getUsageLevel`) continues to drive the base level coloring for the primary (5h) range.

### Tooltip enhancement

- Show the usage ratio for the 7-day window too (currently only shown for 5h).

### Scope

- Single file change: `src/layout/ui-header/usage-display.tsx`
- No changes to data fetching, types, or backend providers.

## Implementation

Add two helper functions to `ProviderUsageChip`:

```
anyRangeExhausted(data: UsageDisplayData): boolean
  → returns true if fiveHour.utilization >= 100 OR sevenDay.utilization >= 100

anySecondaryRangeWarning(data: UsageDisplayData): boolean
  → returns true if sevenDay.utilization >= 90
```

Apply conditional classes to the chip:
- Exhausted → `text-red-400` + `ring-1 ring-red-400/60` + show "100%"
- Secondary warning → existing level color + `ring-1 ring-orange-400/50`
- Default → no ring, existing behavior
