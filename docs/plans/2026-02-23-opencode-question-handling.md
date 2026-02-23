# OpenCode Question Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up OpenCode's `question` tool so it triggers the same interactive question flow as Claude Code's `AskUserQuestion` — pause task, show dialog, send answer back.

**Architecture:** The normalizer maps `question` → `ask-user-question` for timeline rendering. The backend detects question entries post-normalization and emits a `question` AgentEvent that triggers the existing interactive flow. `respondToQuestion()` sends the user's answer as a follow-up prompt via `client.session.prompt()`.

**Tech Stack:** TypeScript, OpenCode SDK (`@opencode-ai/sdk`), existing AgentEvent/NormalizationEvent types.

**Design doc:** `docs/plans/2026-02-23-opencode-question-handling-design.md`

---

### Task 1: Normalizer — add `question` case in `mapOpenCodeTool()`

**Files:**
- Modify: `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts:630-643` (before `default:`)

**Step 1: Add `question` case in `mapOpenCodeTool()`**

In `mapOpenCodeTool()`, add a new case before the `default:` fallback (after the `todowrite` case at line 635):

```typescript
    case 'question':
    case 'ask-user-question':
    case 'askuserquestion':
      return {
        name: 'ask-user-question',
        input: {
          questions: extractOpenCodeQuestions(input),
        },
      };
```

**Step 2: Add `extractOpenCodeQuestions()` helper**

Add after the existing `extractOpenCodeTodos()` function (around line 873):

```typescript
function extractOpenCodeQuestions(
  input: Record<string, unknown>,
): Array<{
  question: string;
  header: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description: string }>;
}> {
  const questions = input.questions;
  if (!Array.isArray(questions)) return [];
  return (questions as unknown[]).map((q) => {
    const obj = q as Record<string, unknown>;
    return {
      question: str(obj.question),
      header: str(obj.header),
      multiSelect: obj.multiSelect === true ? true : undefined,
      options: Array.isArray(obj.options)
        ? (obj.options as unknown[]).map((o) => {
            const opt = o as Record<string, unknown>;
            return {
              label: str(opt.label),
              description: str(opt.description),
            };
          })
        : [],
    };
  });
}
```

**Step 3: Add result mapping in `mapToolResult()`**

In `mapToolResult()` (around line 648), add a case for `ask-user-question`:

```typescript
    case 'ask-user-question':
      return { answers: [] };
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: No type errors

**Step 5: Commit**

```bash
git add electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts
git commit -m "feat: map OpenCode question tool to ask-user-question in normalizer"
```

---

### Task 2: Backend — add `pendingQuestionCallId` to session state

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:86-111` (OpenCodeSessionState interface)
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:165-181` (state initialization in `start()`)

**Step 1: Add field to `OpenCodeSessionState`**

Add after `messageIndex: number;` (line 110):

```typescript
  /** CallID of the pending question tool (for dedup — only emit question AgentEvent once) */
  pendingQuestionCallId: string | null;
```

**Step 2: Initialize in `start()`**

In the state initialization object (around line 165), add:

```typescript
      pendingQuestionCallId: null,
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No type errors

**Step 4: Commit**

```bash
git add electron/services/agent-backends/opencode/opencode-backend.ts
git commit -m "feat: add pendingQuestionCallId to OpenCode session state"
```

---

### Task 3: Backend — detect question entries in `mapEvent()` and emit question AgentEvent

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:22-29` (imports)
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:675-688` (post-normalizer section of `mapEvent()`)

**Step 1: Add import for `NormalizedQuestionRequest` and `NormalizedQuestion`**

Update the import block at line 22-29:

```typescript
import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
  AgentTaskContext,
  NormalizedPermissionResponse,
  NormalizedQuestion,
  NormalizedQuestionRequest,
} from '@shared/agent-backend-types';
```

**Step 2: Add question detection after the NormalizationEvents → AgentEvents conversion**

Replace the section at lines 676-688 (the `return normEvents.map(...)` block) with:

