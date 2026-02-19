# Overlay Context & Dropdown Design

## Problem

Click-outside detection is duplicated across components (worktree branch menu, prompt textarea dropdown, etc.), each adding its own `document.addEventListener('mousedown', ...)`. This breaks with nested overlays — clicking inside a nested dropdown triggers the parent's click-outside handler.

## Solution

A root overlay context (mirroring `RootKeyboardBindings`) that centralizes click-outside detection with priority-based handler resolution. Plus a reusable `<Dropdown>` component built on top.

## Root Overlay Context

**Location:** `src/common/context/overlay/index.tsx`

**Provider:** `RootOverlay` — wraps the app, sets up a single `mousedown` listener on `document`.

**Registration:** `useRegisterOverlay(id, refs, onClose)` — each overlay registers:
- `id`: unique string
- `refs`: array of `RefObject<HTMLElement | null>` (all DOM nodes considered "inside" this overlay — e.g., trigger + content)
- `onClose`: `() => void` callback

**Click resolution:** On mousedown, iterate from last-registered to first:
1. If click target is inside any of this entry's refs → **stop** (click is inside, no close needed)
2. If click target is outside all refs → call `onClose()`, **stop** (close topmost outside overlay)

## Dropdown Component

**Location:** `src/common/ui/dropdown/index.tsx`

**API:**
```tsx
// React element trigger (ref cloned in via cloneElement)
<Dropdown trigger={<button>Open</button>}>
  <DropdownItem onClick={...}>Edit</DropdownItem>
</Dropdown>

// Render prop trigger (consumer attaches ref)
<Dropdown trigger={({ triggerRef }) => <button ref={triggerRef}>Open</button>}>
  <DropdownItem onClick={...}>Edit</DropdownItem>
</Dropdown>
```

**Behavior:**
- Uncontrolled (manages own open/close state)
- Portal-based (renders to `document.body`)
- Positioned via `getBoundingClientRect()` of trigger
- Auto-flips direction if not enough space
- Registers with overlay context for click-outside
- Registers `escape` keyboard binding for close
- Recalculates position on scroll/resize

**DropdownItem:** Simple styled button with optional icon and danger variant.

## Integration

`RootOverlay` added to provider stack in `src/app.tsx`. Existing `WorktreeBranchMenu` refactored to use `<Dropdown>`.
