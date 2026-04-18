# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jean-Claude is an Electron desktop app for managing coding agents across multiple projects. It supports multiple agent backends (Claude Code Agent SDK and OpenCode SDK) to spawn and manage agent sessions. The app follows a two-process architecture: Electron main process (Node.js) handles database and IPC, while the renderer process (React) handles the UI.

## Agent guidelines

<IMPORTANT>
Once you are done with your task
First run `pnpm install`.
Then run `pnpm lint --fix` to automatically fix linting errors.
Then run `pnpm ts-check` to verify that there are no TypeScript errors.
And then run `pnpm lint` to see if there are any remaining linting errors that need to be fixed.
</IMPORTANT>

## Architecture

### Process Communication

```
Renderer (React) <-> Preload Bridge <-> Main Process (Node.js)
     |                    |                    |
  src/lib/api.ts   electron/preload.ts   electron/ipc/handlers.ts
```

The renderer calls `window.api.*` methods defined in `preload.ts`, handled in `ipc/handlers.ts`. Types shared via `src/lib/api.ts` and `shared/`.

### State Management

- **Server state**: TanStack React Query with hooks in `src/hooks/`
- **UI state**: Zustand stores in `src/stores/`
- **Routing**: TanStack Router with file-based routes in `src/routes/`

#### Zustand Usage

Always use selectors to subscribe to store state reactively:

```ts
// Good - reactive, only re-renders when selected state changes
const draft = useStore((state) => state.drafts[id]);
const setDraft = useStore((state) => state.setDraft);

// Bad - not reactive, won't trigger re-renders
const { getDraft } = useStore();
const draft = getDraft(id);
```

Avoid selectors that create a new object/array on every call. In React 19, unstable selector outputs can cause re-render loops and "Maximum update depth exceeded" errors.

```ts
// Bad - returns a new array each time selector runs
const runningJobs = useBackgroundJobsStore((state) =>
  state.jobs.filter((job) => job.status === 'running'),
);

// Good - select stable source, derive with useMemo
const jobs = useBackgroundJobsStore((state) => state.jobs);
const runningJobs = useMemo(
  () => jobs.filter((job) => job.status === 'running'),
  [jobs],
);
```

Prefer shared constants (e.g. `EMPTY_ARRAY`) over returning `[]` from selectors.

For stores keyed by ID, expose a custom hook that takes the ID and returns bound actions:

```ts
export function useNewTaskDraftStore(projectId: string) {
  const draft = useStore((state) => state.drafts[projectId] ?? defaultDraft);
  const setDraftAction = useStore((state) => state.setDraft);
  const setDraft = useCallback(
    (update: Partial<Draft>) => setDraftAction(projectId, update),
    [projectId, setDraftAction],
  );
  return { draft, setDraft };
}
```

#### Overlay Pattern

Global overlays use the `overlays` store. Only one overlay open at a time. Types: `'new-task' | 'command-palette'`. Use `open()`, `close()`, and read `overlay` from the store.

### Database

SQLite via better-sqlite3 + Kysely (type-safe query builder). Schema in `electron/database/schema.ts`, migrations in `electron/database/migrations/`, repositories in `electron/database/repositories/`.

**Adding a migration:**

1. Create `electron/database/migrations/NNN_name.ts` with `up()` and `down()`
2. Register in `electron/database/migrator.ts`
3. Update types in `schema.ts`

**Merging main (migration conflicts):** When both branches add migrations with the same number, always renumber the branch's migration to come after main's. Never modify migrations from `main`.

#### Migration Patterns

**Simple (adding columns):**

```typescript
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('newColumn', 'text', (col) => col.defaultTo('value'))
    .execute();
}
```

**Table recreation (modifying columns/constraints):**

SQLite doesn't support `ALTER COLUMN`. Recreating tables is dangerous — dropping a table with FK references triggers `ON DELETE CASCADE`, wiping related data.

```typescript
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await db.transaction().execute(async (trx) => {
    await sql`DROP TABLE IF EXISTS tablename_new`.execute(trx);
    await trx.schema.createTable('tablename_new')
      // ... columns ...
      .execute();
    await sql`INSERT INTO tablename_new SELECT ... FROM tablename`.execute(trx);
    await trx.schema.dropTable('tablename').execute();
    await sql`ALTER TABLE tablename_new RENAME TO tablename`.execute(trx);

    const fkCheck = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
```

Key points: wrap in transaction, disable FK before dropping, verify with `PRAGMA foreign_key_check`, use `trx` (not `db`) inside transaction.

### Key Concepts

