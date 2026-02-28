# Image Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to attach images to prompts (paste, drag-drop, file picker) and send them to OpenCode and Claude Code agent backends.

**Architecture:** A `PromptPart[]` type replaces `prompt: string` throughout the pipeline. Images are compressed client-side (WebP for agents, AVIF for storage) and inlined as base64 markdown in the stored `user-prompt` entries. Each backend adapter maps parts to its SDK-specific format.

**Tech Stack:** Canvas API (compression), react-markdown (rendering), OpenCode SDK `FilePartInput`, Claude Code SDK `SDKUserMessage`

**Design doc:** `docs/plans/2026-02-25-image-attachments-design.md`

---

### Task 1: Add PromptPart Types and Helpers

**Files:**

- Modify: `shared/agent-backend-types.ts:17-30` (add types before backend interface)
- Create: `shared/prompt-utils.ts`

**Step 1: Add PromptPart types to agent-backend-types.ts**

Add after line 19 (`export type AgentBackendType = ...`) in `shared/agent-backend-types.ts`:

```typescript
// --- Prompt content parts ---

export type PromptTextPart = {
  type: 'text';
  text: string;
};

export type PromptImagePart = {
  type: 'image';
  /** base64-encoded image data (no data URI prefix) */
  data: string;
  /** MIME type, e.g. "image/webp", "image/jpeg" */
  mimeType: string;
  /** Optional original filename */
  filename?: string;
  /** AVIF-compressed base64 for storage (set by UI before IPC) */
  storageData?: string;
  /** MIME type of the storage version */
  storageMimeType?: string;
};

export type PromptPart = PromptTextPart | PromptImagePart;
```

**Step 2: Create shared/prompt-utils.ts**

Create `shared/prompt-utils.ts`:

```typescript
import type { PromptPart, PromptImagePart } from './agent-backend-types';

/** Wrap a plain text string as a single-element PromptPart array. */
export function textPrompt(text: string): PromptPart[] {
  return [{ type: 'text', text }];
}

/** Extract concatenated text from a PromptPart array. */
export function getPromptText(parts: PromptPart[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Extract image parts from a PromptPart array. */
export function getPromptImages(parts: PromptPart[]): PromptImagePart[] {
  return parts.filter((p): p is PromptImagePart => p.type === 'image');
}

/**
 * Build a markdown string with images inlined as base64 data URIs.
 * Uses storageData/storageMimeType (AVIF) when available, otherwise falls back
 * to the agent-facing data/mimeType.
 */
export function buildPromptMarkdown(parts: PromptPart[]): string {
  const sections: string[] = [];

  const text = getPromptText(parts);
  if (text) sections.push(text);

  for (const img of getPromptImages(parts)) {
    const data = img.storageData ?? img.data;
    const mime = img.storageMimeType ?? img.mimeType;
    const filename = img.filename || 'image';
    sections.push(`![${filename}](data:${mime};base64,${data})`);
  }

  return sections.join('\n\n');
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 4: Commit**

```
feat: add PromptPart types and prompt-utils helpers
```

---

### Task 2: Update AgentBackend Interface

**Files:**

- Modify: `shared/agent-backend-types.ts:73-74` (change `start()` signature)

**Step 1: Change `start()` to accept `PromptPart[]`**

In `shared/agent-backend-types.ts`, change line 74:

```typescript
// Before:
start(config: AgentBackendConfig, prompt: string): Promise<AgentSession>;

// After:
start(config: AgentBackendConfig, parts: PromptPart[]): Promise<AgentSession>;
```

This will cause TypeScript errors in both backend implementations and the agent service. That's expected — we fix them in subsequent tasks.

**Step 2: Verify the expected errors**

Run: `pnpm ts-check`
Expected: Errors in `opencode-backend.ts`, `claude-code-backend.ts`, and `agent-service.ts` about the `prompt: string` argument not matching `parts: PromptPart[]`.

---

### Task 3: Update OpenCode Backend

**Files:**

- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts`

**Step 1: Update `start()` signature and `createEventStream`**

In `opencode-backend.ts`, update the `start()` method (line 130-132):

```typescript
// Before:
async start(
  config: AgentBackendConfig,
  prompt: string,
): Promise<AgentSession> {

// After:
async start(
  config: AgentBackendConfig,
  parts: PromptPart[],
): Promise<AgentSession> {
```

Add import at the top of the file:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
```

Update the call to `createEventStream` (line 192):

```typescript
// Before:
const events = this.createEventStream(client, state, prompt, config);

