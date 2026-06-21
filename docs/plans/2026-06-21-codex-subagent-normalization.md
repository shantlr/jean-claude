# Codex Subagent Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize Codex `collabAgentToolCall` messages into Jean-Claude subagent cards instead of generic `codex-tool` entries.

**Architecture:** Keep the change inside the Codex message normalizer. Add small state to map Codex receiver thread IDs to the parent subagent tool ID, then emit/update existing normalized `sub-agent` tool-use entries. Use existing UI grouping via `parentToolId`; avoid renderer changes unless tests prove a gap.

**Tech Stack:** TypeScript, Vitest, Codex JSON-RPC notifications, shared normalized message v2 schema.

---

### Task 1: Normalize Completed Codex Spawn Agent Calls

**Files:**
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`

**Step 1: Write failing test**

Add test near existing Codex tool tests:

```ts
it('emits a sub-agent tool use for completed Codex spawnAgent calls', () => {
  const ctx = createCodexNormalizationContext();

  expect(
    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child'],
            prompt: 'Review the diff carefully.\nReturn findings only.',
            model: 'gpt-5.5',
            reasoningEffort: 'medium',
          },
        },
      },
      ctx,
    ),
  ).toEqual([
    {
      type: 'entry',
      entry: expect.objectContaining({
        id: 'call-spawn',
        type: 'tool-use',
        toolId: 'call-spawn',
        name: 'sub-agent',
        input: {
          agentType: 'gpt-5.5',
          description: 'Review the diff carefully.',
          prompt: 'Review the diff carefully.\nReturn findings only.',
        },
      }),
    },
  ]);
});
```

**Step 2: Run test to verify fail**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: FAIL because entry is currently `name: "codex-tool"`.

**Step 3: Implement minimal mapping**

In `CodexNormalizationContext`, add:

```ts
subagentToolIdsByThreadId: Map<string, string>;
```

Initialize in `createCodexNormalizationContext()`.

Add before generic fallback in `createToolEntry()`:

```ts
if (type === 'collabAgentToolCall') {
  return createCollabAgentToolEntry(item, itemId);
}
```

Add helper:

```ts
function createCollabAgentToolEntry(
  item: Record<string, unknown>,
  itemId: string,
): ToolUseEntry | undefined {
  if (str(item.tool) !== 'spawnAgent') return undefined;

  const prompt = str(item.prompt) ?? '';
  const receiverThreadIds = stringArray(item.receiverThreadIds);
  if (prompt.trim() === '' || receiverThreadIds.length === 0) return undefined;

  return {
    id: itemId,
    date: dateFromItem(item),
    type: 'tool-use',
    toolId: itemId,
    name: 'sub-agent',
    input: {
      agentType: str(item.model) || 'Codex',
      description: firstLine(prompt) || 'Codex subagent',
      prompt,
    },
  };
}
```

Add helpers:

```ts
function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
```

**Step 4: Register receiver thread mapping**

In `normalizeItemCompleted()`, after creating a sub-agent entry for `collabAgentToolCall`, store:

```ts
for (const threadId of stringArray(item.receiverThreadIds)) {
  ctx.subagentToolIdsByThreadId.set(threadId, entryWithResult.toolId);
}
```

Guard with `entryWithResult.type === 'tool-use' && entryWithResult.name === 'sub-agent'`.

**Step 5: Run test**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: PASS.

**Step 6: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "feat: normalize Codex spawn agents"
```

---

### Task 2: Attach Codex Wait Results To Spawned Subagent

