# Diff Minimap Design

## Overview

Add a VS Code-style minimap to the per-file diff view. The minimap is a thin vertical bar on the right edge showing colored markers that indicate where additions (green) and deletions (red) are located in the file.

## Requirements

- **Visual only** - No click/drag interaction (can be added later)
- **Both view modes** - Shows in inline and side-by-side views
- **Proportional positioning** - Markers appear at correct relative positions based on line numbers
- **Minimal footprint** - Thin bar (~10px wide) that doesn't distract from the diff content

## Visual Design

```
┌─────────────────────────────────────────────────────┐
│ [Toggle Button]                                     │
├─────────────────────────────────────────┬───────────┤
│                                         │ ██ (red)  │
│           Diff Content                  │           │
│         (table with lines)              │ ██ (green)│
│                                         │           │
│                                         │ ██ (green)│
└─────────────────────────────────────────┴───────────┘
```

- Minimap background: `bg-neutral-800`
- Addition markers: `bg-green-500`
- Deletion markers: `bg-red-500`
- Width: `w-2.5` (10px)

## Component Structure

### New File: `src/features/agent/ui-diff-view/diff-minimap.tsx`

```tsx
interface DiffMinimapProps {
  lines: DiffLine[];
}

export function DiffMinimap({ lines }: DiffMinimapProps) {
  // Filter to only addition/deletion lines
  // Calculate position as (lineIndex / totalLines) * 100%
  // Render colored markers
}
```

### Modified: `src/features/agent/ui-diff-view/index.tsx`

- Wrap scrollable content in a flex container
- Diff table takes `flex-1`
- Minimap positioned on the right with fixed width

## Rendering Logic

1. Get total line count from `lines.length`
2. For each line, determine its visual index (position in the array)
3. For lines with type `addition` or `deletion`:
   - Calculate `top: (index / totalLines) * 100%`
   - Render a small stripe (2-3px height minimum)
4. Adjacent same-type lines can be merged into a single taller stripe for cleaner appearance

## Future Enhancements (Not in Scope)

- Click-to-scroll navigation
- Viewport indicator showing visible region
- Hover preview tooltips