// After:
const events = this.createEventStream(client, state, parts, config);
```

Update `createEventStream` signature (line 372-376):

```typescript
// Before:
private async *createEventStream(
  client: OpencodeClient,
  state: OpenCodeSessionState,
  prompt: string,
  config: AgentBackendConfig,
): AsyncGenerator<AgentEvent> {

// After:
private async *createEventStream(
  client: OpencodeClient,
  state: OpenCodeSessionState,
  parts: PromptPart[],
  config: AgentBackendConfig,
): AsyncGenerator<AgentEvent> {
```

**Step 2: Add parts mapping helper and update the prompt call**

Add a helper function before the class or as a private method. Then update the prompt call at line 397-404:

```typescript
// Before:
const promptPromise = client.session.prompt({
  sessionID: sessionId,
  directory: state.cwd,
  parts: [{ type: 'text' as const, text: prompt }],
  ...(model ? { model } : {}),
  agent: this.getPrimaryAgentName(config.interactionMode),
});

// After:
const promptPromise = client.session.prompt({
  sessionID: sessionId,
  directory: state.cwd,
  parts: parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }
    return {
      type: 'file' as const,
      mime: part.mimeType,
      url: `data:${part.mimeType};base64,${part.data}`,
      ...(part.filename ? { filename: part.filename } : {}),
    };
  }),
  ...(model ? { model } : {}),
  agent: this.getPrimaryAgentName(config.interactionMode),
});
```

**Step 3: Verify TypeScript compiles for this file**

Run: `pnpm ts-check`
Expected: Errors only remaining in `claude-code-backend.ts` and `agent-service.ts` (not this file).

---

### Task 4: Update Claude Code Backend

**Files:**

- Modify: `electron/services/agent-backends/claude/claude-code-backend.ts`

**Step 1: Update `start()` and `runSdkGenerator()` signatures**

Add import:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
import { getPromptText } from '@shared/prompt-utils';
```

Update `start()` (line 135-137):

```typescript
// Before:
async start(
  config: AgentBackendConfig,
  prompt: string,
): Promise<AgentSession> {

// After:
async start(
  config: AgentBackendConfig,
  parts: PromptPart[],
): Promise<AgentSession> {
```

Update call to `runSdkGenerator` (line 160):

```typescript
// Before:
this.runSdkGenerator(config, prompt, session, sessionKey);

// After:
this.runSdkGenerator(config, parts, session, sessionKey);
```

Update `runSdkGenerator` (line 277-279):

```typescript
// Before:
private async runSdkGenerator(
  config: AgentBackendConfig,
  prompt: string,
  session: ClaudeSession,
  sessionKey: string,
): Promise<void> {

// After:
private async runSdkGenerator(
  config: AgentBackendConfig,
  parts: PromptPart[],
  session: ClaudeSession,
  sessionKey: string,
): Promise<void> {
```

**Step 2: Update the synthetic user-prompt entry**

Update line 291 where the synthetic user-prompt entry is emitted:

```typescript
// Before:
value: prompt,

// After:
value: getPromptText(parts),
```

**Step 3: Update the `query()` call**

Update line 327 where `query()` is called:

```typescript
// Before:
const generator = query({ prompt, options: queryOptions });

// After:
const promptText = getPromptText(parts);
const generator = query({ prompt: promptText, options: queryOptions });
```

Note: Full multimodal support for Claude Code (passing `SDKUserMessage` with image blocks instead of string) is deferred to a follow-up. For now, only the text is sent. The image parts will still be stored in the markdown user-prompt entry but won't be sent to the Claude Code SDK. This keeps the change minimal and safe — Claude Code image support can be added later by switching to `session.send(SDKUserMessage)` when images are present.

**Step 4: Verify TypeScript compiles for this file**

Run: `pnpm ts-check`
Expected: Errors only remaining in `agent-service.ts`.

---

### Task 5: Update Agent Service

**Files:**

- Modify: `electron/services/agent-service.ts`

**Step 1: Add imports**