**Files:**
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`

**Step 1: Write failing test**

```ts
it('updates the spawned Codex sub-agent with wait output', () => {
  const ctx = createCodexNormalizationContext();

  normalizeCodexNotification(
    {
      method: 'item/completed',
      params: {
        item: {
          id: 'call-spawn',
          type: 'collabAgentToolCall',
          tool: 'spawnAgent',
          status: 'completed',
          receiverThreadIds: ['thread-child'],
          prompt: 'Review diff',
          model: 'gpt-5.5',
        },
      },
    },
    ctx,
  );

  expect(
    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-wait',
            type: 'collabAgentToolCall',
            tool: 'wait',
            status: 'completed',
            receiverThreadIds: ['thread-child'],
            agentsStates: {
              'thread-child': {
                status: 'completed',
                message: 'Important finding',
              },
            },
          },
        },
      },
      ctx,
    ),
  ).toEqual([
    {
      type: 'entry-update',
      entry: expect.objectContaining({
        id: 'call-spawn',
        name: 'sub-agent',
        result: { output: 'Important finding' },
      }),
    },
  ]);
});
```

**Step 2: Run test to verify fail**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: FAIL, no update emitted.

**Step 3: Implement wait update**

In `normalizeItemCompleted()`, before existing-entry handling, add branch:

```ts
const collabUpdate = normalizeCollabAgentCompletion(item, ctx);
if (collabUpdate.length > 0) return collabUpdate;
```

Add helper:

```ts
function normalizeCollabAgentCompletion(
  item: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  if (str(item.type) !== 'collabAgentToolCall') return [];
  if (str(item.tool) !== 'wait' && str(item.tool) !== 'closeAgent') return [];

  const output = collabAgentOutput(item);
  if (output === undefined) return [];

  const updates: NormalizationEvent[] = [];
  for (const threadId of stringArray(item.receiverThreadIds)) {
    const toolId = ctx.subagentToolIdsByThreadId.get(threadId);
    if (toolId === undefined) continue;

    const existing = ctx.itemEntries.get(toolId);
    if (existing?.type !== 'tool-use' || existing.name !== 'sub-agent') {
      continue;
    }

    const entry: ToolUseEntry = {
      ...existing,
      result: { output },
    };
    ctx.itemEntries.set(toolId, entry);
    updates.push({ type: 'entry-update', entry });
  }
  return updates;
}
```

Add helper:

```ts
function collabAgentOutput(item: Record<string, unknown>): string | undefined {
  const states = record(item.agentsStates);
  if (states === undefined) return undefined;

  for (const state of Object.values(states)) {
    const message = str(record(state)?.message);
    if (message !== undefined && message.trim() !== '') return message;
  }

  return undefined;
}
```

**Step 4: Run test**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "feat: attach Codex subagent results"
```

---

### Task 3: Parent Child Thread Messages

**Files:**
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`

**Step 1: Write failing test**

```ts
it('links child Codex thread messages to the parent sub-agent tool id', () => {
  const ctx = createCodexNormalizationContext();

  normalizeCodexNotification(
    {
      method: 'item/completed',
      params: {
        item: {
          id: 'call-spawn',
          type: 'collabAgentToolCall',
          tool: 'spawnAgent',
          status: 'completed',
          receiverThreadIds: ['thread-child'],
          prompt: 'Review diff',
        },
      },
    },
    ctx,
  );

  expect(
    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          threadId: 'thread-child',
          item: { id: 'child-msg', type: 'agentMessage', text: 'Working' },
        },
      },
      ctx,
    ),
  ).toEqual([
    {
      type: 'entry',
      entry: expect.objectContaining({
        id: 'child-msg',
        type: 'assistant-message',
        parentToolId: 'call-spawn',
      }),
    },
  ]);
});
```

**Step 2: Run test to verify fail**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: FAIL, missing `parentToolId`.

**Step 3: Add parent lookup**

Add helper:

```ts
function parentToolIdFromParams(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): string | undefined {
  const threadId = str(params.threadId) ?? str(params.thread_id);
  return threadId === undefined
    ? undefined
    : ctx.subagentToolIdsByThreadId.get(threadId);
}
```

In `normalizeItemStarted()` and `normalizeItemCompleted()`, compute:

```ts
const parentToolId = parentToolIdFromParams(params, ctx);
```

Pass parent ID into entry creation helpers or spread it when building entries:

```ts
...(parentToolId === undefined ? {} : { parentToolId }),
```

Apply to assistant, user prompt, thinking, bash, edit, and fallback tool entries.

**Step 4: Run tests**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "feat: link Codex subagent child messages"
```

---

### Task 4: Normalize Codex Web Search Items

**Files:**
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`

**Step 1: Write failing tests**

```ts
it('emits web-search for Codex webSearch search actions', () => {
  const ctx = createCodexNormalizationContext();

  expect(
    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'ws-search',
            type: 'webSearch',
            query: 'oxlint react compiler',
            action: { type: 'search' },
          },
        },
      },
      ctx,
    ),
  ).toEqual([
    {
      type: 'entry',
      entry: expect.objectContaining({
        id: 'ws-search',
        type: 'tool-use',
        toolId: 'ws-search',
        name: 'web-search',
        input: { query: 'oxlint react compiler' },
      }),
    },
  ]);
});

