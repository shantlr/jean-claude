# OpenCode Question Handling Design

## Problem

OpenCode agents can call a `question` tool to ask the user multiple-choice questions (identical input shape to Claude Code's `AskUserQuestion`). Currently this tool falls through the normalizer's default case and renders as a passive tool-use card in the timeline. The interactive question dialog never appears, the task doesn't pause, and there's no way for the user to respond.

## Goal

Wire up OpenCode's `question` tool so it triggers the same interactive question flow as Claude Code's `AskUserQuestion`: pause the task, show the question dialog, send the user's answer back to OpenCode.

## Approach: Backend intercept + respond via follow-up prompt

### 1. Normalizer — map `question` → `ask-user-question`

**File:** `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts`

Add a `case 'question':` in `mapOpenCodeTool()` that maps to `ask-user-question`:

```typescript
case 'question':
  return {
    name: 'ask-user-question',
    input: {
      questions: extractOpenCodeQuestions(input),
    },
  };
```

Add `extractOpenCodeQuestions()` helper that converts `input.questions` array items to the normalized shape (`question`, `header`, `options`, `multiSelect`).

Add result mapping in `mapToolResult()` for `ask-user-question`.

This ensures the timeline entry renders with proper question card styling (teal, question/answer pairs).

### 2. Backend — detect question tool and emit `question` AgentEvent

**File:** `electron/services/agent-backends/opencode/opencode-backend.ts`

Add `pendingQuestionCallId: string | null` to `OpenCodeSessionState`.

In `mapEvent()`, after the normalizer runs, post-process the returned events: if any entry has `type: 'tool-use'` with `name: 'ask-user-question'` and populated `input.questions`, AND we haven't already emitted a question for this callID (`pendingQuestionCallId !== callID`):

- Set `pendingQuestionCallId = callID`
- Emit an additional `{ type: 'question', request: { requestId: callID, questions } }` AgentEvent

This triggers the agent-service's existing `case 'question':` handler which pauses the task, emits the IPC event, and shows the interactive question dialog.

Only emit once per callID to avoid duplicate dialogs on repeated `entry-update` events.

### 3. Backend — `respondToQuestion()` sends follow-up prompt

**File:** `electron/services/agent-backends/opencode/opencode-backend.ts`

Implement `respondToQuestion()`:

- Look up the session state
- Format the user's answers as a human-readable follow-up prompt (e.g. `User answered: "Scope?"="Hook + wiring (Recommended)"`)
- Send via `client.session.prompt()` with the same session ID
- Clear `pendingQuestionCallId`
- Store the follow-up prompt promise on session state for error handling

The existing SSE `for await` loop will naturally deliver events from the follow-up prompt. No changes needed to the event loop.

### 4. Edge cases

**Deduplication:** Track `pendingQuestionCallId` — only emit question AgentEvent on first sight of the question tool with populated input. Skip on subsequent `entry-update` events for the same callID.

**Follow-up prompt lifecycle:** The initial `promptPromise` has already resolved. The follow-up creates a second promise. Store it on session state and await/catch it so errors don't go unhandled.

**Question tool completion:** After the follow-up prompt, the original question tool part may get a `completed` state update. The normalizer emits an `entry-update` — the timeline card just updates to show completion. No special handling needed.

**Multiple questions in flight:** Handle one at a time (matches agent-service's existing pending request queue behavior).

## Files changed

| File | Change |
|------|--------|
| `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts` | Add `case 'question':` in `mapOpenCodeTool()`. Add `extractOpenCodeQuestions()` helper. Add result mapping in `mapToolResult()`. |
| `electron/services/agent-backends/opencode/opencode-backend.ts` | Add `pendingQuestionCallId` to session state. Post-process in `mapEvent()` to emit question AgentEvent. Implement `respondToQuestion()` via follow-up prompt. |
| `docs/agent-messages/opencode/example.md` | Update normalized entry to show `name: "ask-user-question"`. Update key differences section. |

## No changes needed

Agent service, IPC handlers, UI components, shared types — the existing question flow handles everything once the backend emits the right `question` AgentEvent.