Add at top of `agent-service.ts`:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
import {
  textPrompt,
  buildPromptMarkdown,
  getPromptText,
} from '@shared/prompt-utils';
```

**Step 2: Update `runBackend` signature and user-prompt entry**

Update `runBackend` (line 189-191):

```typescript
// Before:
private async runBackend(
  taskId: string,
  prompt: string,
  session: ActiveSession,
  options?: { generateNameOnInit?: boolean; initialPrompt?: string },
): Promise<void> {

// After:
private async runBackend(
  taskId: string,
  parts: PromptPart[],
  session: ActiveSession,
  options?: { generateNameOnInit?: boolean; initialPrompt?: string },
): Promise<void> {
```

Find the place where the backend is started (line 253-268) and update the call:

```typescript
// Before:
const agentSession = await session.backend.start(
  { ... },
  prompt,
);

// After:
const agentSession = await session.backend.start(
  { ... },
  parts,
);
```

**Step 3: Update `start()` method**

Update the call to `runBackend` in `start()` (line 571):

```typescript
// Before:
await this.runBackend(taskId, task.prompt, session, {
  generateNameOnInit: true,
  initialPrompt: task.prompt,
});

// After:
await this.runBackend(taskId, textPrompt(task.prompt), session, {
  generateNameOnInit: true,
  initialPrompt: task.prompt,
});
```

Note: Task creation with images is handled in a later task. For now, `start()` wraps `task.prompt` with `textPrompt()`.

**Step 4: Update `sendMessage()`**

Update `sendMessage` (line 726):

```typescript
// Before:
async sendMessage(taskId: string, message: string): Promise<void> {
  // ...
  await this.runBackend(taskId, message, session);

// After:
async sendMessage(taskId: string, parts: PromptPart[]): Promise<void> {
  // ...
  await this.runBackend(taskId, parts, session);
```

**Step 5: Update `queuePrompt()` and queued prompt consumption**

Update `queuePrompt` (line 767):

```typescript
// Before:
queuePrompt(taskId: string, prompt: string): { promptId: string } {
  const queuedPrompt: QueuedPrompt = {
    id: nanoid(),
    content: prompt,
    createdAt: Date.now(),
  };

// After:
queuePrompt(taskId: string, parts: PromptPart[]): { promptId: string } {
  const queuedPrompt: QueuedPrompt = {
    id: nanoid(),
    content: JSON.stringify(parts),
    createdAt: Date.now(),
  };
```

Update the queued prompt consumption in `processEvent` (around line 472-481):

```typescript
// Before:
return await this.runBackend(taskId, nextPrompt.content, session);

// After:
const queuedParts: PromptPart[] = JSON.parse(nextPrompt.content);
return await this.runBackend(taskId, queuedParts, session);
```

**Step 6: Update name generation call**

Find where `initialPrompt` is used for name generation. It should remain as a string extracted from parts. The `options.initialPrompt` is already set to `task.prompt` (a string) so this should be fine — just verify `getPromptText` is used when extracting text from parts for name generation if needed.

**Step 7: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: Errors now in `preload.ts`, `handlers.ts`, and `api.ts` (the IPC layer).

**Step 8: Commit**

```
feat: update agent service and backends to accept PromptPart[]
```

(Combines Tasks 2-5 into one commit since they're all interdependent.)

---

### Task 6: Update IPC Layer

**Files:**

- Modify: `src/lib/api.ts:533-537`
- Modify: `electron/preload.ts:282-285`
- Modify: `electron/ipc/handlers.ts:1242-1256`

**Step 1: Update api.ts types**

In `src/lib/api.ts`, add the import at the top:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
```

Update line 533:

```typescript
// Before:
sendMessage: (taskId: string, message: string) => Promise<void>;

// After:
sendMessage: (taskId: string, parts: PromptPart[]) => Promise<void>;
```

Update lines 534-537:

```typescript
// Before:
queuePrompt: (taskId: string, prompt: string) => Promise<{ promptId: string }>;

// After:
queuePrompt: (taskId: string, parts: PromptPart[]) =>
  Promise<{ promptId: string }>;
```

**Step 2: Update preload.ts bindings**

In `electron/preload.ts`, update lines 282-285:

```typescript
// Before:
sendMessage: (taskId: string, message: string) =>
  ipcRenderer.invoke(AGENT_CHANNELS.SEND_MESSAGE, taskId, message),
queuePrompt: (taskId: string, prompt: string) =>
  ipcRenderer.invoke(AGENT_CHANNELS.QUEUE_PROMPT, taskId, prompt),

// After:
sendMessage: (taskId: string, parts: unknown[]) =>
  ipcRenderer.invoke(AGENT_CHANNELS.SEND_MESSAGE, taskId, parts),
queuePrompt: (taskId: string, parts: unknown[]) =>
  ipcRenderer.invoke(AGENT_CHANNELS.QUEUE_PROMPT, taskId, parts),
```

Note: `preload.ts` cannot import shared types directly (it runs in the preload context), so we use `unknown[]` here. The type safety is enforced by `api.ts` on the renderer side and the handler on the main process side.

**Step 3: Update handlers.ts**

In `electron/ipc/handlers.ts`, add import:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
```

Update lines 1242-1248:

```typescript
// Before:
ipcMain.handle(
  AGENT_CHANNELS.SEND_MESSAGE,
  (_, taskId: string, message: string) => {
    dbg.ipc('agent:sendMessage %s (length: %d)', taskId, message.length);
    return agentService.sendMessage(taskId, message);
  },
);

// After:
ipcMain.handle(
  AGENT_CHANNELS.SEND_MESSAGE,
  (_, taskId: string, parts: PromptPart[]) => {
    dbg.ipc('agent:sendMessage %s (parts: %d)', taskId, parts.length);
    return agentService.sendMessage(taskId, parts);
  },
);
```

Update lines 1250-1256:

```typescript
// Before:
ipcMain.handle(
  AGENT_CHANNELS.QUEUE_PROMPT,
  (_, taskId: string, prompt: string) => {
    dbg.ipc('agent:queuePrompt %s', taskId);
    return agentService.queuePrompt(taskId, prompt);
  },
);

// After:
ipcMain.handle(
  AGENT_CHANNELS.QUEUE_PROMPT,
  (_, taskId: string, parts: PromptPart[]) => {
    dbg.ipc('agent:queuePrompt %s', taskId);
    return agentService.queuePrompt(taskId, parts);
  },
);
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: Errors now in `use-agent.ts` and UI components that call `sendMessage`/`queuePrompt` with strings.

---

### Task 7: Update React Hooks

**Files:**

- Modify: `src/hooks/use-agent.ts:70-82`

**Step 1: Update sendMessage and queuePrompt in useAgentControls**

Add import:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
```

Update `sendMessage` (lines 70-75):

```typescript
// Before:
const sendMessage = useCallback(
  async (message: string) => {
    await api.agent.sendMessage(taskId, message);
  },
  [taskId],
);

// After:
const sendMessage = useCallback(
  async (parts: PromptPart[]) => {
    await api.agent.sendMessage(taskId, parts);
  },
  [taskId],
);
```

Update `queuePrompt` (lines 77-82):

```typescript
// Before:
const queuePrompt = useCallback(
  async (prompt: string) => {
    return api.agent.queuePrompt(taskId, prompt);
  },
  [taskId],
);

// After:
const queuePrompt = useCallback(
  async (parts: PromptPart[]) => {
    return api.agent.queuePrompt(taskId, parts);
  },
  [taskId],
);
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: Errors in `ui-task-panel/index.tsx` (TaskInputFooter) that passes `(message: string) => void` to `MessageInput`.

---

### Task 8: Update TaskInputFooter and MessageInput Signatures

**Files:**

- Modify: `src/features/task/ui-task-panel/index.tsx:919-1021` (TaskInputFooter)
- Modify: `src/features/agent/ui-message-input/index.tsx:16-70`

**Step 1: Update MessageInput props**

In `src/features/agent/ui-message-input/index.tsx`, add import:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
import { textPrompt } from '@shared/prompt-utils';
```

Update the props (lines 28-30):

```typescript
// Before:
onSend: (message: string) => void;
onQueue?: (message: string) => void;

// After:
onSend: (parts: PromptPart[]) => void;
onQueue?: (parts: PromptPart[]) => void;
```

Update `handleSubmit` (lines 55-70):

```typescript
// Before:
const handleSubmit = useCallback(() => {
  const trimmed = value.trim();
  if (!trimmed) return;

  if (isRunning && onQueue) {
    onQueue(trimmed);
  } else if (!disabled) {
    onSend(trimmed);
  }

  setValue('');
  textareaRef.current?.resetHeight();
}, [value, disabled, isRunning, onSend, onQueue, setValue]);

// After:
const handleSubmit = useCallback(() => {
  const trimmed = value.trim();
  if (!trimmed) return;

  const parts = textPrompt(trimmed);

  if (isRunning && onQueue) {
    onQueue(parts);
  } else if (!disabled) {
    onSend(parts);
  }

  setValue('');
  textareaRef.current?.resetHeight();
}, [value, disabled, isRunning, onSend, onQueue, setValue]);
```

Note: This task just wires up the new types. Image attachment state in MessageInput is added in Task 11.

**Step 2: Update TaskInputFooter**

In `src/features/task/ui-task-panel/index.tsx`, add import:

```typescript
import type { PromptPart } from '@shared/agent-backend-types';
```

Update TaskInputFooter props (lines 934-935):

```typescript
// Before:
onSend: (message: string) => void;
onQueue: (message: string) => void;

// After:
onSend: (parts: PromptPart[]) => void;
onQueue: (parts: PromptPart[]) => void;
```

Update `handleSendMessage` (lines 969-977):

```typescript
// Before:
const handleSendMessage = useCallback(
  (message: string) => {
    if (task?.userCompleted) {
      clearUserCompleted.mutate(taskId);
    }
    clearPromptDraft();
    onSend(message);
  },
  [task?.userCompleted, taskId, clearUserCompleted, clearPromptDraft, onSend],
);

// After:
const handleSendMessage = useCallback(
  (parts: PromptPart[]) => {
    if (task?.userCompleted) {
      clearUserCompleted.mutate(taskId);
    }
    clearPromptDraft();
    onSend(parts);
  },
  [task?.userCompleted, taskId, clearUserCompleted, clearPromptDraft, onSend],
);
```

Update `handleQueuePrompt` (lines 980-985):

```typescript
// Before:
const handleQueuePrompt = useCallback(
  (message: string) => {
    clearPromptDraft();
    onQueue(message);
  },
  [clearPromptDraft, onQueue],
);

// After:
const handleQueuePrompt = useCallback(
  (parts: PromptPart[]) => {
    clearPromptDraft();
    onQueue(parts);
  },
  [clearPromptDraft, onQueue],
);
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors (or only errors in new-task overlay if it also uses sendMessage).

**Step 4: Commit**

```
feat: update IPC layer, hooks, and message input to use PromptPart[]
```

(Combines Tasks 6-8.)

---

### Task 9: Update Synthetic User-Prompt Entries to Use Markdown Builder

**Files:**

- Modify: `electron/services/agent-backends/claude/claude-code-backend.ts:283-293`
- Modify: `electron/services/agent-service.ts` (any place a synthetic user-prompt entry is emitted)

The Claude Code backend currently emits a synthetic user-prompt entry with `value: prompt` (now `value: getPromptText(parts)`). For image support, we want to use `buildPromptMarkdown(parts)` so images are inlined in the stored entry.

**Step 1: Update Claude Code backend synthetic entry**

In `claude-code-backend.ts`, add import:

```typescript
import { buildPromptMarkdown } from '@shared/prompt-utils';
```

Update line 291:

```typescript
// Before:
value: getPromptText(parts),

// After:
value: buildPromptMarkdown(parts),
```

**Step 2: Check if agent-service.ts also emits synthetic user-prompt entries**

Search `agent-service.ts` for `type: 'user-prompt'`. If the agent service emits its own synthetic user-prompt entry (e.g., when processing queued prompts), update it to use `buildPromptMarkdown(parts)` as well.

If the agent service does NOT emit user-prompt entries (only the backends do), no change is needed here.

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 4: Commit**

```
feat: use buildPromptMarkdown for synthetic user-prompt entries
```

---

### Task 10: Allow data: URIs in Markdown Renderer

**Files:**

- Modify: `src/features/agent/ui-markdown-content/index.tsx:153-175`

The `customUrlTransform` function blocks all URLs except `http:`, `https:`, `mailto:`, `tel:`, and `azure-image-proxy://`. We need to allow `data:` URIs for inline image rendering.

**Step 1: Update customUrlTransform**

In `src/features/agent/ui-markdown-content/index.tsx`, update the `customUrlTransform` function (lines 155-175):

```typescript
// Before:
function customUrlTransform(url: string): string {
  // Allow our custom protocol
  if (url.startsWith('azure-image-proxy://')) {
    return url;
  }
  // For other URLs, only allow safe protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  try {
    const parsed = new URL(url);
    if (safeProtocols.includes(parsed.protocol)) {
      return url;
    }
  } catch {
    // Relative URLs are fine
    if (!url.includes(':')) {
      return url;
    }
  }
  console.log('[MarkdownContent] Blocking URL with unsafe protocol:', url);
  return '';
}

// After:
function customUrlTransform(url: string): string {
  // Allow our custom protocol
  if (url.startsWith('azure-image-proxy://')) {
    return url;
  }
  // Allow data: URIs (used for inline image attachments)
  if (url.startsWith('data:image/')) {
    return url;
  }
  // For other URLs, only allow safe protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  try {
    const parsed = new URL(url);
    if (safeProtocols.includes(parsed.protocol)) {
      return url;
    }
  } catch {
    // Relative URLs are fine
    if (!url.includes(':')) {
      return url;
    }
  }
  console.log('[MarkdownContent] Blocking URL with unsafe protocol:', url);
  return '';
}
```

Note: We restrict `data:` URIs to `data:image/` to prevent potential XSS via `data:text/html` or similar.

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 3: Commit**

```
feat: allow data:image/ URIs in markdown renderer for inline images
```

---

### Task 11: Create Image Compression Utility

**Files:**

- Create: `src/lib/image-compression.ts`

**Step 1: Create the compression module**

Create `src/lib/image-compression.ts`:

```typescript
/**
 * Client-side image compression using Canvas API.
 *
 * Two compression targets:
 * - WebP for agent backends (sent to the LLM)
 * - AVIF for storage (inlined in agent_messages, smaller)
 */

function stripDataUriPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

async function loadAndResize(
  source: File | Blob,
  maxDim: number,
): Promise<HTMLCanvasElement> {
  const img = new Image();
  const objectUrl = URL.createObjectURL(source);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

/** Compress an image to WebP for sending to the agent backend. */
export async function compressImageForAgent(
  source: File | Blob,
  maxDim = 1920,
  quality = 0.75,
): Promise<{ data: string; mimeType: string }> {
  const canvas = await loadAndResize(source, maxDim);
  const webpUrl = canvas.toDataURL('image/webp', quality);
  return { data: stripDataUriPrefix(webpUrl), mimeType: 'image/webp' };
}

/** Compress an image to AVIF for storage in the database (smaller). */
export async function compressImageForStorage(
  source: File | Blob,
  maxDim = 1920,
  quality = 0.65,
): Promise<{ data: string; mimeType: string }> {
  const canvas = await loadAndResize(source, maxDim);

  // Try AVIF first, fall back to WebP if encoding not supported
  const avifUrl = canvas.toDataURL('image/avif', quality);
  if (avifUrl.startsWith('data:image/avif')) {
    return { data: stripDataUriPrefix(avifUrl), mimeType: 'image/avif' };
  }

  const webpUrl = canvas.toDataURL('image/webp', quality);
  return { data: stripDataUriPrefix(webpUrl), mimeType: 'image/webp' };
}

/** Compress an image for both agent and storage in parallel. */
export async function compressImage(
  source: File | Blob,
  maxDim = 1920,
): Promise<{
  agent: { data: string; mimeType: string };
  storage: { data: string; mimeType: string };
}> {
  const [agent, storage] = await Promise.all([
    compressImageForAgent(source, maxDim),
    compressImageForStorage(source, maxDim),
  ]);
  return { agent, storage };
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 3: Commit**

```
feat: add image compression utility (WebP for agents, AVIF for storage)
```

---

### Task 12: Add Image Support to PromptTextarea

**Files:**

- Modify: `src/features/common/ui-prompt-textarea/index.tsx`

This is the largest UI change. We add:

- New props for image state management
- Paste handler for clipboard images
- Drag-and-drop handlers
- File picker button
- Image thumbnail preview strip

**Step 1: Add new props to PromptTextareaProps**

In `src/features/common/ui-prompt-textarea/index.tsx`, add import:

```typescript
import type { PromptImagePart } from '@shared/agent-backend-types';
```

Add new props to `PromptTextareaProps` (after line 111):

```typescript
export interface PromptTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  // ... existing props ...
  /** Attached images */
  images?: PromptImagePart[];
  /** Called when user attaches an image (paste, drop, or file picker) */
  onImageAttach?: (image: PromptImagePart) => void;
  /** Called when user removes an attached image */
  onImageRemove?: (index: number) => void;
}
```

**Step 2: Add paste handler**

Inside the component function, add a paste handler:

```typescript
const handlePaste = useCallback(
  (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onImageAttach) return;

    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          void processImageFile(file, onImageAttach);
        }
      }
    }
    // If no images, default text paste proceeds
  },
  [onImageAttach],
);
```

Add the `processImageFile` helper outside the component:

```typescript
import { compressImage } from '@/lib/image-compression';

async function processImageFile(
  file: File,
  onAttach: (image: PromptImagePart) => void,
): Promise<void> {
  const { agent, storage } = await compressImage(file);
  onAttach({
    type: 'image',
    data: agent.data,
    mimeType: agent.mimeType,
    filename: file.name,
    storageData: storage.data,
    storageMimeType: storage.mimeType,
  });
}
```

**Step 3: Add drag-and-drop handlers**

Add state and handlers:

```typescript
const [isDragOver, setIsDragOver] = useState(false);

const handleDragOver = useCallback(
  (e: React.DragEvent) => {
    if (!onImageAttach) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  },
  [onImageAttach],
);

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragOver(false);
}, []);

