# Prompt Input Bold Accent Redesign

## Summary

Rework the task panel prompt input footer from a flat, edge-pinned bar into a **floating card with an animated rotating gradient border**, gradient-filled send button with glow effects, and polished controls.

## Design Decisions

- **Style direction**: Bold accent — gradient borders, colorful highlights, animated send button
- **Layout**: Floating card detached from panel edges (margin on sides and bottom)
- **Controls position**: Keep current side-by-side layout (context usage, mode, model, textarea, buttons)
- **Gradient palette**: Blue → Purple (`#3B82F6` → `#8B5CF6` → `#A855F7`)
- **Border technique**: Animated conic-gradient on a rotating pseudo-element (Approach 2)
- **Send button**: Gradient fill + outer glow, icon-only

## Visual Structure

```
Panel bottom:
┌─────────────────────────────────────────────┐
│                                             │
│   ╭═══ rotating gradient border ═══════╮    │
│   ║                                    ║    │  mx-4 mb-3
│   ║  ◉ctx │ mode ▾ │ model ▾ │ [____] [▶] ║    │
│   ║                                    ║    │
│   ╰════════════════════════════════════╯    │
│                                             │
└─────────────────────────────────────────────┘
```

## Component Changes

### 1. Floating Card Container (TaskInputFooter)

**Before:**
```
flex items-center gap-2 border-t border-neutral-700 bg-neutral-800 px-4 py-3
```

**After:**
- Remove `border-t border-neutral-700`
- Wrap in a container with `mx-4 mb-3`
- New wrapper component `GradientBorderCard` handles the animated border
- Inner content: `bg-neutral-800/90 backdrop-blur-sm rounded-xl px-4 py-3`
- Drop shadow: `shadow-lg shadow-black/20`

### 2. Animated Gradient Border (`GradientBorderCard`)

Implementation technique — rotating conic-gradient pseudo-element:

```css
.gradient-border {
  position: relative;
  border-radius: 0.75rem; /* rounded-xl */
  padding: 1px; /* border thickness */
}

.gradient-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(
    from var(--gradient-angle, 0deg),
    #3B82F6,
    #8B5CF6,
    #A855F7,
    #8B5CF6,
    #3B82F6
  );
  opacity: 0.6;
  z-index: 0;
  animation: rotate-gradient 4s linear infinite;
}

@keyframes rotate-gradient {
  to { --gradient-angle: 360deg; }
}

/* Need @property for animating CSS custom property */
@property --gradient-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
```

**States:**
- Idle: gradient opacity `0.6`, subtle glow
- Textarea focused: gradient opacity `1.0`, stronger glow shadow
- Transition: `transition-opacity duration-300`

### 3. Send Button

**Idle:**
- `bg-gradient-to-r from-blue-500 to-purple-500`
- `shadow-md shadow-blue-500/25` (subtle outer glow)
- Icon-only, square: `h-10 w-10 rounded-lg`
- `transition-all duration-200`

**Hover:**
- `from-blue-400 to-purple-400` (brighter gradient)
- `shadow-lg shadow-blue-500/40` (stronger glow)
- `scale-105` (slight pop)

**Queue mode (running):**
- `from-amber-500 to-orange-500`
- `shadow-md shadow-amber-500/25`

**Stop button:**
- `from-red-500 to-rose-500`
- `shadow-md shadow-red-500/25`

### 4. Textarea

- Remove existing border (`border-neutral-600` → `border-transparent`)
- Background: `bg-transparent` or `bg-neutral-900/50` (very subtle)
- Focus: thin `ring-1 ring-white/10` instead of the blue ring (card border handles focus accent)
- Keep all existing functionality (auto-expand, completions, autocomplete dropdown, image attachments)

### 5. Controls

- Mode/model selectors stay in current positions
- Context usage display stays in current position
- Minor polish: slightly tighter spacing if needed

## Files to Modify

1. **`src/features/task/ui-task-panel/index.tsx`** — TaskInputFooter styling (container classes)
2. **`src/features/agent/ui-message-input/index.tsx`** — Send/Queue/Stop button gradient styles
3. **`src/features/common/ui-prompt-textarea/index.tsx`** — Textarea border/background removal
4. **New: `src/features/common/ui-gradient-border-card/index.tsx`** — Reusable animated gradient border wrapper
5. **New: CSS file or inline styles** — `@property` declaration and keyframes for gradient rotation

## Technical Notes

- `@property` is needed to animate the `--gradient-angle` custom property. Supported in Electron's Chromium.
- The conic-gradient rotation is GPU-accelerated and performant.
- The component should accept a `focused` prop to toggle between idle/focused opacity states.
- Consider using `will-change: transform` on the pseudo-element for animation optimization.
