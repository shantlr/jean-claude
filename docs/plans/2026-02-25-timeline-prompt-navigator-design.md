# Timeline Prompt Navigator

## Problem

When scrolling through a long agent session, users primarily navigate between their own prompts. There's no way to quickly jump between user prompts or know which prompt area you're currently viewing.

## Design

A compact floating navigator sits on the timeline line, always vertically centered in the viewport. It shows up/down arrows with the current prompt index between them.

### Visual

```
     │
     │
    [▲]
    2/5
    [▼]
     │
     │
```

- Vertically centered on the timeline border-left line (at `ml-3` = 12px)
- Semi-transparent pill: `bg-neutral-800/90` with `border-neutral-600` border
- Matches existing `ChangeNavigator` styling conventions
- Always visible when messages exist (even with 1 prompt — acts as orientation)

### Current prompt tracking

On scroll, find the last user-prompt element whose top edge is at or above the scroll container's viewport midpoint. This gives a natural feel: the counter increments as you scroll past a prompt.

Implementation: each user prompt DOM element gets a `data-prompt-index` attribute. On scroll (throttled), query these elements and compare positions to the scroll container's `scrollTop + clientHeight / 2`.

### Navigation

- **Up**: `scrollIntoView({ behavior: 'smooth', block: 'start' })` to previous prompt
- **Down**: Same for next prompt
- Buttons disabled at boundaries (no wrap)

### Positioning

Uses `position: sticky` with `top: calc(50% - height/2)` inside the timeline container. This keeps it vertically centered while scrolling naturally with the border-left line.

The navigator is absolutely positioned horizontally to sit centered on the timeline line (`left: -14px` approximately, to center on the 1px border).

## Files

| File | Change |
|------|--------|
| `ui-message-stream/use-prompt-navigation.ts` | New hook: tracks prompt elements, current index, goToNext/goToPrevious |
| `ui-message-stream/ui-timeline-prompt-navigator/index.tsx` | New component: floating pill with arrows and counter |
| `ui-message-stream/index.tsx` | Add data attributes to prompt entries, render navigator |
| `ui-message-stream/ui-timeline-entry/index.tsx` | Accept and forward `data-prompt-index` on UserEntry |
