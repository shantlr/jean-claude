# Timeline Style & User Emphasis Design

## Goal

Refine the messages timeline to feel more polished and make user messages obviously distinct from agent/tool activity.

## Changes

### 1. User Message Emphasis

Replace the purple dot + faint bg with a left accent bar treatment:

- **Left border**: `border-l-2 border-purple-500` solid accent bar
- **Background**: `bg-purple-500/8` (stronger than current `/5`)
- **Remove dot**: The accent bar replaces the dot as the visual marker
- **Text size**: `text-[13px] leading-relaxed` (larger than `text-xs` used elsewhere)
- **Text color**: `text-neutral-200` (brighter than `text-neutral-300`)
- **Padding**: `py-2.5` (more breathing room than `py-1.5`)

### 2. Timeline Line Gradient

Replace the solid `border-l border-neutral-700` with a gradient that fades at both ends:

- Top ~24px: transparent → neutral-700
- Middle: solid neutral-700
- Bottom ~24px: neutral-700 → transparent

Implemented via a `before` pseudo-element with a linear gradient background (1px wide).

### 3. Pending Dot Glow

Add a subtle glow ring to dots that are currently pulsing (`animate-pulse`):

- Tool pending: `shadow-[0_0_6px_theme(colors.blue.500/40)]`
- System pending: `shadow-[0_0_6px_theme(colors.amber.500/40)]`

No change to completed/static dots.

### 4. Typography Hierarchy

Dim tool and result entries to create visual hierarchy:

- **Tool summaries**: `text-neutral-300` → `text-neutral-400`
- **Result entries**: keep current dim styling, ensure `text-neutral-500`
- **Assistant text**: unchanged (`text-xs text-neutral-300`)

## Files Changed

- `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` — UserEntry, DotEntry, ResultEntry styling
- `src/features/agent/ui-message-stream/index.tsx` — timeline line gradient
- `src/index.css` — optional: custom utility for timeline gradient if needed
