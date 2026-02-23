# OpenCode SDK v2 Migration

## Context

The codebase is partially migrated to OpenCode SDK v2. The backend (`opencode-backend.ts`) already imports from `@opencode-ai/sdk/v2` for server init, session ops, and event subscription. However, three areas still use v1 patterns: permission responses, question handling, and type imports in the normalizer and agent-messages repository.

## Changes

### 1. Permission API (opencode-backend.ts)

**Before:** `client.postSessionIdPermissionsPermissionId({ path, query, body })`
**After:** `client.permission.reply({ requestID, reply, directory })`

Parameter mapping:
- `path.permissionID` → `requestID`
- `body.response` → `reply` (same values: `'once' | 'always' | 'reject'`)
- `query.directory` → `directory`
- `path.id` (sessionId) — no longer needed

### 2. Question API (opencode-backend.ts)

**Before:** Half-finished `client.question.reply({})` stub + commented-out `session.prompt()` fallback
**After:** `client.question.reply({ requestID, answers, directory })`

Answer mapping:
- Our `Record<string, string>` (question→answer pairs) maps to `QuestionAnswer[]` which is `Array<Array<string>>`
- Each answer is wrapped as `[answerValue]`

### 3. Permission Event Type (normalize-opencode-message-v2.ts)

**Before:** Handles `permission.updated` event, casts properties as v1 `Permission` type
**After:** Handle `permission.asked` event, cast as v2 `PermissionRequest` type

Field mapping:
- `permission.id` → `id` (same)
- `permission.type` → `permission` (renamed field)
- `permission.title` → derive from `permission` field (v2 has no `title`)
- `permission.metadata` → `metadata` (same)

### 4. Import Paths

| File | Before | After |
|------|--------|-------|
| `normalize-opencode-message-v2.ts` | `from '@opencode-ai/sdk'` | `from '@opencode-ai/sdk/v2'` |
| `agent-messages.ts` | `from '@opencode-ai/sdk'` | `from '@opencode-ai/sdk/v2'` |

Type renames:
- `Permission as OcPermission` → `PermissionRequest as OcPermission` (keep alias for minimal churn)

### 5. Cleanup

- Remove commented-out v1 import block (lines 11-20 in backend)
- Remove commented-out `session.prompt()` fallback in `respondToQuestion`
- Update header comment (line 8) to reference `permission.reply()`
- Remove `OcPermission` from `pendingPermissions` map type (it references v1 Permission which no longer exists — replace with v2 `PermissionRequest`)

## Files Touched

1. `electron/services/agent-backends/opencode/opencode-backend.ts` — permissions, questions, cleanup
2. `electron/services/agent-backends/opencode/normalize-opencode-message-v2.ts` — imports, permission event
3. `electron/database/repositories/agent-messages.ts` — import path only
