# Codex AI Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex support to one-off AI generation slots, including task-name generation.

**Architecture:** Reuse existing Codex app-server JSON-RPC client. `generateText()` will add a Codex branch that starts a temporary thread, starts one turn, collects assistant message text from Codex notifications, parses structured JSON when requested, records usage, interrupts on abort, and returns final output.

**Tech Stack:** Electron main process, TypeScript, Vitest, Codex app-server JSON-RPC, existing `aiUsageTrackingService`.

---

### Task 1: Test Codex Structured Generation

**Files:**
- Modify: `electron/services/ai-generation-service.test.ts`
- Modify: `electron/services/ai-generation-service.ts`

**Step 1: Write failing test setup**

In `electron/services/ai-generation-service.test.ts`, add hoisted Codex server mock beside existing OpenCode mock:

```ts
const { getOrCreateServerMock, getOrCreateCodexAppServerMock, recordUsageSafeMock } =
  vi.hoisted(() => ({
    getOrCreateServerMock: vi.fn(),
    getOrCreateCodexAppServerMock: vi.fn(),
    recordUsageSafeMock: vi.fn(),
  }));

vi.mock('./agent-backends/codex/codex-app-server', () => ({
  getOrCreateCodexAppServer: getOrCreateCodexAppServerMock,
}));
```

Add helper:

```ts
function createMockCodexClient() {
  const listeners = new Set<(message: { method: string; params?: unknown }) => void>();
  return {
    request: vi.fn(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'turn/interrupt') return {};
      return {};
    }),
    onNotification: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(notification: { method: string; params?: unknown }) {
      for (const listener of listeners) listener(notification);
    },
  };
}
```

**Step 2: Write failing structured-output test**

Append:

```ts
describe('generateText codex structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed JSON text from Codex assistant output', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: '{"name":"add codex ai gen"}' },
    });
    client.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(promise).resolves.toEqual({ name: 'add codex ai gen' });
  });
});
```

**Step 3: Run test to verify failure**

Run: `pnpm test -- electron/services/ai-generation-service.test.ts`

Expected: FAIL because Codex generation returns `null`.

**Step 4: Implement minimal Codex branch skeleton**

In `electron/services/ai-generation-service.ts`:

- Import Codex app server:

```ts
import { getOrCreateCodexAppServer } from './agent-backends/codex/codex-app-server';
```

- Replace Codex switch branch:

```ts
case 'codex':
  return await generateWithCodex({
    model: resolvedModel,
    prompt,
    skillName,
    thinkingEffort: resolvedThinkingEffort,
    outputSchema,
    cwd,
    abortController,
    usageContext,
  });
```

**Step 5: Add `generateWithCodex()` minimal implementation**

Add below OpenCode generator:

```ts
async function generateWithCodex({
  model,
  prompt,
  skillName,
  outputSchema,
  cwd,
  abortController,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  outputSchema?: Record<string, unknown>;
  cwd?: string;
  abortController: AbortController;
  usageContext?: AiUsageContext;
}): Promise<unknown | null> {
  const { client } = await getOrCreateCodexAppServer();
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;
  const promptWithStructuredFallback = outputSchema
    ? `${effectivePrompt}\n\nRespond with ONLY a valid JSON object matching this schema (no markdown, no code fences):\n${JSON.stringify(outputSchema, null, 2)}`
    : effectivePrompt;

  const threadResult = await client.request('thread/start', {
    cwd: cwd ?? homedir(),
    serviceName: 'jean_claude',
  });
  const threadId = idFromCodexResult(threadResult, 'thread');
  if (!threadId) throw new Error('Codex thread/start did not return a thread id');

  let turnId: string | null = null;
  let text = '';

  const resultPromise = new Promise<unknown | null>((resolve, reject) => {
    const unsubscribe = client.onNotification((notification) => {
      if (!codexNotificationMatches(notification, threadId, turnId)) return;
      if (notification.method === 'item/agentMessage/delta') {
        const params = record(notification.params);
        text += typeof params?.delta === 'string' ? params.delta : '';
        return;
      }
      if (notification.method === 'item/completed') {
        const item = record(record(notification.params)?.item);
        const itemText = typeof item?.text === 'string' ? item.text : undefined;
        if ((item?.type === 'agentMessage' || item?.role === 'assistant') && itemText) {
          text = itemText;
        }
        return;
      }
      if (notification.method === 'turn/completed') {
        unsubscribe();
        resolve(outputSchema ? parseJsonResponse(text) : text.trim() || null);
      }
    });

    abortController.signal.addEventListener(
      'abort',
      () => {
        unsubscribe();
        if (turnId) {
          client.request('turn/interrupt', { threadId, turnId }).catch(() => {});
        }
        reject(new Error('Codex generation aborted'));
      },
      { once: true },
    );
  });

  const turnResult = await client.request('turn/start', {
    threadId,
    input: [{ type: 'text', text: promptWithStructuredFallback }],
    model: model === 'default' ? undefined : model,
  });
  turnId = idFromCodexResult(turnResult, 'turn');
  if (!turnId) throw new Error('Codex turn/start did not return a turn id');

  return resultPromise;
}
```

