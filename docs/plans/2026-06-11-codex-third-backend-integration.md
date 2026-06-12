# Codex Third Backend Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenAI Codex as a third first-class Jean-Claude agent backend with task execution, models, config, skills/MCP, availability, and optional Codex thread management.

**Architecture:** Implement Codex through the existing `AgentBackend` abstraction. Spawn `codex app-server` as a long-lived stdio JSON-RPC process, map Codex thread/turn/item notifications into Jean-Claude `AgentEvent`s, and keep all renderer/database surfaces backend-agnostic by adding `codex` to existing backend registries.

**Tech Stack:** Electron main process, TypeScript, Vitest, Codex App Server JSON-RPC over stdio, React 19, TanStack Query, Zustand.

---

## Scope

Build in phases. Ship core task backend first, then full surface.

In scope:

- Third backend id: `codex`
- Codex App Server stdio JSON-RPC client
- Text/image prompt submission where Codex model supports image input
- Session resume via Codex `thread.id`
- Stop via `turn/interrupt`
- Permission request passthrough into Jean-Claude permission UI
- Model discovery via `model/list`
- Config settings for `~/.codex/config.toml`
- Skill/MCP management through Codex App Server APIs where possible
- Backend picker/source/settings UI support
- Optional Codex thread list/read/archive surface behind a later feature flag

Out of scope for first shippable PR:

- WebSocket transport
- Bundling/pinning Codex binary
- Importing all Codex global history into Jean-Claude tasks automatically
- Replacing Jean-Claude permissions with Codex permission profiles

---

## Current Code Map

- Backend abstraction: `shared/agent-backend-types.ts`
- Backend registry: `electron/services/agent-backends/index.ts`
- Agent orchestration: `electron/services/agent-service.ts`
- Claude adapter: `electron/services/agent-backends/claude/claude-code-backend.ts`
- OpenCode adapter: `electron/services/agent-backends/opencode/opencode-backend.ts`
- Normalized event schema: `shared/normalized-message-v2.ts`
- Model discovery: `electron/services/backend-models-service.ts`
- Backend config settings: `electron/services/backend-config-settings-service.ts`
- Skill management: `electron/services/skill-management-service.ts`
- Agent management: `electron/services/agent-management-service.ts`
- Source install backend checks: `src/features/settings/ui-sources-settings/index.tsx`
- Backend pickers: `src/features/task/ui-task-panel/add-step-dialog.tsx`, `src/features/task/ui-task-panel/index.tsx`, `src/routes/projects/$projectId/tasks/new.tsx`
- Sources settings: `src/features/settings/ui-sources-settings/index.tsx`
- API typings: `src/lib/api.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`

---

## Codex App Server Mapping

Use stable APIs first:

| Codex API | Jean-Claude use |
|---|---|
| `initialize` + `initialized` | process handshake |
| `thread/start` | new backend session |
| `thread/resume` | resume `config.sessionId` |
| `turn/start` | submit prompt parts |
| `turn/interrupt` | `AgentBackend.stop()` |
| `model/list` | model picker |
| `config/read` | config validation/status |
| `skills/list` | Codex skill listing |
| `skills/config/write` | Codex skill enable/disable |
| `config/mcpServer/reload` | MCP reload after config changes |
| `mcpServerStatus/list` | MCP status display |
| `thread/list/read/archive/unarchive` | optional Codex thread browser |

Event mapping target:

| Codex notification | Jean-Claude event |
|---|---|
| `thread/started` | `session-id` with `thread.id` |
| `item/started` user message | `entry` / `user-prompt` |
| `item/agentMessage/delta` | `entry-update` assistant message |
| `item/completed` agent message | final `entry-update` or `entry` |
| command execution item | `tool-use` / `bash` |
| file change item | `file-edited`, `write`, or `edit` tool entry |
| approval request | `permission-request` |
| `turn/completed` | `complete` |
| errors | `error` or `rate-limit` |

---

### Task 1: Add Backend Type And Compile Breakages

**Files:**

- Modify: `shared/agent-backend-types.ts`
- Modify: `electron/services/agent-backends/index.ts`
- Modify as compile failures require: backend label/picker files under `src/` and `electron/services/`
- Test: existing `pnpm ts-check`