const handleDrop = useCallback(
  (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!onImageAttach) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      void processImageFile(file, onImageAttach);
    }
  },
  [onImageAttach],
);
```

**Step 4: Add file picker**

Add a hidden file input ref and handler:

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);

const handleFileSelect = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onImageAttach || !e.target.files) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      void processImageFile(file, onImageAttach);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  },
  [onImageAttach],
);
```

**Step 5: Update the JSX**

Wrap the textarea in a container div with drag-drop handlers. Add the file input, file picker button, and image preview strip. The exact JSX structure:

```tsx
<div
  className="relative"
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  {/* Image previews */}
  {images && images.length > 0 && (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {images.map((img, index) => (
        <div key={index} className="group relative">
          <img
            src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
            alt={img.filename || 'Attached image'}
            className="h-16 w-16 rounded border border-neutral-600 object-cover"
          />
          <button
            type="button"
            onClick={() => onImageRemove?.(index)}
            className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-xs text-neutral-300 group-hover:flex hover:bg-red-600"
          >
            x
          </button>
        </div>
      ))}
    </div>
  )}

  <textarea
    ref={textareaRef}
    value={value}
    onChange={handleChange}
    onKeyDown={handleKeyDown}
    onSelect={handleSelect}
    onPaste={handlePaste}
    // ... existing props ...
    className={clsx(
      'min-h-[40px] w-full resize-none rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm leading-[20px] text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      isDragOver && 'border-blue-500 bg-blue-500/10',
      className,
    )}
    {...textareaProps}
  />

  {/* File picker button */}
  {onImageAttach && (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="absolute right-2 bottom-2 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        title="Attach image"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </button>
    </>
  )}

  {/* Drag overlay */}
  {isDragOver && (
    <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-500/10">
      <span className="text-sm text-blue-400">Drop image here</span>
    </div>
  )}
</div>
```

