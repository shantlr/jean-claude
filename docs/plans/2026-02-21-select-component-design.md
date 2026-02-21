# Select Component Design

## Problem

Three selector components (`ModeSelector`, `ModelSelector`, `BackendSelector`) and two native `<select>` elements share the same pattern: manual `isOpen` state, manual click-outside via `document.addEventListener('mousedown')`, no portal, no keyboard navigation. The new task overlay re-implements cycling logic for each separately (`toggleInteractionMode`, `toggleModelPreference`, `backendInfo.toggle`).

## Solution

A reusable `Select` component in `src/common/ui/select/` with an imperative ref for programmatic control and built-in shortcut support.

## API

```tsx
interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SelectRef {
  next: () => void;     // cycle forward (wraps)
  prev: () => void;     // cycle backward (wraps)
  open: () => void;     // open dropdown
  close: () => void;    // close dropdown
}

<Select<T>
  value={T}
  options={SelectOption<T>[]}
  onChange={(value: T) => void}
  disabled?: boolean
  // Display
  label?: string                           // aria-label
  side?: 'top' | 'bottom'                 // default 'bottom'
  align?: 'left' | 'right'                // default 'left'
  className?: string                       // on trigger button
  // Shortcut
  shortcut?: BindingKey | BindingKey[]     // shows <Kbd>, registers binding
  shortcutBehavior?: 'cycle' | 'open'     // default 'cycle'
  ref?: Ref<SelectRef>
/>
```

## Behavior

### Trigger button

Renders `{selectedOption.label}` + `<ChevronDown>` + optional `<Kbd shortcut={...}>`.

### Dropdown panel

- Portal-based via `createPortal` to `document.body`
- Positioned with `getBoundingClientRect()`, auto-flips top/bottom based on viewport space
- Click-outside via `useRegisterOverlay`
- Scroll/resize repositioning

### Keyboard when open

`useRegisterKeyboardBindings` with `{ enabled: isOpen }`:
- `escape` — close, return focus to trigger
- `up`/`down` — move focus between options (wraps)
- `enter`/`space` — select focused option, close
- `tab` — close

### Shortcut binding

When `shortcut` prop is provided:
- Registers keyboard bindings (always enabled when component is mounted, `ignoreIfInput: true`)
- `shortcutBehavior: 'cycle'` (default) — calls `next()` to cycle through options
- `shortcutBehavior: 'open'` — calls `open()` to show the dropdown

### Selected highlight

Current value gets `bg-neutral-700` background in the dropdown list.

### ARIA

- Trigger: `aria-haspopup="listbox"`, `aria-expanded`, `aria-label`
- Panel: `role="listbox"`, `aria-orientation="vertical"`
- Options: `role="option"`, `aria-selected`

## Internals

The component mirrors the `Dropdown` component's architecture:
- `useId()` for unique IDs
- `triggerRef` + `contentRef` for positioning and overlay registration
- `useRegisterOverlay` for click-outside
- `useRegisterKeyboardBindings` with `{ enabled: isOpen }` for open-state bindings
- Separate `useRegisterKeyboardBindings` for shortcut (always active)
- `forwardRef` + `useImperativeHandle` for the `SelectRef`

## Command palette

Select does not register commands in the command palette. Parents register via `useCommands` if they want command palette entries that call `selectRef.current.next()`.

## File location

`src/common/ui/select/index.tsx`

## Refactor targets (separate steps)

1. `ModeSelector` — replace internals with `<Select>`, keep wrapper for mode-specific options
2. `ModelSelector` — replace internals with `<Select>`
3. `BackendSelector` — replace internals with `<Select>`
4. New task overlay footer — replace inline buttons + manual cycling with `<Select shortcut="cmd+i">` etc.
5. Source branch selectors — replace native `<select>` (lower priority)