**Step 1: Update backend union**

Change:

```ts
export type AgentBackendType = 'claude-code' | 'opencode';
```

To:

```ts
export type AgentBackendType = 'claude-code' | 'opencode' | 'codex';
```

**Step 2: Add placeholder backend class**

Create `electron/services/agent-backends/codex/codex-backend.ts`:

```ts
import type {
  AgentBackend,
  AgentBackendConfig,
  AgentSession,
  AgentTaskContext,
  NormalizedPermissionResponse,
  PromptPart,
} from '@shared/agent-backend-types';
import type { InteractionMode } from '@shared/types';

export class CodexBackend implements AgentBackend {
  constructor(private readonly _context: AgentTaskContext) {}

  async start(_config: AgentBackendConfig, _parts: PromptPart[]): Promise<AgentSession> {
    throw new Error('Codex backend is not implemented yet');
  }

  async stop(_sessionId: string): Promise<void> {}

  async respondToPermission(
    _sessionId: string,
    _requestId: string,
    _response: NormalizedPermissionResponse,
  ): Promise<void> {}

  async respondToQuestion(
    _sessionId: string,
    _requestId: string,
    _answer: Record<string, string>,
  ): Promise<void> {}

  async setMode(_sessionId: string, _mode: InteractionMode): Promise<void> {}

  async dispose(): Promise<void> {}
}
```

**Step 3: Register backend**

In `electron/services/agent-backends/index.ts` import `CodexBackend` and add:

```ts
codex: CodexBackend,
```

**Step 4: Run typecheck**

Run: `pnpm ts-check`

Expected: FAIL with exhaustive `Record<AgentBackendType, ...>` sites missing `codex`.

**Step 5: Patch compile-only backend labels**

Add Codex entries where TypeScript requires exhaustive records. Use label `Codex`. Keep behavior conservative; no functional implementation yet.

**Step 6: Verify**

Run: `pnpm ts-check`

Expected: PASS or only unrelated existing errors.

**Step 7: Commit**

Run only when user requested commits:

```bash
git add shared/agent-backend-types.ts electron/services/agent-backends src electron/services
git commit -m "feat(codex): register backend type"
```

---

### Task 2: Build Codex JSON-RPC Stdio Client

**Files:**

- Create: `electron/services/agent-backends/codex/codex-json-rpc-client.ts`
- Create: `electron/services/agent-backends/codex/codex-json-rpc-client.test.ts`

**Step 1: Write failing tests**

Test request/response correlation, notification emission, JSON parse errors, process exit, and timeout.

Use dependency injection so tests do not spawn real Codex.

```ts
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';

import { CodexJsonRpcClient } from './codex-json-rpc-client';

function createFakeProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
  });
  return proc;
}

describe('CodexJsonRpcClient', () => {
  it('resolves matching response by id', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc as any });

    const promise = client.request('model/list', { limit: 1 });
    proc.stdout.write('{"id":1,"result":{"data":[]}}\n');

    await expect(promise).resolves.toEqual({ data: [] });
  });

  it('emits notifications without resolving requests', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc as any });
    const seen: unknown[] = [];
    client.onNotification((message) => seen.push(message));

    proc.stdout.write('{"method":"turn/started","params":{"turn":{"id":"turn-1"}}}\n');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([
      { method: 'turn/started', params: { turn: { id: 'turn-1' } } },
    ]);
  });
});
```

**Step 2: Run tests to verify fail**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-json-rpc-client.test.ts`

Expected: FAIL because module missing.

**Step 3: Implement minimal client**

Core implementation requirements:

- `request(method, params?)` writes JSONL with incrementing `id`
- `notify(method, params?)` writes JSONL without `id`
- parse stdout line-by-line
- response with `error` rejects matching promise
- notification invokes subscribers
- process `exit` rejects all pending requests
- `dispose()` kills process and clears listeners

Use Node `readline` over `proc.stdout`.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-json-rpc-client.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/codex-json-rpc-client.ts electron/services/agent-backends/codex/codex-json-rpc-client.test.ts
git commit -m "feat(codex): add app server json rpc client"
```

---

### Task 3: Add Codex App Server Process Manager

**Files:**

