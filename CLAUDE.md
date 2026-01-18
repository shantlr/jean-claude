# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idling is an Electron desktop app for managing coding agents across multiple projects. It uses the Claude Code Agent SDK to spawn and manage agent sessions. The app follows a two-process architecture: Electron main process (Node.js) handles database and IPC, while the renderer process (React) handles the UI.

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

The renderer calls `window.api.*` methods which are defined in `preload.ts` and handled in `ipc/handlers.ts`. Types are shared via `src/lib/api.ts`.

### State Management

- **Server state**: TanStack React Query with hooks in `src/hooks/` (useProjects, useTasks, useProviders)
- **UI state**: Zustand stores in `src/stores/` (sidebar collapse, last visited project)
- **Routing**: TanStack Router with file-based routes in `src/routes/`

### Database

SQLite via better-sqlite3 + Kysely (type-safe query builder):
- Schema types: `electron/database/schema.ts`
- Migrations: `electron/database/migrations/`
- Repositories: `electron/database/repositories/`

To add a migration:
1. Create `electron/database/migrations/NNN_name.ts` with `up()` and `down()` functions
2. Register in `electron/database/migrator.ts`
3. Update types in `schema.ts`

### Key Entities

- **Projects**: Local directories or git-provider repos (has color for tile display)
- **Tasks**: Work units with agent sessions (status: running/waiting/completed/errored)
- **Providers**: Git provider credentials (Azure DevOps, GitHub, GitLab)

## File Structure

```
electron/           # Main process
  main.ts          # Window creation, app lifecycle
  preload.ts       # IPC bridge exposed to renderer
  ipc/handlers.ts  # IPC route handlers
  database/        # SQLite layer (schema, migrations, repositories)

src/               # Renderer (React)
  routes/          # TanStack Router file-based routes
  components/      # UI components
  hooks/           # React Query hooks for data fetching
  stores/          # Zustand stores for UI state
  lib/api.ts       # Typed IPC client interface
```

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
- file and folder names should be kebab-case

### React Components

- Use functional components with hooks (no class components)
- Colocate component-specific types in the same file
- Extract reusable logic (when we actually need to reuse) into custom hooks in `src/hooks/`

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