Note: The exact positioning of the file picker button and image preview strip may need adjustment depending on the surrounding layout. The important thing is that the functionality is there.

**Step 6: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 7: Commit**

```
feat: add image paste, drag-drop, file picker, and preview to PromptTextarea
```

---

### Task 13: Wire Image State into MessageInput

**Files:**

- Modify: `src/features/agent/ui-message-input/index.tsx`

**Step 1: Add image state and wire to PromptTextarea**

Add imports:

```typescript
import type { PromptPart, PromptImagePart } from '@shared/agent-backend-types';
```

Add image state inside the component:

```typescript
const [images, setImages] = useState<PromptImagePart[]>([]);

const handleImageAttach = useCallback((image: PromptImagePart) => {
  setImages((prev) => [...prev, image]);
}, []);

const handleImageRemove = useCallback((index: number) => {
  setImages((prev) => prev.filter((_, i) => i !== index));
}, []);
```

**Step 2: Update handleSubmit to include images in parts**

```typescript
const handleSubmit = useCallback(() => {
  const trimmed = value.trim();
  if (!trimmed && images.length === 0) return;

  const parts: PromptPart[] = [];
  if (trimmed) parts.push({ type: 'text', text: trimmed });
  parts.push(...images);

  if (isRunning && onQueue) {
    onQueue(parts);
  } else if (!disabled) {
    onSend(parts);
  }

  setValue('');
  setImages([]);
  textareaRef.current?.resetHeight();
}, [value, images, disabled, isRunning, onSend, onQueue, setValue]);
```