```typescript
    // --- Convert NormalizationEvents → AgentEvents ---
    // Only 'entry' needs special handling (add rawMessageId);
    // all other variants are structurally compatible.
    const agentEvents: AgentEvent[] = normEvents.map((ne): AgentEvent => {
      if (ne.type === 'entry') {
        return {
          ...ne,
          rawMessageId,
        };
      }
      return ne as AgentEvent;
    });

    // --- Post-conversion: detect question tool entries and emit question AgentEvent ---
    // When OpenCode's `question` tool appears with populated questions,
    // emit a question AgentEvent so the agent-service shows the interactive dialog.
    // Only emit once per callID (dedup via pendingQuestionCallId).
    for (const ae of agentEvents) {
      if (
        (ae.type === 'entry' || ae.type === 'entry-update') &&
        ae.entry.type === 'tool-use' &&
        ae.entry.name === 'ask-user-question' &&
        state.pendingQuestionCallId !== ae.entry.toolId
      ) {
        const askEntry = ae.entry as {
          toolId: string;
          name: 'ask-user-question';
          input: {
            questions: Array<{
              question: string;
              header: string;
              multiSelect?: boolean;
              options: Array<{ label: string; description: string }>;
            }>;
          };
        };
        if (askEntry.input.questions.length > 0) {
          state.pendingQuestionCallId = askEntry.toolId;
          const questions: NormalizedQuestion[] =
            askEntry.input.questions.map((q) => ({
              question: q.question,
              header: q.header,
              multiSelect: q.multiSelect ?? false,
              options: q.options.map((o) => ({
                label: o.label,
                description: o.description,
              })),
            }));
          agentEvents.push({
            type: 'question',
            request: {
              requestId: askEntry.toolId,
              questions,
            } satisfies NormalizedQuestionRequest,
          });
        }
      }
    }

    return agentEvents;
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No type errors

**Step 4: Commit**

```bash
git add electron/services/agent-backends/opencode/opencode-backend.ts
git commit -m "feat: detect OpenCode question tool and emit question AgentEvent"
```

---

### Task 4: Backend — implement `respondToQuestion()` via follow-up prompt

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:263-274` (respondToQuestion method)

**Step 1: Implement `respondToQuestion()`**

Replace the existing no-op method (lines 263-274) with:

```typescript
  async respondToQuestion(
    sessionId: string,
    _requestId: string,
    answer: Record<string, string>,
  ): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      dbg.agent(
        'OpenCodeBackend.respondToQuestion — no session %s',
        sessionId,
      );
      return;
    }

    // Format the user's answers as a human-readable follow-up prompt
    const answerLines = Object.entries(answer)
      .map(([question, response]) => `"${question}"="${response}"`)
      .join(', ');
    const promptText = `User answered: ${answerLines}`;

    // Clear pending question state
    state.pendingQuestionCallId = null;

    // Send the answer as a follow-up prompt
    const { client } = await getOrCreateServer();
    dbg.agent(
      'OpenCodeBackend.respondToQuestion sending follow-up prompt for %s',
      sessionId,
    );

    // Fire and forget — events arrive via SSE stream which is still running.
    // Store the promise for error handling.
    client.session
      .prompt({
        path: { id: sessionId },
        query: { directory: state.cwd },
        body: {
          parts: [{ type: 'text' as const, text: promptText }],
        },
      })
      .catch((error) => {
        dbg.agent(
          'OpenCodeBackend.respondToQuestion prompt error for %s: %O',
          sessionId,
          error,
        );
      });
  }
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add electron/services/agent-backends/opencode/opencode-backend.ts
git commit -m "feat: implement respondToQuestion via follow-up prompt for OpenCode"
```

---

### Task 5: Docs — update example.md with correct normalized name

**Files:**
- Modify: `docs/agent-messages/opencode/example.md:392-498`

**Step 1: Update description paragraph**

Replace line 396:
```
Currently falls through the default case in the normalizer (mapped as generic `name: "question"` tool use).
```
With:
```
Normalized to `ask-user-question` — same as Claude's AskUserQuestion — triggering the interactive question dialog.
```

**Step 2: Update normalized entry JSON**

Replace line 471:
```json
  "name": "question",
```
With:
```json
  "name": "ask-user-question",
```

**Step 3: Update key differences section**

Replace lines 493-498:
```markdown
### Key differences from Claude's AskUserQuestion

- OpenCode tool name is `"question"` (Claude uses `"AskUserQuestion"`)
- Input structure is identical: `questions` array with `header`, `question`, `options`
- Options have the same `label` + `description` shape
- Currently normalized as generic `name: "question"` (not mapped to `ask-user-question`)
```
With:
```markdown
### Key differences from Claude's AskUserQuestion

- OpenCode raw tool name is `"question"` (Claude uses `"AskUserQuestion"`) — both normalize to `ask-user-question`
- Input structure is identical: `questions` array with `header`, `question`, `options`
- Options have the same `label` + `description` shape
- Response mechanism differs: Claude resolves via SDK's `canUseTool` callback; OpenCode receives the answer as a follow-up `session.prompt()`
```

**Step 4: Commit**

```bash
git add docs/agent-messages/opencode/example.md
git commit -m "docs: update OpenCode question example to reflect ask-user-question normalization"
```

---

### Task 6: Lint and verify

**Step 1: Run lint with auto-fix**

Run: `pnpm lint --fix`
Expected: No errors

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Fix any issues and commit**

If lint/ts-check produces errors, fix them and commit:

```bash
git add -A
git commit -m "fix: lint and type fixes for OpenCode question handling"
```