- Create: `electron/services/agent-backends/codex/codex-app-server.ts`
- Create: `electron/services/agent-backends/codex/codex-app-server.test.ts`

**Step 1: Write failing tests**

Test spawn args and handshake ordering.

Expected behavior:

- Spawn command: `codex app-server --listen stdio://`
- Stdio: `pipe`, `pipe`, `pipe`
- Send `initialize` request with client info
- Send `initialized` notification after initialize resolves
- Reuse singleton server for multiple callers
- Reset singleton on startup failure

**Step 2: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-app-server.test.ts`

Expected: FAIL because module missing.

**Step 3: Implement process manager**

Export:

```ts
export interface CodexAppServerHandle {
  client: CodexJsonRpcClient;
  dispose(): Promise<void>;
}

export async function getOrCreateCodexAppServer(): Promise<CodexAppServerHandle>;

export async function resetCodexAppServerForTest(): Promise<void>;
```

Implementation notes:

- Use `spawn('codex', ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'] })`.
- Set env with inherited `process.env`.
- Log stderr with `dbg.agent`.
- Send:

```ts
await client.request('initialize', {
  clientInfo: {
    name: 'jean_claude',
    title: 'Jean-Claude',
    version: appVersionOrFallback,
  },
  capabilities: { experimentalApi: true },
});
client.notify('initialized', {});
```

- If app version import is awkward, use package constant later; do not block core integration.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-app-server.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/codex-app-server.ts electron/services/agent-backends/codex/codex-app-server.test.ts
git commit -m "feat(codex): manage app server process"
```

---

### Task 4: Implement Codex Event Normalizer

**Files:**

- Create: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`
- Create: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`

**Step 1: Write fixture-driven failing tests**

Cover minimal stable events first:

- `thread/started` emits `session-id`
- user message item emits `user-prompt`
- agent message started + delta + completed creates one assistant entry then updates it
- command item emits `tool-use` name `bash`
- turn completed emits `complete` with usage/duration where available

Test example:

```ts
import { describe, expect, it } from 'vitest';

import { createCodexNormalizationContext, normalizeCodexNotification } from './normalize-codex-message-v2';

describe('normalizeCodexNotification', () => {
  it('emits a session id for thread started', () => {
    const ctx = createCodexNormalizationContext();
    expect(
      normalizeCodexNotification(
        { method: 'thread/started', params: { thread: { id: 'thr-1' } } },
        ctx,
      ),
    ).toEqual([{ type: 'session-id', sessionId: 'thr-1' }]);
  });

  it('streams assistant deltas into one entry', () => {
    const ctx = createCodexNormalizationContext();
    const started = normalizeCodexNotification(
      {
        method: 'item/started',
        params: { item: { id: 'item-1', type: 'agentMessage' } },
      },
      ctx,
    );
    const delta = normalizeCodexNotification(
      {
        method: 'item/agentMessage/delta',
        params: { itemId: 'item-1', delta: 'Hello' },
      },
      ctx,
    );

    expect(started[0]).toMatchObject({ type: 'entry' });
    expect(delta[0]).toMatchObject({ type: 'entry-update' });
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`

Expected: FAIL because normalizer missing.

**Step 3: Implement normalizer**

Export:

```ts
export type CodexNotification = {
  method: string;
  params?: Record<string, unknown>;
};

export type CodexNormalizationContext = {
  emittedSessionIds: Set<string>;
  itemEntries: Map<string, NormalizedEntry>;
  itemText: Map<string, string>;
};

export function createCodexNormalizationContext(): CodexNormalizationContext;

export function normalizeCodexNotification(
  notification: CodexNotification,
  ctx: CodexNormalizationContext,
): NormalizationEvent[];
```

Implementation rules:

- Be defensive: Codex schema can evolve. Unknown methods return `[]`.
- Use fallback generic `tool-use` for unknown tool item types.
- Prefer item ids from Codex as `NormalizedEntry.id` when stable.
- Use `new Date().toISOString()` where Codex event lacks timestamp.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex/normalize-codex-message-v2.ts electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts
git commit -m "feat(codex): normalize app server events"
```

---

### Task 5: Implement Minimal CodexBackend Start/Stop

**Files:**

- Modify: `electron/services/agent-backends/codex/codex-backend.ts`
- Create: `electron/services/agent-backends/codex/codex-backend.test.ts`

**Step 1: Write failing backend flow tests**

Mock `getOrCreateCodexAppServer()` and verify:

- `start()` calls `thread/start` when `config.sessionId` missing
- `start()` calls `thread/resume` when `config.sessionId` present
- `start()` calls `turn/start` with prompt text
- yielded events include persisted raw row ids
- `stop()` calls `turn/interrupt` when active turn known
- `dispose()` unsubscribes notifications and does not kill shared process directly

**Step 2: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-backend.test.ts`

Expected: FAIL.

**Step 3: Implement AsyncEventChannel**

Copy minimal `AsyncEventChannel<T>` pattern from `claude-code-backend.ts` or extract later only if reuse becomes worthwhile. Keep local first.

**Step 4: Implement `start()`**

Behavior:

- Create session key with `nanoid()`.
- Create session state:

```ts
type CodexSessionState = {
  threadId: string | null;
  turnId: string | null;
  eventChannel: AsyncEventChannel<AgentEvent>;
  normalizationCtx: CodexNormalizationContext;
  messageIndex: number;
  unsubscribe: (() => void) | null;
};
```

- Get app server.
- Start or resume thread:

```ts
const threadResult = config.sessionId
  ? await client.request('thread/resume', { threadId: config.sessionId })
  : await client.request('thread/start', {
      cwd: config.cwd,
      model: config.model === 'default' ? undefined : config.model,
      approvalPolicy: toCodexApprovalPolicy(config.interactionMode),
      sandbox: toCodexSandbox(config.interactionMode),
      serviceName: 'jean_claude',
    });
```

- Store `thread.id`.
- Subscribe to notifications filtered by `threadId` when present.
- Persist raw notification via `taskContext.persistRaw()` before pushing `entry` events.
- Call `turn/start` with:

```ts
await client.request('turn/start', {
  threadId,
  input: partsToCodexInput(parts),
  model: config.model === 'default' ? undefined : config.model,
});
```

**Step 5: Implement prompt conversion**

Function:

```ts
function partsToCodexInput(parts: PromptPart[]): unknown[] {
  return parts.flatMap((part) => {
    if (part.type === 'text') return [{ type: 'text', text: part.text }];
    if (part.type === 'image') {
      return [{ type: 'image', data: part.data, mimeType: part.mimeType }];
    }
    return [{ type: 'text', text: `Attached file: ${part.filePath}` }];
  });
}
```

If Codex App Server requires different image shape, adjust after running generated schema or live CLI. Keep test isolated.

**Step 6: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-backend.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add electron/services/agent-backends/codex/codex-backend.ts electron/services/agent-backends/codex/codex-backend.test.ts
git commit -m "feat(codex): run tasks through app server"
```

---

### Task 6: Implement Codex Permission Bridge

**Files:**

- Modify: `electron/services/agent-backends/codex/codex-backend.ts`
- Modify: `electron/services/agent-backends/codex/normalize-codex-message-v2.ts`
- Test: `electron/services/agent-backends/codex/codex-backend.test.ts`
- Test: `electron/services/agent-backends/codex/normalize-codex-message-v2.test.ts`

**Step 1: Add failing tests for approval request**

Simulate Codex server-initiated request or notification for command approval. Exact event name may be `item/commandExecution/requestApproval` per article/docs. Normalize to:

```ts
{
  type: 'permission-request',
  request: {
    requestId: 'approval-1',
    toolName: 'Bash',
    input: { command: 'pnpm test' },
    description: 'run tests',
  },
}
```

**Step 2: Implement outer policy evaluation**

Before emitting a prompt, evaluate Jean-Claude `config.permissionRules` using existing helpers where possible:

- `normalizeToolRequest`
- `evaluatePermissionWithMatch`

If rule allows, respond to Codex immediately and emit tool entry with permission metadata.

If rule denies, respond deny immediately.

If no match, emit `permission-request`.

**Step 3: Implement `respondToPermission()`**

Map:

```ts
response.behavior === 'allow' -> Codex approval allow
response.behavior === 'deny' -> Codex approval deny
```

Exact Codex method depends on observed schema. Start with helper `replyToCodexApproval()` so shape is localized.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/agent-backends/codex`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex
git commit -m "feat(codex): bridge tool approvals"
```

---

### Task 7: Add Codex Model Discovery

**Files:**

- Modify: `electron/services/backend-models-service.ts`
- Test: existing or create `electron/services/backend-models-service.test.ts`

**Step 1: Write failing tests**

Mock app server client response:

```ts
{
  data: [
    {
      id: 'gpt-5.4',
      displayName: 'GPT-5.4',
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: 'low' },
        { reasoningEffort: 'medium' },
      ],
      inputModalities: ['text', 'image'],
    },
  ],
}
```

Expect:

```ts
[{ id: 'gpt-5.4', label: 'GPT-5.4', supportsThinking: true, thinkingEfforts: ['low', 'medium'] }]
```

**Step 2: Implement `fetchCodexModels()`**

In `getBackendModels()` add:

```ts
if (backend === 'codex') {
  return fetchCodexModels();
}
```

Fetch all pages if `nextCursor` returned. Cache with existing `modelCache` keyed by `codex`.

**Step 3: Handle app-server unavailable**

On error, log and return cached stale models or `[]`, same OpenCode behavior.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/backend-models-service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/backend-models-service.ts electron/services/backend-models-service.test.ts
git commit -m "feat(codex): discover models from app server"
```

---

### Task 8: Add Codex Availability And Setup Status

**Files:**

- Modify: `electron/services/backend-config-settings-service.ts`
- Modify or create: service that powers enabled backend/source status, likely `electron/services/source-management-service.ts` and `src/hooks/use-enabled-backends.ts`
- Test: relevant service tests if present

**Step 1: Add binary check helper**

Create `electron/services/agent-backends/codex/codex-availability.ts`:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getCodexAvailability(): Promise<
  | { status: 'available'; version: string }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string }
> {
  try {
    const { stdout } = await execFileAsync('codex', ['--version'], { timeout: 5_000 });
    return { status: 'available', version: stdout.trim() };
  } catch (error) {
    return { status: 'missing', message: error instanceof Error ? error.message : String(error) };
  }
}
```

**Step 2: Surface missing CLI**

Add UI text in settings/new task where backend unavailable:

`Codex CLI not found. Install Codex and sign in before using this backend.`

**Step 3: Run targeted tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-availability.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add electron/services/agent-backends/codex/codex-availability.ts src electron/services
git commit -m "feat(codex): detect cli availability"
```

---

### Task 9: Add Codex Config Settings

**Files:**

- Modify: `electron/services/backend-config-settings-service.ts`
- Modify: `shared/backend-config-settings-types.ts` if exhaustive types require it
- Test: create or update `electron/services/backend-config-settings-service.test.ts`

**Step 1: Add failing test**

Test `readBackendUserConfig('codex')` returns:

- path: `~/.codex/config.toml`
- schemaUrl: Codex docs URL or empty string if no JSON schema
- default content as TOML

**Step 2: Add CONFIGS entry**

Add:

```ts
codex: {
  paths: [path.join(os.homedir(), '.codex', 'config.toml')],
  schemaUrl: 'https://developers.openai.com/codex/config-reference',
  defaultContent: '# Codex config\n',
},
```

**Step 3: Avoid JSON parsing for TOML**

Current `writeBackendUserConfig()` parses JSON-like content. Change behavior:

```ts
if (backend === 'codex') {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return readBackendUserConfig(backend);
}
```

Do not add TOML parser unless UI needs structured editing.

**Step 4: Run tests**

Run: `pnpm test -- electron/services/backend-config-settings-service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/backend-config-settings-service.ts electron/services/backend-config-settings-service.test.ts
git commit -m "feat(codex): expose config settings"
```

---

### Task 10: Update Renderer Backend Pickers And Labels

**Files:**

- Modify: `src/features/settings/ui-sources-settings/index.tsx`
- Modify: `src/features/task/ui-task-panel/add-step-dialog.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx`
- Modify: `src/routes/projects/$projectId/tasks/new.tsx`
- Modify: `src/features/settings/ui-skills-settings/skill-editor.tsx`
- Modify: `src/features/settings/ui-skills-settings/registry-skill-details.tsx`
- Modify: `src/layout/ui-header/usage-display.tsx`
- Modify any remaining compile sites from `pnpm ts-check`

**Step 1: Add Codex label helper**

If labels are duplicated, create small helper in `src/lib/backend-labels.ts`:

```ts
import type { AgentBackendType } from '@shared/agent-backend-types';

export function getBackendLabel(backend: AgentBackendType): string {
  switch (backend) {
    case 'claude-code':
      return 'Claude Code';
    case 'opencode':
      return 'OpenCode';
    case 'codex':
      return 'Codex';
  }
}
```

Use helper only where it reduces repeated ternaries. Avoid broad refactor.

**Step 2: Add Codex to backend arrays**

Example:

```ts
const BACKENDS: Array<{ type: AgentBackendType; label: string }> = [
  { type: 'claude-code', label: 'Claude Code' },
  { type: 'opencode', label: 'OpenCode' },
  { type: 'codex', label: 'Codex' },
];
```

**Step 3: Update image support check**

In `backendSupportsImages()`, return true for Codex only when model metadata says image supported if that data is available; otherwise default to true for parity with Codex docs backward compatibility.

**Step 4: Run typecheck**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Commit**

```bash
git add src
git commit -m "feat(codex): add renderer backend options"
```

---

### Task 11: Integrate Codex Skills And MCP Status

**Files:**

- Modify: `electron/services/skill-management-service.ts`
- Modify: `electron/services/agent-management-service.ts` only if agent/subagent support is desired
- Create: `electron/services/agent-backends/codex/codex-capabilities-service.ts`
- Test: new service tests

**Step 1: Decide minimal full-surface behavior**

For first implementation, avoid symlink assumptions. Codex skills and MCP use app-server APIs.

Implementation stance:

- `skill-management-service` continues symlink model for Claude/OpenCode.
- For Codex, route list/enable/disable through Codex app-server helpers.
- If current shared skill UI cannot represent API-managed skills cleanly, show Codex skill status read-only first, then add enable/disable.

**Step 2: Add Codex capability service**

Exports:

```ts
export async function listCodexSkills(cwds: string[]): Promise<unknown[]>;
export async function writeCodexSkillConfig(params: { path: string; enabled: boolean }): Promise<void>;
export async function reloadCodexMcpServers(): Promise<void>;
export async function listCodexMcpStatus(threadId?: string): Promise<unknown[]>;
```

Internals call app-server methods:

- `skills/list`
- `skills/config/write`
- `config/mcpServer/reload`
- `mcpServerStatus/list`

**Step 3: Add tests with mocked app-server client**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-capabilities-service.test.ts`

Expected: PASS.

**Step 4: Wire UI/backend responses conservatively**

If existing `ManagedSkill` shape cannot fit Codex app-server payload, add explicit unsupported reason for Codex enable/disable instead of pretending symlink exists.

**Step 5: Commit**

```bash
git add electron/services/agent-backends/codex electron/services/skill-management-service.ts
git commit -m "feat(codex): expose skills and mcp status"
```

---

### Task 12: Optional Codex Thread Browser Service

**Files:**

- Create: `electron/services/agent-backends/codex/codex-thread-service.ts`
- Modify: `src/lib/api.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/handlers.ts`
- UI later: `src/features/settings/` or new feature folder if product decision exists

**Step 1: Implement service only, no UI first**

Exports:

```ts
export async function listCodexThreads(params: {
  cwd?: string;
  archived?: boolean;
  cursor?: string | null;
  limit?: number;
}): Promise<{ data: CodexThreadSummary[]; nextCursor: string | null }>;

export async function readCodexThread(threadId: string): Promise<CodexThreadDetail>;
export async function archiveCodexThread(threadId: string): Promise<void>;
export async function unarchiveCodexThread(threadId: string): Promise<void>;
```

**Step 2: Add IPC under `api.codexThreads.*`**

Keep separate from Jean-Claude task APIs to avoid implying Codex global thread equals JC task.

**Step 3: Add tests**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-thread-service.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add electron/services/agent-backends/codex src/lib/api.ts electron/preload.ts electron/ipc/handlers.ts
git commit -m "feat(codex): add thread service api"
```

---

### Task 13: Add End-To-End Fake App Server Integration Test

**Files:**

- Create: `electron/services/agent-backends/codex/codex-backend.integration.test.ts`
- Create helper in same file or `electron/services/agent-backends/codex/test-fake-codex-app-server.ts`

**Step 1: Build fake app-server stream**

Use in-memory streams to emulate:

- initialize response
- thread/start response
- turn/start response
- `thread/started`
- `item/started` agent message
- `item/agentMessage/delta`
- `item/completed`
- `turn/completed`

**Step 2: Assert backend emits full Jean-Claude flow**

Expected event sequence:

- `session-id`
- assistant `entry`
- assistant `entry-update`
- `complete`

**Step 3: Run integration test**

Run: `pnpm test -- electron/services/agent-backends/codex/codex-backend.integration.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add electron/services/agent-backends/codex/codex-backend.integration.test.ts
git commit -m "test(codex): cover app server task flow"
```

---

### Task 14: Manual Validation Against Real Codex CLI

**Files:** none unless defects found.

**Step 1: Confirm CLI**

Run: `codex --version`

Expected: prints Codex version.

**Step 2: Smoke app-server manually**

Run: `codex app-server generate-ts --out /tmp/codex-schema`

Expected: schema files generated. Use schema to adjust event/request shapes if tests used stale assumptions.

**Step 3: Run Jean-Claude task manually**

Use UI:

- Enable Codex backend in settings.
- Create task with backend Codex.
- Prompt: `List files and summarize project structure. Ask before running shell commands.`
- Approve one read-only shell command.
- Stop a running turn.
- Resume with follow-up prompt.

Expected:

- Stream appears in message timeline.
- Tool card appears.
- Permission prompt appears and resolves.
- Stop finishes cleanly.
- Follow-up resumes same Codex thread.

**Step 4: Capture schema drift fixes**

If real Codex events differ from fixtures, update:

- `normalize-codex-message-v2.ts`
- `codex-backend.ts`
- tests fixtures

**Step 5: Commit fixes**

```bash
git add electron/services/agent-backends/codex
git commit -m "fix(codex): align with app server schema"
```

---

### Task 15: Final Verification

**Files:** all touched files.

**Step 1: Install deps**

Run: `pnpm install`

Expected: succeeds.

**Step 2: Test**

Run: `pnpm test`

Expected: PASS.

**Step 3: Auto-fix lint**

Run: `pnpm lint --fix`

Expected: completes; may modify formatting.

**Step 4: Typecheck**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Final lint**

Run: `pnpm lint`

Expected: PASS.

**Step 6: Review diff**

Run: `git diff --stat`

Expected: changes limited to Codex backend, backend registry/type/UI/config/model/skill integration, tests, and this plan if included.

**Step 7: Final commit if requested**

```bash
git add .
git commit -m "feat(codex): add codex backend integration"
```

---

## Implementation Notes

- Keep Codex JSON-RPC schema localized. Do not leak raw Codex item types into renderer state.
- Prefer additive UI changes. Do not redesign backend picker.
- Treat Codex App Server as authoritative for Codex-specific skills/MCP/plugins.
- Keep unknown Codex events ignored and persisted raw if useful.
- Use `config.sessionId` as Codex `thread.id`. Store no separate session model unless needed.
- Enable `experimentalApi` only because full surface uses skills/MCP/thread APIs that may require it.
- If Codex authentication fails, surface actionable error instead of generic backend crash.

## Rollout Plan

1. Land core backend hidden behind existing enabled-backends setting.
2. Enable Codex in settings only when CLI detected.
3. Add model discovery.
4. Add config + setup messaging.
5. Add skills/MCP management.
6. Add optional thread browser after core task flow stable.

## Open Questions

- Exact Codex approval reply method/shape must be confirmed from generated schema or live app-server.
- Exact Codex image input shape must be confirmed from generated schema.
- Product decision needed for whether Codex global threads should appear in Jean-Claude task history or separate Codex history view.
- Decide whether to contact OpenAI for `clientInfo.name = jean_claude` compliance-log known-client registration before enterprise use.
