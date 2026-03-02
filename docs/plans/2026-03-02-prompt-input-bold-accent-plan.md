# Prompt Input Bold Accent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the task panel prompt input footer from a flat bar into a floating card with an animated rotating gradient border, gradient send/stop buttons with glow, and polished textarea.

**Architecture:** Reuse the existing `@property --gradient-angle` and `gradient-rotate` keyframes from `src/index.css`. Add a new `@utility` for the prompt input border. Modify TaskInputFooter container styling, MessageInput button styles, and PromptTextarea border/background. No new component files needed — this is purely a styling change across 3 existing files + 1 CSS utility.

**Tech Stack:** Tailwind CSS 4 (`@utility`), CSS `conic-gradient` + `@property`, existing `clsx` for conditional classes.

---

### Task 1: Add CSS utility for prompt input gradient border

**Files:**
- Modify: `src/index.css` (append after existing utilities)

**Step 1: Add the `prompt-input-border` utility**

Add the following after the `step-connector-running` utility at the end of `src/index.css`:

```css
/* ── Prompt input: floating card with animated gradient border ── */
@utility prompt-input-border {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(var(--color-neutral-800), var(--color-neutral-800))
      padding-box,
    conic-gradient(
        from var(--gradient-angle),
        var(--color-blue-500),
        var(--color-violet-500),
        var(--color-purple-500),
        var(--color-violet-500),
        var(--color-blue-500)
      )
      border-box;
  border: 1px solid transparent;
  animation: gradient-rotate 4s linear infinite;
  box-shadow:
    0 0 12px 0 color-mix(in srgb, var(--color-blue-500) 20%, transparent),
    0 4px 6px -1px rgba(0, 0, 0, 0.2);
}

@utility prompt-input-border-focused {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(var(--color-neutral-800), var(--color-neutral-800))
      padding-box,
    conic-gradient(
        from var(--gradient-angle),
        var(--color-blue-500),
        var(--color-violet-500),
        var(--color-purple-500),
        var(--color-violet-500),
        var(--color-blue-500)
      )
      border-box;
  border: 1px solid transparent;
  animation: gradient-rotate 4s linear infinite;
  box-shadow:
    0 0 20px 2px color-mix(in srgb, var(--color-blue-500) 30%, transparent),
    0 0 8px 0 color-mix(in srgb, var(--color-purple-500) 20%, transparent),
    0 4px 6px -1px rgba(0, 0, 0, 0.3);
}
```

**Step 2: Verify CSS parses correctly**

