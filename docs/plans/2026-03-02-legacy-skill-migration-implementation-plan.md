# Legacy Skill Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a safe preview-and-confirm migration flow that moves manually installed backend skills into Jean-Claude canonical skill storage and replaces legacy locations with symlinks.

**Architecture:** Add backend migration services in the skill management service, expose them through typed IPC/preload/API contracts, then add a settings UI flow with a preview and execution dialog. Keep operations backend-aware and idempotent, skip conflicts/invalid skills, and refresh managed skills query data after migration.

**Tech Stack:** Electron IPC, Node.js `fs/promises`, React, TanStack Query, TypeScript strict mode.

---

### Task 1: Add shared migration types

**Files:**
- Modify: `shared/skill-types.ts`

**Step 1: Define migration preview item and status types**

Add:
- `LegacySkillMigrationStatus = 'migrate' | 'skip-conflict' | 'skip-invalid'`
- `LegacySkillMigrationPreviewItem`
- `LegacySkillMigrationPreviewResult`
- `LegacySkillMigrationExecuteResult`

Include fields for backend type, legacy path, target canonical path, display name, status, reason, and per-item error reporting for execution.

**Step 2: Verify shared type usage compiles**

Run: `pnpm ts-check`
Expected: no type errors from new shared exports.

### Task 2: Implement preview + execute migration in skill service

**Files:**
- Modify: `electron/services/skill-management-service.ts`

**Step 1: Add helpers for legacy skill classification**

Implement helper(s) that scan legacy user skills for each backend and classify each entry:
- `migrate` when valid and non-conflicting with JC canonical target
- `skip-conflict` when canonical target exists
- `skip-invalid` when SKILL.md cannot be parsed/read

Use the same directory-name normalization strategy already used by create skill flow.

**Step 2: Add preview API**

Implement `previewLegacySkillMigration()` returning grouped results across both backends.

**Step 3: Add execute API with safe move flow**

Implement `executeLegacySkillMigration()`:
- revalidate item before changing filesystem
- copy into canonical temp dir then rename to canonical
- remove legacy path
- create symlink at legacy path to canonical
- verify symlink resolution
- capture per-item failures without aborting all items

**Step 4: Add minimal rollback/cleanup on failed symlink creation**

If failure occurs after legacy removal, attempt to restore from canonical copy or mark explicit error with recovery hint.

### Task 3: Wire migration endpoints through IPC and preload

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers**

Register:
- `skills:migrationPreview`
- `skills:migrationExecute`

Delegate to service functions and log context with existing `dbg.ipc` patterns.

**Step 2: Expose in preload bridge**

Add `skillManagement.migrationPreview()` and `skillManagement.migrationExecute()` methods.

**Step 3: Update renderer API typings**

Add new methods and return types under `window.api.skillManagement` in `src/lib/api.ts`.

### Task 4: Add hooks for migration operations

**Files:**
- Modify: `src/hooks/use-managed-skills.ts`

**Step 1: Add migration hooks**

Implement:
- `useLegacySkillMigrationPreview()` (mutation/query-style trigger)
- `useLegacySkillMigrationExecute()`

**Step 2: Invalidate managed skills cache on execute success**

Invalidate `managedSkillsQueryKeys.all` to refresh cards post-migration.

### Task 5: Build migration UI flow in settings

**Files:**
- Modify: `src/features/settings/ui-skills-settings/index.tsx`
- Create: `src/features/settings/ui-skills-settings/legacy-skill-migration-dialog.tsx`

**Step 1: Add migration trigger button**

Add `Migrate Legacy Skills` button beside existing add action.

**Step 2: Implement preview state UI**

Dialog shows:
- loading state
- grouped backend sections
- per-item status/reason
- totals for migrate/conflict/invalid

**Step 3: Implement confirm execute state UI**

On confirm:
- execute migration for previewed `migrate` items
- show running state
- render result summary with succeeded/skipped/failed

**Step 4: Add error handling UX**

Use inline error panels and existing toast system for request-level failures.

### Task 6: Verify end-to-end behavior

**Files:**
- Modify as needed from verification findings

**Step 1: Install dependencies**

Run: `pnpm install`
Expected: dependencies resolved.

**Step 2: Auto-fix lint issues**

Run: `pnpm lint --fix`
Expected: lint fixes applied with no blocking errors.

**Step 3: Type-check**

Run: `pnpm ts-check`
Expected: no TypeScript errors.

**Step 4: Final lint pass**

Run: `pnpm lint`
Expected: clean lint output.

**Step 5: Manual verification checklist**

Verify in settings UI:
- preview lists both backends and expected statuses
- conflict items are skipped
- successful migrations replace legacy path with symlink to canonical
- managed skills grid updates after migration completion