**Step 3: Pass image props to PromptTextarea**

In the JSX where `<PromptTextarea>` is rendered, add the new props:

```tsx
<PromptTextarea
  // ... existing props ...
  images={images}
  onImageAttach={handleImageAttach}
  onImageRemove={handleImageRemove}
/>
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 5: Commit**

```
feat: wire image attachment state into MessageInput component
```

---

### Task 14: Add Image Support to New Task Overlay

**Files:**

- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/stores/new-task-draft.ts:12-29`
- Modify: `shared/types.ts:259-283` (NewTask interface)

**Step 1: Add images to NewTaskDraft**

In `src/stores/new-task-draft.ts`, add import:

```typescript
import type { PromptImagePart } from '@shared/agent-backend-types';
```

Add to `NewTaskDraft` (line 23, after `prompt: string`):

```typescript
export interface NewTaskDraft {
  // ... existing fields ...
  prompt: string;
  /** Image attachments for the initial prompt */
  images: PromptImagePart[];
  // ... rest of fields ...
}
```

Update the default draft value (find where defaults are defined) to include `images: []`.

**Step 2: Add images to NewTask**

In `shared/types.ts`, add import:

```typescript
import type { PromptImagePart } from './agent-backend-types';
```

Add to `NewTask` interface (after line 263 `prompt: string`):

