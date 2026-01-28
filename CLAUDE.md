# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jean-Claude is an Electron desktop app for managing coding agents across multiple projects. It uses the Claude Code Agent SDK to spawn and manage agent sessions. The app follows a two-process architecture: Electron main process (Node.js) handles database and IPC, while the renderer process (React) handles the UI.

## Commands

```bash
pnpm dev      # Start development server with hot reload
pnpm build    # Build for production
pnpm lint     # Run ESLint
pnpm format   # Format with Prettier
```

## Architecture

### Process Communication

```
Renderer (React) ←→ Preload Bridge ←→ Main Process (Node.js)
     ↓                    ↓                    ↓
  src/lib/api.ts   electron/preload.ts   electron/ipc/handlers.ts
```

The renderer calls `window.api.*` methods which are defined in `preload.ts` and handled in `ipc/handlers.ts`. Types are shared via `src/lib/api.ts` and `shared/`.

### State Management

- **Server state**: TanStack React Query with hooks in `src/hooks/` (useProjects, useTasks, useProviders, useSettings, useAgent)
- **UI state**: Zustand stores in `src/stores/` (navigation, new task form, task message cache)
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

For stores keyed by ID, expose a custom hook that takes the ID and returns bound actions:

```ts
export function useNewTaskFormStore(projectId: string) {
  const draft = useStore((state) => state.drafts[projectId] ?? defaultDraft);
  const setDraftAction = useStore((state) => state.setDraft);
  const setDraft = useCallback(
    (update: Partial<Draft>) => setDraftAction(projectId, update),
    [projectId, setDraftAction],
  );
  return { draft, setDraft };
}
```

### Database

SQLite via better-sqlite3 + Kysely (type-safe query builder):

- Schema types: `electron/database/schema.ts`
- Migrations: `electron/database/migrations/`
- Repositories: `electron/database/repositories/`

To add a migration:

1. Create `electron/database/migrations/NNN_name.ts` with `up()` and `down()` functions
2. Register in `electron/database/migrator.ts`
3. Update types in `schema.ts`

#### Migration Patterns