Add helpers:

```ts
function idFromCodexResult(result: unknown, key: 'thread' | 'turn'): string | null {
  const obj = record(result);
  const nested = record(obj?.[key]);
  return str(nested?.id) ?? str(obj?.[`${key}Id`]) ?? str(obj?.id) ?? null;
}

function codexNotificationMatches(
  notification: { params?: unknown },
  threadId: string,
  turnId: string | null,
): boolean {
  const params = record(notification.params);
  if (params?.threadId !== undefined && params.threadId !== threadId) return false;
  if (turnId !== null && params?.turnId !== undefined && params.turnId !== turnId) return false;
  return true;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
```

**Step 6: Run test to verify pass**

Run: `pnpm test -- electron/services/ai-generation-service.test.ts`

Expected: PASS.

---

### Task 2: Add Codex Text, Model, Abort, Usage Coverage

**Files:**
- Modify: `electron/services/ai-generation-service.test.ts`
- Modify: `electron/services/ai-generation-service.ts`

**Step 1: Add text output test**

Add test:

```ts
it('returns plain Codex assistant text when no schema is requested', async () => {
  const client = createMockCodexClient();
  getOrCreateCodexAppServerMock.mockResolvedValue({ client });

  const promise = generateText({
    backend: 'codex',
    model: 'gpt-5.1-codex',
    prompt: 'Summarize diff',
  });

  await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith('turn/start', expect.anything()));
  client.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: 'Summary text' } });
  client.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turnId: 'turn-1' } });

  await expect(promise).resolves.toBe('Summary text');
  expect(client.request).toHaveBeenCalledWith(
    'turn/start',
    expect.objectContaining({ model: 'gpt-5.1-codex' }),
  );
});
```

**Step 2: Add usage tracking test**

Add test:

```ts
it('records one-off Codex usage from turn completion', async () => {
  const client = createMockCodexClient();
  getOrCreateCodexAppServerMock.mockResolvedValue({ client });

  const promise = generateText({
    backend: 'codex',
    model: 'gpt-5.1-codex',
    prompt: 'Generate task name',
    usageContext: { feature: 'task-name', projectId: 'project-1', taskId: null, stepId: null },
  });

  await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith('turn/start', expect.anything()));
  client.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: 'codex task name' } });
  client.emit({
    method: 'turn/completed',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      model: 'gpt-5.1-codex',
      usage: { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
    },
  });

  await promise;
  expect(recordUsageSafeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      backend: 'codex',
      model: 'gpt-5.1-codex',
      allowEmptyUsage: true,
      context: expect.objectContaining({ feature: 'task-name' }),
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        cacheReadTokens: 3,
        cacheCreationTokens: 2,
      },
    }),
  );
});
```

**Step 3: Add abort test**

Add test:

```ts
it('interrupts Codex turn on timeout', async () => {
  vi.useFakeTimers();
  const client = createMockCodexClient();
  getOrCreateCodexAppServerMock.mockResolvedValue({ client });

  const promise = generateText({
    backend: 'codex',
    model: 'default',
    prompt: 'Generate task name',
    timeoutMs: 10,
  });

  await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith('turn/start', expect.anything()));
  await vi.advanceTimersByTimeAsync(11);

  await expect(promise).resolves.toBeNull();
  expect(client.request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' });
  vi.useRealTimers();
});
```