```typescript
export interface NewTask {
  // ... existing fields ...
  prompt: string;
  /** Transient image attachments (not persisted in tasks table) */
  images?: PromptImagePart[];
  // ... rest of fields ...
}
```

**Step 3: Update handleStartTask in new-task overlay**

In `src/features/new-task/ui-new-task-overlay/index.tsx`, update `handleStartTask` to pass images:

```typescript
// In the createTaskMutation.mutateAsync call, add:
images: draft.images?.length ? draft.images : undefined,
```

**Step 4: Wire image props to PromptTextarea in the overlay**

Add image state handlers and pass to `<PromptTextarea>`:

```typescript
const handleImageAttach = useCallback(
  (image: PromptImagePart) => {
    updateDraft({
      images: [...(draft.images ?? []), image],
    });
  },
  [draft.images, updateDraft],
);

const handleImageRemove = useCallback(
  (index: number) => {
    updateDraft({
      images: (draft.images ?? []).filter((_, i) => i !== index),
    });
  },
  [draft.images, updateDraft],
);
```

Pass to `<PromptTextarea>`:

```tsx
<PromptTextarea
  // ... existing props ...
  images={draft.images}
  onImageAttach={handleImageAttach}
  onImageRemove={handleImageRemove}
/>
```

**Step 5: Update agent-service.ts to use images from NewTask**

In `electron/services/agent-service.ts`, update the `start()` method to construct `PromptPart[]` from `task.prompt` + task images.

This requires passing images through the task creation IPC flow. In `electron/ipc/handlers.ts`, the `createWithWorktree` handler receives `NewTask` data. The images need to be stored temporarily (e.g., in a map keyed by taskId) so that when `start()` is called, it can retrieve them.

Approach: Add a `pendingImageAttachments` map to `agent-service.ts`:

```typescript
// In agent-service.ts:
private pendingImageAttachments = new Map<string, PromptImagePart[]>();

// In the task creation handler (or add a new method):
setPendingImages(taskId: string, images: PromptImagePart[]): void {
  this.pendingImageAttachments.set(taskId, images);
}

// In start():
async start(taskId: string): Promise<void> {
  const task = await TaskRepository.findById(taskId);
  const images = this.pendingImageAttachments.get(taskId);
  this.pendingImageAttachments.delete(taskId);

  const parts: PromptPart[] = [{ type: 'text', text: task.prompt }];
  if (images) parts.push(...images);

  await this.runBackend(taskId, parts, session, {
    generateNameOnInit: true,
    initialPrompt: task.prompt,
  });
}
```

In `electron/ipc/handlers.ts`, the `createWithWorktree` handler needs to store images before starting:

```typescript
const { useWorktree, sourceBranch, autoStart, images, ...taskData } = data;
// ... create task ...
if (images?.length) {
  agentService.setPendingImages(task.id, images);
}
// ... if autoStart, start the task ...
```

**Step 6: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors.

**Step 7: Commit**

```
feat: add image attachment support to new task creation flow
```

---

### Task 15: Lint and Final Verification

**Files:**

- All modified files

**Step 1: Run lint with auto-fix**

Run: `pnpm lint --fix`
Expected: No errors or only auto-fixed issues.

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors.

**Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds.

**Step 4: Commit any lint fixes**

```
chore: lint fixes for image attachments feature
```

---

### Task 16: Manual Testing Checklist

This task is not automated — it requires running the app (`pnpm dev`) and verifying:

1. **Text-only prompts still work** — Send a text message to both OpenCode and Claude Code backends. Verify no regressions.
2. **Paste image** — Copy a screenshot to clipboard, Cmd+V in the message input. Verify:
   - Thumbnail preview appears below the textarea
   - X button removes the thumbnail
   - On submit, the message is sent and the user-prompt entry in the timeline shows the image
3. **Drag-and-drop** — Drag an image file from Finder onto the textarea. Verify same behavior as paste.
4. **File picker** — Click the image button, select an image file. Verify same behavior.
5. **New task with image** — Create a new task with text + image. Verify the initial prompt includes the image in the timeline.
6. **Image rendering in timeline** — Verify the markdown `![name](data:...)` renders as an inline `<img>` tag, not as broken text.
7. **Queue prompt with image** — While an agent is running, send a follow-up with an image. Verify it queues and sends correctly.

---

## Summary of All Files Modified

| File                                                             | Change                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `shared/agent-backend-types.ts`                                  | Add `PromptTextPart`, `PromptImagePart`, `PromptPart` types; change `AgentBackend.start()` signature                 |
| `shared/prompt-utils.ts`                                         | **New file** — `textPrompt`, `getPromptText`, `getPromptImages`, `buildPromptMarkdown` helpers                       |
| `shared/types.ts`                                                | Add optional `images?: PromptImagePart[]` to `NewTask`                                                               |
| `electron/services/agent-backends/opencode/opencode-backend.ts`  | Accept `parts: PromptPart[]`, map to `FilePartInput`                                                                 |
| `electron/services/agent-backends/claude/claude-code-backend.ts` | Accept `parts: PromptPart[]`, extract text, use `buildPromptMarkdown` for stored entry                               |
| `electron/services/agent-service.ts`                             | Accept `PromptPart[]` in `runBackend`, `sendMessage`, `queuePrompt`; add `pendingImageAttachments` for task creation |
| `electron/ipc/handlers.ts`                                       | Update `SEND_MESSAGE` and `QUEUE_PROMPT` handlers for `PromptPart[]`; pass images in task creation                   |
| `electron/preload.ts`                                            | Update `sendMessage` and `queuePrompt` IPC bindings                                                                  |
| `src/lib/api.ts`                                                 | Update `sendMessage` and `queuePrompt` type signatures                                                               |
| `src/lib/image-compression.ts`                                   | **New file** — `compressImageForAgent`, `compressImageForStorage`, `compressImage`                                   |
| `src/hooks/use-agent.ts`                                         | Update `sendMessage` and `queuePrompt` to accept `PromptPart[]`                                                      |
| `src/features/common/ui-prompt-textarea/index.tsx`               | Add image props, paste handler, drag-drop, file picker button, thumbnail previews                                    |
| `src/features/agent/ui-message-input/index.tsx`                  | Add image state, compose `PromptPart[]` on submit                                                                    |
| `src/features/task/ui-task-panel/index.tsx`                      | Update `TaskInputFooter` props to `PromptPart[]`                                                                     |
| `src/features/new-task/ui-new-task-overlay/index.tsx`            | Wire image attachment to draft and task creation                                                                     |
| `src/stores/new-task-draft.ts`                                   | Add `images: PromptImagePart[]` to `NewTaskDraft`                                                                    |
| `src/features/agent/ui-markdown-content/index.tsx`               | Allow `data:image/` URIs in `customUrlTransform`                                                                     |