**Simple migrations (adding columns):**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('newColumn', 'text', (col) => col.defaultTo('value'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('newColumn').execute();
}
```

**Table recreation (for modifying columns/constraints):**

SQLite doesn't support `ALTER COLUMN`, so changing column constraints or defaults requires recreating the table. This pattern is dangerous if not done correctly:

- **Problem 1**: Dropping a table with FK references triggers `ON DELETE CASCADE`, wiping related data (e.g., dropping `tasks` deletes all `agent_messages`)
- **Problem 2**: Without transactions, partial failures leave the database in an invalid state
- **Problem 3**: Duplicating data temporarily doubles disk usage

**Safe table recreation pattern:**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // 1. Disable FK constraints to prevent cascade deletes
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    // 2. Create new table with desired schema
    await sql`DROP TABLE IF EXISTS tablename_new`.execute(trx);
    await trx.schema
      .createTable('tablename_new')
      // ... columns ...
      .execute();

    // 3. Copy data
    await sql`INSERT INTO tablename_new SELECT ... FROM tablename`.execute(trx);

    // 4. Drop old table and rename
    await trx.schema.dropTable('tablename').execute();
    await sql`ALTER TABLE tablename_new RENAME TO tablename`.execute(trx);

    // 5. Re-enable FK constraints and verify integrity
    await sql`PRAGMA foreign_keys = ON`.execute(trx);
    const fkCheck = await sql<{
      table: string;
    }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
}
```

Key points:

- Always wrap in `db.transaction().execute()`
- Use `PRAGMA foreign_keys = OFF` before dropping tables with FK references
- Verify FK integrity with `PRAGMA foreign_key_check` before committing
- Use `trx` (not `db`) for all operations inside the transaction

### Key Entities

- **Projects**: Local directories or git-provider repos (has color for tile display)
- **Tasks**: Work units with agent sessions (status: running/waiting/completed/errored, interactionMode: ask/auto/plan)
- **Providers**: Git provider credentials (Azure DevOps, GitHub, GitLab)
- **Settings**: App configuration (key-value pairs, e.g., editor preference)
- **Agent Messages**: Persisted messages from agent sessions (messageIndex for ordering)

### Agent Integration

The agent service (`electron/services/agent-service.ts`) manages Claude Agent SDK sessions:

- **Interaction Modes**: `ask` (prompt for permissions), `auto` (bypass permissions), `plan` (show plan first, default)
- **Session Lifecycle**: Start → Stream messages → Handle permissions/questions → Complete/Error
- **Persistence**: Messages stored in `agent_messages` table with JSON-serialized content
- **Resumption**: Sessions can be resumed via stored `sessionId`
- **Notifications**: Desktop notifications for permission requests, questions, and completion
- **Message Queue**: Users can queue messages while the agent is busy; queued prompts execute sequentially
- **Usage Tracking**: Claude Code OAuth usage stats displayed in header (5-hour and 7-day limits)

Agent events flow via IPC channels: `agent:message`, `agent:status`, `agent:permission`, `agent:question`, `agent:queue-update`

### Worktree Diff View

Tasks created with worktrees can display a diff view showing all changes since the worktree was created:

- **File tree**: Left panel shows changed files (added/modified/deleted)
- **Diff view**: Right panel shows side-by-side or unified diff
- **Services**: `worktree-service.ts` provides `getWorktreeDiff()` and `getWorktreeFileContent()`
- **Hooks**: `useWorktreeDiff` and `useWorktreeFileContent` for React Query integration
- **State**: Diff view open/closed state persisted in navigation store

The diff is calculated between the task's `startCommitHash` (captured at worktree creation) and the current working tree.

## File Structure

```
electron/              # Main process
  main.ts              # Window creation, app lifecycle
  preload.ts           # IPC bridge exposed to renderer
  ipc/handlers.ts      # IPC route handlers
  database/            # SQLite layer (schema, migrations, repositories)
  services/            # Business logic
    agent-service.ts   # Claude Agent SDK integration
    agent-usage-service.ts  # Claude Code OAuth usage stats
    notification-service.ts
    worktree-service.ts     # Git worktree creation and diff

shared/                # Types shared between main and renderer
  types.ts             # Domain types (Project, Task, Provider, InteractionMode)
  agent-types.ts       # Agent-specific types (AgentMessage, ContentBlock, etc.)
  usage-types.ts       # Claude usage API types

src/                   # Renderer (React)
  routes/              # TanStack Router file-based routes
  layout/              # App shell components (header, sidebars)
  features/            # Feature-based components
    agent/             # Message stream, timeline, tool cards, mode selector, diff view, etc.
    project/           # Project tile
    task/              # Task list item
    settings/          # Debug database viewer
  common/ui/           # Atomic reusable UI components
  hooks/               # React Query and custom hooks
  stores/              # Zustand stores for UI state
    navigation.ts      # Last visited location, per-task pane state, diff view state
    new-task-form.ts   # Per-project task form drafts
    task-messages.ts   # Queued prompts by task
  lib/                 # Utilities (api.ts, colors.ts, time.ts, worktree.ts)

docs/plans/            # Design and implementation documents
```

### Pages

| Route                                | Purpose                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `/`                                  | Redirects to last visited project/task (persisted in navigation store)     |
| `/settings`                          | Configure editor preferences; debug database viewer                        |
| `/projects/new`                      | Two-step wizard to add a local project (folder picker → name/color)        |
| `/projects/:projectId`               | Project layout with sidebar listing tasks                                  |
| `/projects/:projectId/tasks/new`     | Form to create a task with prompt, mode, and worktree options              |
| `/projects/:projectId/tasks/:taskId` | Main agent UI: message stream, file preview, diff view, permissions, input |

## Development Notes

- macOS: Uses `hiddenInset` title bar with custom traffic light positioning
- All IPC methods are async and go through the preload bridge
- Database auto-migrates on app startup
- Route params use `$paramName` convention (e.g., `$projectId.tsx`)
- See `ROADMAP.md` for feature phases and `docs/plans/` for detailed designs
- Coding agent does not need to try to run `pnpm dev` itself; it should focus on implementing features as per the roadmap and designs.

## Coding Guidelines

### General Principles

- Write TypeScript with strict mode enabled
- File and folder names should be kebab-case
- Favorise single object parameter for functions over multiple positional parameters

### React Components

- Use functional components with hooks (no class components)
- Inline props typing instead of declaring an interface separately
- Colocate component-specific types in the same file
- Extract reusable logic (when we actually need to reuse) into custom hooks in `src/hooks/`

#### Component Organization

Components are organized by location:

- `src/layout/` - App shell components (header, sidebars)
- `src/features/<domain>/` - Feature components grouped by domain (agent, project, task, settings)
- `src/common/ui/` - Atomic reusable components
- Route files - Route-specific components that aren't reused stay in the route file

#### Naming Conventions

- Files and folders: kebab-case
- Components outside `src/common/ui/`: prefix with `ui-` (e.g., `ui-message-stream`)
- Components inside `src/common/ui/`: no prefix (e.g., `status-indicator`)
- Hooks: prefix with `use-` (e.g., `use-projects.ts`)

#### Folder Structure

Each component lives in its own folder with an `index.tsx`:

```
src/features/agent/ui-message-stream/
  index.tsx              # Main component
  local-subcomponent.tsx # Co-located local components (if needed)
```

No barrel files (index.ts re-exports). Import directly from component folders:

```ts
import { MessageStream } from '@/features/agent/ui-message-stream';
```

### Electron IPC

- All IPC methods must be typed in `src/lib/api.ts`
- Handler implementations go in `electron/ipc/handlers.ts`
- Keep main process code synchronous where possible; async only for I/O
- Never expose Node.js APIs directly to renderer; always go through preload bridge

### Database

- Use Kysely's type-safe query builder; avoid raw SQL
- All schema changes require a migration
- Repository methods should return plain objects, not database rows
- Handle errors at the repository level; don't let SQL errors bubble up

### Error Handling

- Use explicit error types; avoid throwing generic `Error`
- Log errors with context (what operation failed, relevant IDs)
- UI should show user-friendly messages; technical details go to console

### Testing

- Test business logic in isolation from UI
- Mock IPC calls in renderer tests
- Database tests should use in-memory SQLite

### Claude Agent SDK

Docs: https://platform.claude.com/docs/en/agent-sdk/overview
