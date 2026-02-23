# OpenCode SDK v2 Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the migration from OpenCode SDK v1 to v2 by updating remaining v1 imports, permission API, question API, and event type handling.

**Architecture:** The OpenCode backend wraps the `@opencode-ai/sdk` into the app's `AgentBackend` interface. The SDK ships v1 at root and v2 at `/v2` subpath. The backend already uses v2 for server init, session ops, and events — but permissions, questions, and the normalizer still use v1 patterns.

**Tech Stack:** TypeScript, `@opencode-ai/sdk` v1.2.10 (using `/v2` subpath exports)

---

### Task 1: Update import paths (normalizer + agent-messages)

**Files:**
- Modify: `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts:12-25`
- Modify: `electron/database/repositories/agent-messages.ts:1-6`

**Step 1: Update normalizer imports**

In `normalize-opencode-message-v2.ts`, change the import from v1 to v2 and rename `Permission` → `PermissionRequest`:

```typescript
import type {
  Event as OcEvent,
  Part as OcPart,
  Message as OcMessage,
  AssistantMessage as OcAssistantMessage,
  UserMessage as OcUserMessage,
  Session as OcSession,
  PermissionRequest as OcPermission,
  TextPart,
  ToolPart,
  CompactionPart,
  ToolStateCompleted,
  ToolStateError,
} from '@opencode-ai/sdk/v2';
```

**Step 2: Update agent-messages imports**

In `agent-messages.ts`, change the import path:

```typescript
import type {
  Event as OcEvent,
  Part as OcPart,
  Message as OcMessage,
  AssistantMessage as OcAssistantMessage,
} from '@opencode-ai/sdk/v2';
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: Should pass (types are structurally compatible, but the `permission.updated` event handler in the normalizer will need updating in Task 2)

---

### Task 2: Update permission event handling in normalizer

**Files:**
- Modify: `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts:139-152`

**Step 1: Update the permission event handler**

The v2 SDK renames the event from `permission.updated` to `permission.asked`, and the `PermissionRequest` type has different fields than v1 `Permission`. In `normalizeEvent()`, change:

```typescript
    // Old (v1):
    case 'permission.updated': {
      const permission = event.properties as OcPermission;
      return [
        {
          type: 'permission-request',
          request: {
            requestId: permission.id,
            toolName: permission.type,
            input: permission.metadata,
            description: permission.title,
          },
        },
      ];
    }
```

To:

```typescript
    case 'permission.asked': {
      const permission = event.properties as OcPermission;
      return [
        {
          type: 'permission-request',
          request: {
            requestId: permission.id,
            toolName: permission.permission,
            input: permission.metadata,
            description: permission.permission,
          },
        },
      ];
    }
```

Key changes:
- Event name: `permission.updated` → `permission.asked`
- `permission.type` → `permission.permission` (field renamed)
- `permission.title` → `permission.permission` (v2 has no `title` — use `permission` string as description)

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 3: Update permission response in backend

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:259-264`

**Step 1: Replace v1 permission response with v2 `permission.reply()`**

In `respondToPermission()`, change the API call from:

```typescript
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: requestId },
        query: { directory: state.cwd },
        body: { response: ocResponse },
      });
```

To:

```typescript
      await client.permission.reply({
        requestID: requestId,
        directory: state.cwd,
        reply: ocResponse,
      });
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 4: Implement v2 question reply

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:281-331`

**Step 1: Replace the stub with proper `question.reply()` call**

Replace the entire `respondToQuestion` method body. The v2 API expects `answers` as `Array<QuestionAnswer>` where `QuestionAnswer = Array<string>`. Our input is `Record<string, string>` (question text → selected answer). We map each answer value to `[value]`:

```typescript
  async respondToQuestion(
    sessionId: string,
    requestId: string,
    answer: Record<string, string>,
  ): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      dbg.agent('OpenCodeBackend.respondToQuestion — no session %s', sessionId);
      return;
    }

    // Clear pending question state
    state.pendingQuestionCallId = null;

    const { client } = await getOrCreateServer();
    dbg.agent(
      'OpenCodeBackend.respondToQuestion sending reply for %s',
      sessionId,
    );

    // Map Record<string, string> answers to Array<QuestionAnswer>
    // QuestionAnswer = Array<string> — each answer is the selected option(s)
    const answers = Object.values(answer).map((value) => [value]);

    client.question
      .reply({
        requestID: requestId,
        directory: state.cwd,
        answers,
      })
      .catch((error) => {
        dbg.agent(
          'OpenCodeBackend.respondToQuestion reply error for %s: %O',
          sessionId,
          error,
        );
      });
  }
```

Note: The parameter changed from `_requestId` (unused) to `requestId` (now used by v2 API).

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 5: Update pendingPermissions type and cleanup

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts`

**Step 1: Import `PermissionRequest` in the backend**

Add `PermissionRequest` to the v2 import (replacing the commented-out Permission import):

```typescript
import {
  createOpencode,
  type OpencodeClient,
  type Session as OcSession,
  type Event as OcEvent,
  type Part as OcPart,
  type Message as OcMessage,
  type AssistantMessage as OcAssistantMessage,
  type PermissionRequest as OcPermission,
} from '@opencode-ai/sdk/v2';
```

**Step 2: Remove commented-out v1 imports (lines 11-20)**

Delete the entire commented-out v1 import block:

```typescript
// import {
//   createOpencode,
//   type OpencodeClient,
//   type Session as OcSession,
//   type Event as OcEvent,
//   type Part as OcPart,
//   type Message as OcMessage,
//   type AssistantMessage as OcAssistantMessage,
//   type Permission as OcPermission,
// } from '@opencode-ai/sdk';
```

**Step 3: Update header comment**

Change line 8 from:
```
// - Permissions handled via client.postSessionIdPermissionsPermissionId()
```
To:
```
// - Permissions handled via client.permission.reply()
```

**Step 4: Remove `// instance.client.question.` debug comment (line 81)**

Delete the leftover debug line.

**Step 5: Remove commented-out code in createSession (lines 362-364)**

Clean up the commented-out v1 parameter style.

**Step 6: Remove commented-out code in createEventStream prompt (lines 436-439)**

Clean up the commented-out v1 parameter style.

**Step 7: Run type check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 6: Lint and verify

**Step 1: Run lint with autofix**

Run: `pnpm lint --fix`
Expected: PASS (or only pre-existing warnings)

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS
