# Background Jobs Glass Styling Design

## Goal

Restyle the background jobs header button and overlay panel with a premium glassmorphism aesthetic featuring an animated gradient border beam on the button when jobs are running.

## Scope

Two components affected:
- `src/layout/ui-header/index.tsx` — the Jobs button
- `src/features/background-jobs/ui-background-jobs-overlay/index.tsx` — the overlay panel
- `src/index.css` — new keyframes and `@property` declaration

## Button Design

### Idle State (no running jobs)

- Background: `bg-white/5` — subtle translucent glass
- Border: `border border-white/[0.08]` — barely-there edge
- Border radius: `rounded-lg`
- Text: `text-neutral-400` (unchanged)
- Icon: Static `Loader2` at `h-3.5 w-3.5`
- Hover: `bg-white/10`, `border-white/[0.15]`, `text-white`

### Active State (jobs running)

- Animated gradient border: conic-gradient beam sweeping the perimeter over ~3s using CSS `@property --angle` animation
- Implementation: `::before` pseudo-element with `conic-gradient(from var(--angle), transparent 60%, #3b82f6 80%, #60a5fa 100%)`, masked to show only the border region
- Inner background: `bg-blue-950/30` — subtle blue tint
- Glow: `shadow-[0_0_12px_rgba(59,130,246,0.15)]`
- Badge: existing blue pill plus `shadow-[0_0_6px_rgba(59,130,246,0.4)]` glow
- Icon: spinning (unchanged)

### Transitions

All state changes use `transition-all duration-500` for smooth idle ↔ active fading.

## Overlay Panel Design

### Panel Container

- Background: `bg-neutral-900/85 backdrop-blur-xl`
- Border: `border border-white/10`
- Shadow: `shadow-2xl shadow-black/50`
- Border radius: `rounded-xl`

### Header

- Background: `bg-gradient-to-r from-white/5 to-transparent`
- Divider: `border-b border-white/10`
- "Clear Finished" button: `bg-white/5 border-white/10 hover:bg-white/10`

### Job Rows

Color-coded with glass translucency:
- Running: `bg-blue-500/[0.08] border-blue-400/20 backdrop-blur-sm`
- Succeeded: `bg-emerald-500/[0.08] border-emerald-400/20`
- Failed: `bg-red-500/[0.08] border-red-400/20`
- Border radius: `rounded-lg`

### Action Buttons

- Default (Retry): `bg-white/5 border-white/[0.15] hover:bg-white/10`
- Blue accent (Open Task): `bg-blue-500/10 border-blue-400/25 hover:bg-blue-500/20`

### Empty State

- Dashed border: `border-white/10`
- Text: `text-neutral-500`

## CSS Requirements

### `@property --angle`

```css
@property --angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}
```

### `@keyframes rotate-gradient`

```css
@keyframes rotate-gradient {
  to {
    --angle: 360deg;
  }
}
```

### Gradient border technique

The button uses a wrapper element (or pseudo-element) with:
1. Full conic-gradient background rotating via `--angle`
2. Inner element with solid/translucent background covers center
3. Gap between inner and outer creates the visible "border"

Alternative: use CSS `mask` to reveal only the border region of the gradient.

## Files Changed

1. `src/index.css` — `@property --angle`, `@keyframes rotate-gradient`
2. `src/layout/ui-header/index.tsx` — button restyle with gradient border wrapper
3. `src/features/background-jobs/ui-background-jobs-overlay/index.tsx` — glass overlay restyle