Run: `pnpm ts-check`
Expected: No new errors (CSS-only change, shouldn't affect TS).

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add prompt-input-border CSS utilities for animated gradient"
```

---

### Task 2: Restyle TaskInputFooter as floating card

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (lines ~1191-1192)

**Step 1: Update the TaskInputFooter container classes**

In `TaskInputFooter`, the return JSX at line 1192 currently has:
```tsx
<div className="flex items-center gap-2 border-t border-neutral-700 bg-neutral-800 px-4 py-3">
```

Replace with:
```tsx
<div className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-4 py-3 prompt-input-border">
```

Key changes:
- Remove: `border-t border-neutral-700 bg-neutral-800` (the `@utility` handles background + border)
- Add: `mx-3 mb-3` (floating margins)
- Add: `rounded-xl` (rounded card corners)
- Add: `prompt-input-border` (the animated gradient utility)

**Step 2: Add focus state tracking**

The `TaskInputFooter` needs to know when the textarea is focused so it can switch between `prompt-input-border` and `prompt-input-border-focused`.

Add a `focused` state and pass an `onFocusChange` callback to `MessageInput`:

In `TaskInputFooter`, add state before the return:
```tsx
const [inputFocused, setInputFocused] = useState(false);
```

Update the container class to be conditional:
```tsx
<div className={clsx(
  'mx-3 mb-3 flex items-center gap-2 rounded-xl px-4 py-3 transition-shadow duration-300',
  inputFocused ? 'prompt-input-border-focused' : 'prompt-input-border',
)}>
```

Pass to MessageInput:
```tsx
<MessageInput
  // ...existing props...
  onFocusChange={setInputFocused}
/>
```

**Step 3: Verify it compiles**

Run: `pnpm ts-check`
Expected: Error about `onFocusChange` not being a valid prop on MessageInput (we'll fix that in Task 3).

**Step 4: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "style: restyle TaskInputFooter as floating gradient card"
```

---

### Task 3: Thread focus state through MessageInput to PromptTextarea

**Files:**
- Modify: `src/features/agent/ui-message-input/index.tsx`

**Step 1: Add `onFocusChange` prop to MessageInput**

Add to the props interface:
```tsx
/** Callback when textarea focus state changes */
onFocusChange?: (focused: boolean) => void;
```

Add to destructured props:
```tsx
onFocusChange,
```

Pass it to PromptTextarea:
```tsx
<PromptTextarea
  // ...existing props...
  onFocus={() => onFocusChange?.(true)}
  onBlur={() => onFocusChange?.(false)}
/>
```

Note: PromptTextarea already spreads `...textareaProps` onto the textarea element, and since it extends `TextareaHTMLAttributes`, `onFocus` and `onBlur` are already supported. But we need to check if PromptTextarea explicitly lists these or uses `...rest`. Let's look at PromptTextarea's prop handling.

Actually, looking at the PromptTextarea code, it uses `textareaProps` which is the spread of remaining props. The `onFocus` and `onBlur` handlers will be passed through via `{...textareaProps}` on the `<textarea>` element. So we just add them directly:

```tsx
<PromptTextarea
  ref={textareaRef}
  value={value}
  onChange={setValue}
  skills={skills}
  onEnterKey={handleEnterKey}
  onKeyDown={handleKeyDown}
  enableCompletion={completionSetting?.enabled ?? false}
  projectId={projectId}
  getCompletionContextBeforePrompt={getCompletionContextBeforePrompt}
  projectRoot={projectRoot}
  enableFilePathAutocomplete
  images={supportsImages ? images : undefined}
  onImageAttach={supportsImages ? handleImageAttach : undefined}
  onImageRemove={supportsImages ? handleImageRemove : undefined}
  placeholder={
    isRunning
      ? 'Type to queue a follow-up... (Esc twice to stop)'
      : placeholder
  }
  disabled={disabled && !isRunning}
  onFocus={() => onFocusChange?.(true)}
  onBlur={() => onFocusChange?.(false)}
/>
```

**Step 2: Restyle Send/Queue button with gradient + glow**

Replace the send/queue button (lines 155-192):

```tsx
{/* Send/Queue button */}
<button
  onClick={handleSubmit}
  disabled={
    (!value.trim() && images.length === 0) || (disabled && !isRunning)
  }
  className={clsx(
    'flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
    isRunning
      ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400 hover:shadow-lg hover:shadow-amber-500/40'
      : 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-md shadow-blue-500/25 hover:from-blue-400 hover:to-purple-400 hover:shadow-lg hover:shadow-blue-500/40 hover:scale-105',
  )}
  aria-label={isRunning ? 'Queue this message' : 'Send message'}
  title={
    isRunning
      ? `Queue message (${formatKeyForDisplay('cmd+enter')})`
      : `Send message (${formatKeyForDisplay('cmd+enter')})`
  }
>
  {isRunning ? (
    <>
      <ListPlus className="h-4 w-4" aria-hidden />
      <span className="text-sm font-medium">Queue</span>
      <Kbd
        shortcut="cmd+enter"
        className="border-white/25 bg-white/10 text-white/90"
      />
    </>
  ) : (
    <>
      <Send className="h-4 w-4" aria-hidden />
      <span className="text-sm font-medium">Send</span>
      <Kbd
        shortcut="cmd+enter"
        className="border-white/25 bg-white/10 text-white/90"
      />
    </>
  )}
</button>
```

**Step 3: Restyle Stop button with gradient + glow**

Replace the stop button (lines 193-211):

```tsx
{isRunning && onStop && (
  <button
    onClick={onStop}
    disabled={isStopping}
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-md shadow-red-500/25 transition-all duration-200 hover:from-red-400 hover:to-rose-400 hover:shadow-lg hover:shadow-red-500/40 hover:scale-105 disabled:opacity-50"
    aria-label={isStopping ? 'Stopping agent' : 'Stop agent'}
    title={
      isStopping
        ? 'Stopping agent...'
        : `Stop agent (${formatKeyForDisplay('escape')} twice)`
    }
  >
    {isStopping ? (
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    ) : (
      <Square className="h-5 w-5" aria-hidden />
    )}
  </button>
)}
```

**Step 4: Verify it compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/agent/ui-message-input/index.tsx
git commit -m "style: gradient buttons + thread focus state for prompt input"
```

---

### Task 4: Polish textarea appearance

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx` (line ~780-781)

**Step 1: Update textarea classes**

Current (line 780-781):
```tsx
'min-h-[40px] w-full resize-none rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm leading-[20px] text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
```

Replace with:
```tsx
'min-h-[40px] w-full resize-none rounded-lg border border-neutral-700/50 bg-neutral-900/50 px-3 py-2 text-sm leading-[20px] text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:ring-1 focus:ring-white/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
```

Key changes:
- Border: `border-neutral-600` → `border-neutral-700/50` (more subtle, since card border is the main border)
- Background: `bg-neutral-900` → `bg-neutral-900/50` (slightly transparent to blend with card)
- Focus border: `focus:border-blue-500` → `focus:border-neutral-600` (subtle — the card border handles the accent)
- Focus ring: `focus:ring-2 focus:ring-blue-500/50` → `focus:ring-1 focus:ring-white/10` (thin subtle ring)

**Step 2: Verify it compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/common/ui-prompt-textarea/index.tsx
git commit -m "style: subtle textarea styling to complement gradient card border"
```

---

### Task 5: Final verification

**Step 1: Run full lint with auto-fix**

Run: `pnpm install && pnpm lint --fix`
Expected: No errors or only auto-fixable ones.

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Run lint again (check for remaining issues)**

Run: `pnpm lint`
Expected: PASS

**Step 4: Final commit (if lint changed anything)**

```bash
git add -A
git commit -m "style: lint fixes for prompt input restyle"
```
