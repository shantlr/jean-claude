# Prompt-Grouped Message Stream

## Problem

The current message stream shows all normalized messages in a mostly flat list. Users are rarely interested in the tiny details of every tool call. The stream needs to be reorganized so each user prompt acts as a collapsible group containing all following work, making the conversation scannable at a high level.

## Design

### Data Model — PromptGroup

A new grouping type introduced in the message merger:

```typescript
type PromptGroup = {
  kind: 'prompt-group';
  promptEntry: NormalizedEntry;        // The user-prompt that starts this group
  childMessages: DisplayMessage[];     // All messages until next prompt/result
  resultEntry?: NormalizedEntry;       // The result entry (if completed)
  status: 'running' | 'completed' | 'error' | 'interrupted';
};
```

### Two-Stage Merger Pipeline

1. **Stage 1** (existing): Flat `NormalizedEntry[]` → `DisplayMessage[]` (subagent/skill grouping unchanged)
2. **Stage 2** (new): `DisplayMessage[]` → `(DisplayMessage | PromptGroup)[]` — splits on `user-prompt` entries, attaches `result` entries as group terminators

Messages before the first prompt pass through as-is.

### Rendering States

**Collapsed (default for completed groups):**
- Prompt text (truncated) as header
- Result summary line: duration, tokens, cost

**Running (always shows activity line, not full timeline):**
- Prompt text as header
- Single live-updating activity line showing current work
- Active subagents surface with their own nested last-activity

**Error/Interrupted (stays expanded with full timeline):**
- Prompt text as header
- Full child timeline visible
- Error entry highlighted

**User can toggle any group open/closed regardless of status.**

### Activity Line Priority (for running groups)

1. Active subagent(s) — show with nested last-activity; multiple stacked if concurrent
2. Active skill — skill name + inner activity
3. Pending tool — most recent tool-use without result
4. Last completed tool — most recent tool-use with result
5. Assistant message — truncated preview
6. Thinking — "Thinking..."
7. Fallback — "Working..."

### Permission/Question Handling

Permission requests and question banners remain at the bottom of the stream (outside groups). The running group's activity line shows "Waiting for permission..." status.

## Files to Change

1. **`src/features/agent/ui-message-stream/message-merger.ts`** — Add `PromptGroup` type and `groupByPrompts()` stage 2 function
2. **New: `src/features/agent/ui-message-stream/ui-prompt-group-entry/index.tsx`** — Collapsible group component with collapsed/running/expanded/error states
3. **`src/features/agent/ui-message-stream/last-activity.ts`** — Extend to handle surfacing active subagents with nested activity
4. **`src/features/agent/ui-message-stream/index.tsx`** — Call `groupByPrompts()` after `mergeSkillMessages()`, render `PromptGroupEntry`
5. **`src/features/agent/ui-message-stream/ui-timeline-entry/`** — Minor: result entry rendering adaptation for summary line use

Store, normalizers, event pipeline, and backend are untouched. This is purely a rendering-layer change.