it('ignores empty Codex webSearch placeholder actions', () => {
  const ctx = createCodexNormalizationContext();

  expect(
    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'ws-placeholder',
            type: 'webSearch',
            query: '',
            action: { type: 'other' },
          },
        },
      },
      ctx,
    ),
  ).toEqual([]);
});
```

**Step 2: Run tests to verify fail**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: FAIL because both currently fall through to `codex-tool`.

**Step 3: Implement mapping**

Add before generic fallback:

```ts
if (type === 'webSearch') {
  return createWebSearchEntry(item, itemId);
}
```

Add helper:

```ts
function createWebSearchEntry(
  item: Record<string, unknown>,
  itemId: string,
): ToolUseEntry | undefined {
  const action = record(item.action);
  const actionType = str(action?.type);
  const query = str(item.query) ?? '';
  const url = str(action?.url);

  if (actionType === 'openPage' && url !== undefined) {
    return {
      id: itemId,
      date: dateFromItem(item),
      type: 'tool-use',
      toolId: itemId,
      name: 'web-fetch',
      input: { url, prompt: query },
    };
  }

  if (query.trim() === '') return undefined;

  return {
    id: itemId,
    date: dateFromItem(item),
    type: 'tool-use',
    toolId: itemId,
    name: 'web-search',
    input: { query },
  };
}
```

**Step 4: Run tests**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "feat: normalize Codex web search tools"
```

---

### Task 5: Regression Check Against Real Sample

**Files:**
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`

**Step 1: Add compact sample regression**

Use only minimal sample data, not full exported JSON:

```ts
it('normalizes real Codex collab agent sample flow', () => {
  const ctx = createCodexNormalizationContext();

  const spawn = normalizeCodexNotification(
    {
      method: 'item/completed',
      params: {
        item: {
          type: 'collabAgentToolCall',
          id: 'call_R0QmTpweUUCQwbzrauqog4LD',
          tool: 'spawnAgent',
          status: 'completed',
          receiverThreadIds: ['019ee9da-8c31-7d52-a368-1d2d530d4fdb'],
          prompt: 'Code review request for uncommitted working tree changes.',
          model: 'gpt-5.5',
          reasoningEffort: 'medium',
          agentsStates: {
            '019ee9da-8c31-7d52-a368-1d2d530d4fdb': {
              status: 'pendingInit',
              message: null,
            },
          },
        },
      },
    },
    ctx,
  );

  const wait = normalizeCodexNotification(
    {
      method: 'item/completed',
      params: {
        item: {
          type: 'collabAgentToolCall',
          id: 'call_gOg8ufrFZNodWuLD4y1UnBJ3',
          tool: 'wait',
          status: 'completed',
          receiverThreadIds: ['019ee9da-8c31-7d52-a368-1d2d530d4fdb'],
          agentsStates: {
            '019ee9da-8c31-7d52-a368-1d2d530d4fdb': {
              status: 'completed',
              message: '**Critical**\nNone.',
            },
          },
        },
      },
    },
    ctx,
  );

  expect(spawn[0]).toMatchObject({
    type: 'entry',
    entry: { name: 'sub-agent', toolId: 'call_R0QmTpweUUCQwbzrauqog4LD' },
  });
  expect(wait[0]).toMatchObject({
    type: 'entry-update',
    entry: {
      toolId: 'call_R0QmTpweUUCQwbzrauqog4LD',
      result: { output: '**Critical**\nNone.' },
    },
  });
});
```

**Step 2: Run focused tests**

Run:

```bash
pnpm test electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts -- --runInBand
```

Expected: PASS.

**Step 3: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "test: cover Codex collab agent sample flow"
```

---

### Task 6: Required Repository Verification

**Files:**
- No source edits unless verification finds failures.

**Step 1: Install dependencies**

Run:

```bash
pnpm install
```

Expected: completes without lockfile surprises.

**Step 2: Run tests**

Run:

```bash
pnpm test
```

Expected: all tests pass.

**Step 3: Auto-fix lint**

Run:

```bash
pnpm lint --fix
```

Expected: completes; review changed files.

**Step 4: Type check**

Run:

```bash
pnpm ts-check
```

Expected: no TypeScript errors.

**Step 5: Final lint**

Run:

```bash
pnpm lint
```

Expected: no remaining lint errors.

**Step 6: Commit verification fixes if any**

```bash
git status --short
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "fix: address Codex normalization verification"
```

Skip commit if no files changed.