**Step 4: Run tests to verify failure**

Run: `pnpm test -- electron/services/ai-generation-service.test.ts`

Expected: FAIL until usage parsing and abort cleanup implemented.

**Step 5: Implement usage parsing**

In `generateWithCodex()`, when handling `turn/completed`, call:

```ts
recordCodexUsage({
  usageContext,
  model,
  params: record(notification.params),
});
```

Add helper:

```ts
function recordCodexUsage({
  usageContext,
  model,
  params,
}: {
  usageContext?: AiUsageContext;
  model: string;
  params?: Record<string, unknown>;
}) {
  if (!usageContext) return;
  const usage = record(params?.usage);
  aiUsageTrackingService.recordUsageSafe({
    context: usageContext,
    backend: 'codex',
    model: str(params?.model) ?? model,
    usage: {
      inputTokens: num(usage?.input_tokens) ?? num(usage?.inputTokens),
      outputTokens: num(usage?.output_tokens) ?? num(usage?.outputTokens),
      cacheReadTokens:
        num(usage?.cache_read_input_tokens) ?? num(usage?.cacheReadTokens),
      cacheCreationTokens:
        num(usage?.cache_creation_input_tokens) ?? num(usage?.cacheCreationTokens),
    },
    allowEmptyUsage: true,
  });
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
```

**Step 6: Tighten abort cleanup**

Refactor `generateWithCodex()` to keep `unsubscribe` and `onAbort` variables, remove listener on completion, call `turn/interrupt` if abort occurs after `turnId` exists.

Ensure `generateText()` catch path still returns `null` on timeout unless `throwOnError` is true.

**Step 7: Run tests to verify pass**

Run: `pnpm test -- electron/services/ai-generation-service.test.ts`

Expected: PASS.

---

### Task 3: Verify Task Name Uses Codex Slot

**Files:**
- Modify: `electron/services/name-generation-service.test.ts`

**Step 1: Add task-name Codex slot test**

Add test:

```ts
it('passes Codex slot config through to AI generation', async () => {
  resolveAiSkillSlotMock.mockResolvedValue({
    backend: 'codex',
    model: 'gpt-5.1-codex',
    thinkingEffort: 'minimal',
    skillName: null,
  });

  const name = await generateTaskName('add codex task name generation');

  expect(name).toBe('fix PR details split-pane scroll');
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      backend: 'codex',
      model: 'gpt-5.1-codex',
      prompt: expect.stringContaining('Task to name:'),
      outputSchema: expect.objectContaining({ properties: { name: { type: 'string', maxLength: 40 } } }),
    }),
  );
});
```

**Step 2: Run test**

Run: `pnpm test -- electron/services/name-generation-service.test.ts`

Expected: PASS; service already passes backend/model through.

---

### Task 4: Full Verification

**Files:**
- No file edits expected.

**Step 1: Install deps**

Run: `pnpm install`

Expected: completes without lockfile surprises unless dependencies changed externally.

**Step 2: Run test suite**

Run: `pnpm test`

Expected: PASS.

**Step 3: Auto-fix lint**

Run: `pnpm lint --fix`

Expected: completes; formatting/lint fixes applied if needed.

**Step 4: Type-check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Final lint**

Run: `pnpm lint`

Expected: PASS.

**Step 6: Manual smoke test**

In app:

1. Enable Codex backend.
2. Open Settings > AI Generation > Task Name.
3. Enable slot, choose Codex, choose model.
4. Create new task without name.
5. Confirm task name generated instead of remaining unnamed.

Expected: task name appears, no `Codex text generation is not implemented yet` log.

---

### Notes

- Keep change scoped to `ai-generation-service.ts` and tests.
- Do not add new settings or UI. UI already allows Codex as enabled backend.
- Do not touch changelogs.
- If Codex app-server expects different `thread/start` config fields than `cwd`, mirror `createCodexThreadConfig()` from `electron/services/agent-backends/codex/codex-backend.ts` instead of inventing new schema.