- **Agent backends**: `'claude-code' | 'opencode'` — abstracted via `AgentBackend` interface in `shared/agent-backend-types.ts`, implementations in `electron/services/agent-backends/`
- **Interaction modes**: `ask` (prompt for permissions), `auto` (bypass), `plan` (show plan first, default)
- **Task steps**: Tasks contain sequential steps, each an independent agent session with its own config. Messages are keyed by `stepId` not `taskId`
- **Message normalization**: Backend-specific messages normalized to unified schema (`shared/normalized-message-v2.ts`). Each backend has its own normalizer
- **Background jobs**: Long-running ops (task creation, merge, deletion, summary generation) run as background jobs via Zustand store (`src/stores/background-jobs.ts`)
- **Skills**: Managed via `skill-management-service.ts`. Canonical storage in `~/.config/jean-claude/skills/`, symlinked to backend paths. Enable = create symlink, disable = remove symlink
- **Worktrees**: Git worktrees for isolated task branches. Diff calculated between `startCommitHash` and current working tree. Commit, merge, push, PR creation via `worktree-service.ts`
- **Permissions**: Worktree-specific permissions in `.claude/settings.local.worktrees.json`, merged with base `.claude/settings.local.json`. Bare "Bash" never allowed — must use `Bash(exact command)` format

## File Structure

```
electron/                # Main process
  main.ts                # Window creation, app lifecycle
  preload.ts             # IPC bridge exposed to renderer
  ipc/handlers.ts        # IPC route handlers
  database/              # SQLite: schema.ts, migrations/, repositories/
  services/              # Business logic
    agent-service.ts     # Agent session lifecycle
    agent-backends/      # Backend implementations (claude/, opencode/)
    worktree-service.ts  # Git worktree operations
    task-service.ts      # Task lifecycle
    skill-management-service.ts
    completion-service.ts  # Mistral FIM autocomplete

shared/                  # Types shared between main and renderer
  types.ts               # Domain types (Project, Task, TaskStep, Provider)
  agent-backend-types.ts # Backend abstraction (AgentBackend, AgentBackendType)
  normalized-message-v2.ts # Unified message schema

src/                     # Renderer (React)
  routes/                # TanStack Router file-based routes
  layout/                # App shell (header, sidebars)
  features/              # Feature components by domain
    agent/               # Message stream, timeline, tool cards, input
    task/                # Task panel, step flow bar, add step dialog
    project/             # Project tile, settings, backlog
    settings/            # App settings views
    common/              # Shared feature components (file-diff, prompt-textarea)
    new-task/            # New task overlay
    pull-request/        # PR viewing
  common/                # Shared infrastructure
    context/             # React contexts (keyboard-bindings, modal, overlay)
    hooks/               # Shared hooks (use-commands/)
    ui/                  # Atomic reusable components
  hooks/                 # React Query hooks
  stores/                # Zustand stores (navigation, task-messages, overlays, etc.)
  lib/                   # Utilities (api.ts, colors.ts, time.ts)

docs/plans/              # Design and implementation documents
```

## Development Notes

- macOS: Uses `hiddenInset` title bar with custom traffic light positioning
- All IPC methods are async and go through the preload bridge
- Database auto-migrates on app startup
- Route params use `$paramName` convention (e.g., `$projectId.tsx`)
- See `ROADMAP.md` for feature phases and `docs/plans/` for detailed designs
- Don't try to run `pnpm dev` — focus on implementing features
- When writing design/implementation docs, no need to commit
- When implementation is done, run `pnpm lint --fix` first
- To verify TypeScript, run `pnpm ts-check` (not `tsc` directly)

## Coding Guidelines

### General Principles

- TypeScript strict mode
- File and folder names: kebab-case
- Prefer single object parameter over multiple positional parameters
- Avoid defining types/interfaces when you can inline them (only define when reused)

### React Components

- Functional components with hooks only
- Inline props typing (no separate interface)
- Colocate component-specific types in the same file

#### Organization & Naming

- `src/layout/` — App shell
- `src/features/<domain>/` — Feature components (prefix with `ui-`, e.g. `ui-message-stream`)
- `src/common/ui/` — Atomic components (no prefix)
- SVG icons: `Icon` prefix (e.g. `IconClaude`)
- Hooks: `use-` prefix, utilities: `utils-` prefix

Each component in its own folder with `index.tsx`. No barrel files. Import directly:

```ts
import { MessageStream } from '@/features/agent/ui-message-stream';
```

Push logic down to the most specific child component. Keep parents focused on composition and data flow.

### Electron IPC

- All IPC methods typed in `src/lib/api.ts`, handled in `electron/ipc/handlers.ts`
- Never expose Node.js APIs directly to renderer — always use preload bridge

### Database

- Use Kysely query builder; avoid raw SQL
- All schema changes require a migration
- Repository methods return plain objects, not database rows
- Handle errors at repository level

### Claude Agent SDK

Docs: https://platform.claude.com/docs/en/agent-sdk/overview
