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
Renderer (React) ←→ Preload Bridge ←→ Main Process (Node.js)
     ↓                    ↓                    ↓
  src/lib/api.ts   electron/preload.ts   electron/ipc/handlers.ts
```

The renderer calls `window.api.*` methods which are defined in `preload.ts` and handled in `ipc/handlers.ts`. Types are shared via `src/lib/api.ts` and `shared/`.

### State Management

- **Server state**: TanStack React Query with hooks in `src/hooks/` (useProjects, useTasks, useProviders, useSettings, useAgent)
- **UI state**: Zustand stores in `src/stores/` (navigation, new task draft, task messages, overlays, ui, background jobs, toasts, task prompts)
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

Global overlays (modals that can only have one open at a time) use the `overlays` store:

```ts
// Open an overlay
const open = useOverlaysStore((s) => s.open);
open('command-palette');

// Check if overlay is open
const overlay = useOverlaysStore((s) => s.overlay);
if (overlay === 'new-task') { ... }

// Close current overlay
const close = useOverlaysStore((s) => s.close);
close();
```

Available overlay types: `'new-task' | 'command-palette'`

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
  // 1. Disable FK constraints to prevent cascade deletes
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);
  await db.transaction().execute(async (trx) => {

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

    const fkCheck = await sql<{
      table: string;
    }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
  // 5. Re-enable FK constraints and verify integrity
  await sql`PRAGMA foreign_keys = ON`.execute(trx);
}
```

Key points:

- Always wrap in `db.transaction().execute()`
- Use `PRAGMA foreign_keys = OFF` before dropping tables with FK references
- Verify FK integrity with `PRAGMA foreign_key_check` before committing
- Use `trx` (not `db`) for all operations inside the transaction

### Key Entities

- **Projects**: Local directories or git-provider repos (has color for tile display, defaultBranch for worktree merges, defaultAgentBackend for backend selection, optional repo/work item linking)
- **Tasks**: Work units containing one or more steps (status: running/waiting/completed/errored/interrupted, agentBackend: claude-code/opencode, branchName for worktree tasks, sourceBranch for tracking origin, pendingMessage for ad-hoc notes, optional pullRequestId/pullRequestUrl)
- **Task Steps**: Individual agent sessions within a task (status: pending/ready/running/completed/errored/interrupted, type: agent/create-pull-request/fork, each with its own interactionMode, modelPreference, agentBackend, sessionId, promptTemplate, images, and meta)
- **Providers**: Git provider credentials (Azure DevOps, GitHub, GitLab)
- **Settings**: App configuration (key-value pairs, e.g., editor preference, backends configuration, completion settings)
- **Agent Messages**: Normalized message entries from agent sessions (one row per semantic entry with type, toolId, parentToolId, data, model)
- **Raw Messages**: Original SDK responses stored separately for debugging (keyed by rawMessageId)
- **Project Commands**: Run command configurations per project (command string, ports to monitor)
- **Project Todos**: Per-project backlog items (content, sortOrder, convertible to tasks)
- **MCP Templates**: Model Context Protocol server configurations with variable substitution
- **Project MCP Overrides**: Per-project enable/disable of MCP templates
- **Task Summaries**: AI-generated summaries with "What I Did", "Key Decisions", and file annotations
- **Completion Usage**: Daily autocomplete token/cost tracking (per-day aggregates of prompt tokens, completion tokens, requests)

### Agent Backend Abstraction

The app supports multiple agent backends through a common interface (`shared/agent-backend-types.ts`):

- **Backend Types**: `AgentBackendType` = `'claude-code' | 'opencode'`
- **Interface**: `AgentBackend` with methods: `start()`, `stop()`, `respondToPermission()`, `respondToQuestion()`, `setMode()`, `dispose()`
- **Configuration**: `AgentBackendConfig` with optional model selection and session resumption
- **Implementations**: Located in `electron/services/agent-backends/`
  - `claude/claude-code-backend.ts` — Wraps Claude Code Agent SDK
  - `opencode/opencode-backend.ts` — Wraps OpenCode SDK (`@opencode-ai/sdk`) with SSE streaming
- **Per-project default**: Projects can set `defaultAgentBackend` to override the global default
- **Per-task selection**: Each task stores its `agentBackend` explicitly

### Message Normalization V2

Messages from different backends are normalized to a unified schema (`shared/normalized-message-v2.ts`):

- **Flat schema**: One row per semantic entry (user-prompt, assistant-message, thinking, system-status, result, tool-use)
- **Thinking entries**: Extended thinking / chain-of-thought blocks from Claude (`thinking` content blocks) and OpenCode (`reasoning` parts), rendered as collapsible entries in the timeline
- **Tool-use types**: Typed per tool — bash, read, glob, grep, mcp, ask-user-question, write, edit, todo-write, exit-plan-mode, skill, web-fetch, web-search, sub-agent
- **Normalizers**: Each backend has its own normalizer converting SDK messages to `NormalizationEvent[]`
  - `claude/normalize-claude-message-v2.ts`
  - `opencode/normalize-opencode-message-v2.ts`
- **Raw preservation**: Original SDK responses stored in `raw_messages` table for debugging/audit
- **Token/cost tracking**: Each entry can carry token usage and cost information

### Agent Integration

The agent service (`electron/services/agent-service.ts`) manages agent backend sessions:

- **Interaction Modes**: `ask` (prompt for permissions), `auto` (bypass permissions), `plan` (show plan first, default)
- **Session Lifecycle**: Start → Stream messages → Handle permissions/questions → Complete/Error
- **Persistence**: Normalized messages stored in `agent_messages` table, raw messages in `raw_messages` table
- **Resumption**: Sessions can be resumed via stored `sessionId`
- **Notifications**: Desktop notifications for permission requests, questions, and completion (auto-close supported)
- **Message Queue**: Users can queue messages while the agent is busy; queued prompts execute sequentially
- **Usage Tracking**: Claude Code OAuth usage stats displayed in header (5-hour and 7-day limits)
- **Model Selection**: Per-task `modelPreference` allows choosing specific models (opus, sonnet, haiku, or backend-specific models)
- **Backend Models**: Dynamic model discovery per backend via `backend-models-service.ts` (OpenCode discovers via CLI with 5-min cache, Claude Code uses static list)

Agent events flow via IPC channels: `agent:message`, `agent:status`, `agent:permission`, `agent:question`, `agent:queue-update`, `agent:name-updated`

**Task Name Generation**: Task names are auto-generated from prompts using Claude Haiku with structured JSON output. Names are limited to 40 characters for worktree directory compatibility. Handled by `name-generation-service.ts`.

**Permission Allow Modes**: When granting permissions, users can choose scope:

- Session only (default)
- Project-wide (persisted in `.claude/settings.local.json`)
- Worktree-specific (persisted in `.claude/settings.local.worktrees.json`)

### Task Steps (Multi-Step Workflow)

Tasks support multiple sequential steps, each representing an independent agent session. This moves from a flat conversation model to a structured workflow where users can orchestrate multi-step tasks with different configurations per step.

- **Database**: `task_steps` table with FK to `tasks`, stored in `electron/database/repositories/task-steps.ts`
- **Types**: `TaskStep`, `NewTaskStep`, `UpdateTaskStep` in `shared/types.ts`
- **Step Types**: `TaskStepType` = `'agent' | 'create-pull-request' | 'fork'`
- **Step Statuses**: `TaskStepStatus` = `'pending' | 'ready' | 'running' | 'completed' | 'errored' | 'interrupted'`
- **Per-step config**: Each step has its own `interactionMode`, `modelPreference`, `agentBackend`, `sessionId`, `promptTemplate`, `resolvedPrompt`, and `images`
- **Step Meta**: Typed metadata depending on step type — `CreatePullRequestStepMeta` (PR params/result), `ForkStepMeta` (tracks origin step/session)
- **Ordering**: `sortOrder` field for sequential display; `dependsOn` field (JSON array of step IDs) for dependency tracking
- **Auto-creation**: Task creation automatically creates an initial step with the task's prompt and configuration
- **Message isolation**: The task-messages store is keyed by `stepId` (not `taskId`), so each step has independent message history, status, permissions, and queued prompts
- **LRU cache**: Up to 25 inactive steps cached in memory; oldest accessed steps evicted when limit exceeded

**Step Flow Bar** (`src/features/task/ui-step-flow-bar/`):

- Horizontal bar of interactive step chips with animated status indicators (spinner for running, checkmark for completed, etc.)
- Connectors between steps with animated transitions for running/completed states
- Clicking a step sets `activeStepId` in the navigation store
- "Add Step" button at the end with `Cmd+Shift+N` shortcut

**Add Step Dialog** (`src/features/task/ui-task-panel/add-step-dialog.tsx`):

- Modal for creating new steps with prompt textarea, mode selector (`Cmd+I`), backend selector (`Cmd+J`), model selector (`Cmd+L`)
- Supports image attachment
- Returns `{ promptTemplate, interactionMode, agentBackend, modelPreference, images }`

### Background Jobs

Long-running operations run as background jobs instead of blocking the UI (`src/stores/background-jobs.ts`):

- **Job types**: `'task-creation' | 'summary-generation' | 'task-deletion' | 'merge'`
- **States**: running → succeeded/failed (with timestamps and error messages)
- **Persistence**: Zustand store with persist middleware
- **Association**: Jobs link to taskId/projectId for context
- **UI**: Background jobs overlay shows running/completed jobs
- **Integration**: Task creation, merge, deletion, and summary generation all use background jobs

### Worktree Diff View

Tasks created with worktrees can display a diff view showing all changes since the worktree was created:

- **File tree**: Left panel shows changed files (added/modified/deleted), resizable
- **Diff view**: Right panel shows side-by-side or unified diff with change navigation
- **Services**: `worktree-service.ts` provides `getWorktreeDiff()` and `getWorktreeFileContent()`
- **Hooks**: `useWorktreeDiff` and `useWorktreeFileContent` for React Query integration
- **State**: Diff view open/closed state persisted in navigation store
- **Navigation**: Change navigator for jumping between diff hunks

The diff is calculated between the task's `startCommitHash` (captured at worktree creation) and the current working tree. Falls back to local branch comparison when available.

### Worktree Actions

Worktree tasks have commit and merge capabilities:

- **Commit**: Stage and commit all changes (including unstaged) with a custom message
- **Merge**: Merge worktree branch into target branch (with squash option, conflict detection)
- **Conflict Detection**: Dry-run merge check via `checkMergeConflicts()` before attempting real merge
- **Create PR**: Create Azure DevOps pull request from worktree branch (with work item linking)
- **Push Branch**: Push worktree branch to remote
- **Delete Worktree**: Clean up worktree on task completion or manual deletion
- **Default branch**: Projects can specify a default merge target branch
- **UI Components**: `ui-worktree-actions/` with commit modal, merge confirm/success dialogs, create PR dialog

### File Explorer

Tasks with worktrees can browse the worktree file system (`src/features/task/ui-task-panel/file-explorer-pane/`):

- **Tree view**: Left panel with directory expansion/collapse
- **File content**: Right panel showing selected file content
- **Resizable**: Both panels independently resizable with persisted widths
- **Hooks**: `useDirectoryListing` for filesystem queries

### Project Todos (Backlog)

Per-project todo lists for tracking planned work (`src/features/project/ui-backlog-overlay/`):

- **CRUD**: Create, edit, delete, reorder items
- **Drag-to-reorder**: Visual drag feedback with sort order persistence
- **Convert to task**: One-click conversion from backlog item to agent task (runs as background job)
- **Database**: `project_todos` table with content, sortOrder
- **Hooks**: `useProjectTodos()`, `useCreateProjectTodo()`, `useUpdateProjectTodo()`, `useDeleteProjectTodo()`, `useReorderProjectTodos()`

### Autocomplete (Code Completion)

Inline code completion powered by Mistral Codestral FIM (`electron/services/completion-service.ts`):

- **Engine**: Mistral Fill-in-the-Middle (FIM) completions via `@mistralai/mistralai` SDK
- **Configuration**: Enable/disable, API key (encrypted), model (default: `codestral-latest`), server URL
- **Settings UI**: `ui-autocomplete-settings/` with getting-started guide and connection test
- **Integration**: `useInlineCompletion` hook in message input, Tab to accept
- **API**: `complete({ prompt, suffix })` returns suggested completion or null
- **Usage Tracking**: Daily token/cost tracking with `completion_usage` table (date PK, promptTokens, completionTokens, requests). Each completion request auto-records usage via upsert. Cost calculated using Codestral pricing ($0.30/M input, $0.90/M output)
- **Cost Display**: `CompletionCostDisplay` in app header shows `FIM $X.XX` with tooltip breakdown (requests, input/output tokens + cost). Hidden until first request of the day. Polls every 60 seconds via `useCompletionDailyUsage()` hook

### Pending Messages

Ad-hoc notes attached to tasks (`tasks.pendingMessage` field):

- **Storage**: Nullable text field on tasks table
- **UI**: `pending-message-input.tsx` component with auto-save on blur/Enter
- **Display**: Shown in task summary card when present
- **Purpose**: Store next steps or notes without creating agent messages

### Prompt Textarea

The shared prompt textarea component (`src/features/common/ui-prompt-textarea/`) is used across the app (message input, add step dialog, new task form) and provides rich authoring features:

- **Slash commands**: Type `/` to see built-in commands (`/init`, `/compact`) and available skills in a dropdown
- **@mention file paths**: Type `@` followed by a path to get file path suggestions (limit 8 results)
- **Inline FIM completion**: Ghost text completion from Mistral FIM (accept with Tab, dismiss with Escape)
- **Image attachment**: Paste, drag-and-drop, or file picker for images (max 5 images, 10MB each, PNG/JPEG/GIF/WebP/AVIF). Auto-compressed. Thumbnail preview grid with remove on hover
- **Dropdown navigation**: Arrow keys for selection, Enter to confirm, Escape to dismiss. Smart top/bottom positioning based on viewport space
- **Message queuing**: When agent is running, send button becomes "Queue" (amber). Double-Escape with empty input interrupts running agent

### Skills System

The skills service (`electron/services/skill-management-service.ts`) discovers and manages skills for all agent backends:

- **Canonical Storage**: All JC-managed user skills live in `~/.config/jean-claude/skills/<backendType>/user/<skillName>/`
- **Symlink System**: Backend-expected paths use symlinks pointing to the canonical location (e.g., `~/.claude/skills/<skillName>` → canonical). Enable = create symlink; disable = remove symlink (skill never deleted)
- **Skill Sources** (priority order): JC-managed user > legacy user > project (`.claude/skills/`) > plugins (`~/.claude/plugins/cache/`)
- **Backend-aware**: Each backend has its own skill path configuration (Claude Code uses `~/.claude/skills/`, OpenCode uses `~/.config/opencode/skills/`)
- **Discovery**: Each skill has a `SKILL.md` file with YAML frontmatter (`name`, `description`)
- **Deduplication**: Skills are merged by name, higher priority sources override lower
- **Types**: `ManagedSkill` (full metadata with source, enabled, editable, backendType), `SkillScope` (`'user' | 'project'`)
- **Editability**: JC-managed user/project skills are editable; legacy and plugin skills are read-only
- **UI Display**: Skills appear in message timeline as expandable entries showing the skill documentation

**Skills Settings UI** (`src/features/settings/ui-skills-settings/`):

- **Card Grid**: Responsive grid (`skill-card-grid.tsx`) with cards showing name, description, backend badge (orange for Claude Code, blue for OpenCode), source badge, and enabled status
- **Details/Form**: Right pane shows read-only details for non-editable skills or an edit form for editable skills (name, description, markdown content)
- **Project-level**: `src/features/project/ui-project-skills-settings/` filters by project's default backend, separates project vs inherited skills
- **Hooks**: `useManagedSkills()`, `useAllManagedSkills()`, `useSkillContent()`, `useCreateSkill()`, `useUpdateSkill()`, `useDeleteSkill()`, `useEnableSkill()`, `useDisableSkill()`

**Legacy Skill Migration** (`legacy-skill-migration-dialog.tsx`):

- **Purpose**: Migrate manually installed skills from backend-specific paths into JC canonical storage
- **Preview**: `skills:migrationPreview` IPC discovers candidates across all backends, classifying each as `'migrate'`, `'skip-conflict'`, or `'skip-invalid'`
- **Execute**: `skills:migrationExecute` copies skill to canonical, replaces legacy with symlink, with per-item rollback on failure
- **UI**: Modal dialog showing grouped items by backend with status badges and result summary

### Context Usage Tracking

The context usage display tracks token consumption during agent sessions:

- **Tracking**: Cumulative token count from agent messages, resets on `compact_boundary`
- **Display**: Color-coded progress bar (blue → green → yellow → orange at 85%+)
- **Hook**: `useContextUsage` calculates percentage of context window used
- **Location**: Shown in task header during active sessions

### Pull Request Management

Projects linked to Azure DevOps repositories can create and view pull requests:

- **PR Creation**: Create PR from worktree branch with title, description, draft mode, work item linking
- **PR Viewing**: Full PR viewer with tabs for overview, files, commits, comments
- **PR in Task Panel**: Inline PR view within task panel (`ui-task-pr-view/`)
- **PR Badge**: Inline badge on tasks showing linked PR number with link to Azure DevOps
- **Task Linking**: Tasks store `pullRequestId` and `pullRequestUrl` after PR creation
- **Hooks**: `usePullRequests`, `usePullRequest`, `useCreatePullRequest`

### Azure DevOps Integration

Projects can link to Azure DevOps for enhanced workflows:

- **Repository Linking**: Projects can link to a repo for PR creation (stores `repoProviderId`, `repoProjectId`, `repoId`, etc.)
- **Work Items Linking**: Projects can link to a work items project for task/work item association
- **Work Item Grouping**: Work items support parent-child grouping hierarchy
- **Repository Cloning**: Clone repos via SSH with `ui-clone-repo-pane` (organization → project → repo selection)
- **Work Items Browser**: Search and filter work items by state/type (Test Suite filtered out), create tasks from work items
- **Image Proxy**: `azure-image-proxy-service.ts` proxies images from Azure DevOps through authenticated requests
- **Service**: `azure-devops-service.ts` handles all Azure DevOps API calls

### Run Commands

Projects can define shell commands with port monitoring:

- **Configuration**: Command string + ports to check/kill before starting
- **Auto-detection**: Detects package manager (pnpm/yarn/npm/bun) and workspaces
- **Package Scripts**: Discovers available scripts from package.json via `getPackageScripts()`
- **Process Tracking**: Monitors running processes, status callbacks for UI updates
- **Service**: `run-command-service.ts` handles execution, port management, workspace discovery

### Permission Settings

The permission settings service manages worktree-specific permissions:

- **Files**: `.claude/settings.local.json` (base) and `.claude/settings.local.worktrees.json` (worktree-specific)
- **Merge**: Worktree permissions are unioned with base permissions
- **Security**: Bare "Bash" permission never allowed; must use `Bash(exact command)` format
- **Service**: `permission-settings-service.ts` handles reading, writing, and merging permissions

### File Diff Abstraction

Unified interface for displaying diffs from different sources:

- **Types**: `DiffFile`, `DiffFileStatus` (added/modified/deleted)
- **Normalization**: Converts Azure change types (add/edit/delete/rename) to standard format
- **Components**: `src/features/common/ui-file-diff/` with file tree, status badge, diff content, header
- **Usage**: Shared by worktree diff view and PR diff view

### MCP Template System

The MCP (Model Context Protocol) template service manages MCP server configurations:

- **Service**: `mcp-template-service.ts` handles template CRUD, presets, and variable substitution
- **Presets**: Built-in MCP templates (e.g., Serena) with predefined commands and variables
- **User Templates**: Custom templates stored in database with configurable variables
- **Project Overrides**: Per-project enable/disable of templates via `project_mcp_overrides` table
- **Variable Types**: Supports folder, file, and text input types for template variables
- **Auto-install**: Templates can be configured to auto-install when creating worktrees
- **Settings UI**: Managed via `/settings/mcp-servers` route

### Task Summaries

AI-generated summaries for completed tasks:

- **Content**: "What I Did" and "Key Decisions" sections with markdown formatting
- **Annotations**: File-level annotations with line numbers and explanations
- **Storage**: Unique per `(taskId, commitHash)` pair in `task_summaries` table
- **Generation**: On-demand via `useGenerateSummary()` mutation (runs as background job)
- **Display**: Summary panel in task sidebar with unread indicator, task summary card component

### Encryption Service

Secure credential storage using Electron's `safeStorage` API:

- **Service**: `encryption-service.ts` provides `encrypt()` and `decrypt()` functions
- **Usage**: Secures token storage, API keys (e.g., Mistral autocomplete), and sensitive credentials in the database

### Toast Notifications

App-wide toast notification system (`src/stores/toasts.ts`):

- **Store**: Zustand-based toast state management
- **UI**: `src/common/ui/toast/` component for displaying notifications
- **Types**: Success, error, and info notifications with auto-dismiss

### Modal & Overlay Contexts

Enhanced modal and overlay management (`src/common/context/`):

- **Modal Context** (`modal/`): Centralized modal management with typed modal definitions
- **Overlay Context** (`overlay/`): Tracks active overlays to prevent conflicts (e.g., dropdowns vs modals)

### Keyboard Bindings System

Global keyboard binding system using React Context (`src/common/context/keyboard-bindings/`):

- **`RootKeyboardBindings`**: Provider wrapping the entire app (in `src/app.tsx`)
- **`useRegisterKeyboardBindings`**: Hook for components to register bindings
- **`BindingKey` type**: Type-safe binding definitions with full modifier support (cmd/ctrl/alt/shift)
- **Priority**: Most recently registered bindings are checked first; first handler to return `true` or `undefined` stops propagation
- **Input awareness**: Bindings can use `ignoreIfInput` config to skip when typing in input/textarea

### Keyboard Layout Detection

Support for AZERTY and other keyboard layouts (`src/common/context/keyboard-layout/`):

- **`DetectKeyboardLayout`**: Component that discovers user's keyboard layout via Keyboard API (rendered in `src/app.tsx`)
- **`useKeyboardLayout()`**: Hook to access detected layout mappings
- **`getLayoutAwareDigit()`**: Utility to get correct display character for digit keys based on detected layout
- Physical key codes used for digit binding to support layout-independent shortcuts

### Commands System

Unified command registration that handles both keyboard shortcuts and command palette entries:

- **`useCommands(id, commandArray)`**: Single hook for components to register commands (`src/common/hooks/use-commands/`)
  - Defines label, shortcut (single or multiple), handler, keywords, section, and hideInCommandPalette
  - Automatically registers bindings AND command palette entries
  - Zustand store maintains prioritized source list
- **`useCommandSources()`**: Hook to retrieve all registered commands for command palette
- **Decentralized registration**: Commands defined where they're used (e.g., global commands in `src/routes/__root.tsx`)

### Command Palette

Global command search and execution overlay:

- **`CommandPaletteOverlay`**: Fuzzy search over all registered commands using Fuse.js
- **Organization**: Commands grouped by section for better discovery
- **Shortcuts**: Cmd+K to open (registered via `useCommands`)
- **`<Kbd>` component**: Renders styled keyboard shortcut display with layout-aware symbols (`src/common/ui/kbd/`)

## File Structure

```
electron/              # Main process
  main.ts              # Window creation, app lifecycle
  preload.ts           # IPC bridge exposed to renderer
  ipc/handlers.ts      # IPC route handlers
  database/            # SQLite layer (schema, migrations, repositories)
    repositories/
      completion-usage.ts  # Daily autocomplete token/cost tracking
      task-steps.ts        # Task step CRUD and queries
  services/            # Business logic
    agent-service.ts   # Agent session lifecycle management
    agent-usage-service.ts  # Claude Code OAuth usage stats
    azure-devops-service.ts # Azure DevOps API integration (repos, PRs, work items)
    azure-image-proxy-service.ts # Proxy for Azure DevOps images
    backend-models-service.ts    # Dynamic model discovery per agent backend
    completion-service.ts        # Mistral FIM autocomplete service
    encryption-service.ts   # Secure credential storage via Electron safeStorage
    global-prompt-service.ts  # Main→renderer prompt dialogs
    mcp-template-service.ts # MCP server template management and presets
    name-generation-service.ts  # Auto-generate task names via Claude Haiku
    notification-service.ts
    permission-settings-service.ts  # Worktree permission management
    run-command-service.ts  # Shell command execution with port monitoring
    skill-management-service.ts  # Unified skills discovery, CRUD, and enable/disable
    summary-generation-service.ts  # AI-generated task summaries
    task-service.ts    # Task lifecycle management
    worktree-service.ts     # Git worktree creation, diff, commit, merge, conflict detection
    agent-backends/    # Agent backend implementations
      index.ts              # Backend type → implementation mapping
      claude/
        claude-code-backend.ts       # Claude Code Agent SDK backend
        normalize-claude-message-v2.ts  # Claude message → normalized entries
      opencode/
        opencode-backend.ts          # OpenCode SDK backend
        normalize-opencode-message-v2.ts  # OpenCode message → normalized entries

shared/                # Types shared between main and renderer
  types.ts             # Domain types (Project, Task, TaskStep, Provider, InteractionMode)
  agent-types.ts       # Agent-specific types (AgentMessage, ContentBlock, TodoItem, etc.)
  agent-backend-types.ts  # Backend abstraction (AgentBackend, AgentBackendType, AgentEvent)
  agent-ui-events.ts   # Agent UI event types
  azure-devops-types.ts  # Azure DevOps API types (PRs, work items, repos)
  global-prompt-types.ts # Main→renderer prompt dialog types
  mcp-types.ts         # MCP template, preset, and variable types
  normalized-message-v2.ts # Normalized message schema (entry types, tool-use types)
  run-command-types.ts # Run command configuration types
  skill-types.ts       # Skill discovery, metadata, managed skill, and migration types
  usage-types.ts       # Claude usage API types

src/                   # Renderer (React)
  routes/              # TanStack Router file-based routes
  layout/              # App shell components (header with completion cost display, sidebars)
  features/            # Feature-based components
    agent/             # Message stream, timeline, tool cards, mode/model/backend selectors, message input, run button, question options, diff view, worktree actions, file explorer, todo list, summary panel
    background-jobs/   # Background jobs overlay
    command-palette/   # Command palette overlay (ui-command-palette-overlay)
    common/            # Shared feature components (ui-file-diff, ui-azure-html-content, ui-prompt-textarea)
    new-task/          # New task overlay, work item list and details, prompt composer
    project/           # Project tile, repo/work items linking, clone pane, run commands config, MCP settings, skills settings, backlog overlay
    pull-request/      # PR viewing (detail, header, overview, diff, commits, comments, list)
    task/              # Task list item, task panel (with file explorer, debug messages, step flow bar, add step dialog), task summary card, task PR view
    settings/          # General settings, debug viewer, Azure DevOps management, MCP servers, tokens, autocomplete settings, skills settings (card grid, migration dialog)
  common/              # Shared infrastructure
    context/           # React contexts
      keyboard-bindings/   # Global keyboard binding system (RootKeyboardBindings, useRegisterKeyboardBindings)
      keyboard-layout/     # Keyboard layout detection (DetectKeyboardLayout, useKeyboardLayout)
      modal/               # Centralized modal management
      overlay/             # Active overlay tracking
    hooks/             # Shared hooks
      use-commands/    # Unified command + keyboard binding registration
      use-dropdown-position.ts  # Smart dropdown positioning
    ui/                # Atomic reusable UI components (kbd, select, dropdown, modal, toast, user-avatar, etc.)
  hooks/               # React Query and custom hooks
  stores/              # Zustand stores for UI state
    navigation.ts      # Last visited location, per-task pane state, activeStepId, diff view state, file explorer widths
    new-task-draft.ts  # Per-project task drafts with search/prompt modes
    new-task-form.ts   # New task form state
    overlays.ts        # Global overlay state (new-task, command-palette)
    background-jobs.ts # Background job queue (task creation, merge, deletion, summary generation)
    task-messages.ts   # Per-step message state (messages, status, permissions, queued prompts) with LRU cache
    task-prompts.ts    # Task prompt management
    toasts.ts          # Toast notification state
    ui.ts              # UI-wide state (sidebar collapsed)
  lib/                 # Utilities (api.ts, colors.ts, time.ts, worktree.ts, number.ts, navigation.ts, azure-image-proxy.ts)

docs/plans/            # Design and implementation documents
```

### Pages

| Route                                | Purpose                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `/`                                  | Redirects to last visited project/task (persisted in navigation store)                                 |
| `/all`                               | Cross-project view showing all active tasks                                                            |
| `/all/:taskId`                       | Task view from cross-project context                                                                   |
| `/all/prs/:projectId`                | Pull requests list from cross-project context                                                          |
| `/all/prs/:projectId/:prId`          | PR detail from cross-project context                                                                   |
| `/settings`                          | Settings overlay with tabbed navigation                                                                |
| `/settings/general`                  | Configure editor preferences                                                                           |
| `/settings/azure-devops`             | Manage Azure DevOps organizations and PAT tokens                                                       |
| `/settings/tokens`                   | Manage tokens for different providers                                                                  |
| `/settings/mcp-servers`              | Manage MCP server templates and presets                                                                |
| `/settings/debug`                    | Debug database viewer with DB size display                                                             |
| `/projects/new`                      | Wizard to add project: local folder, clone repo, or link Azure DevOps repo                             |
| `/projects/:projectId`               | Project layout with sidebar listing tasks and PRs                                                      |
| `/projects/:projectId/tasks/new`     | Form to create a task with prompt, mode, backend, model, worktree options, work item linking           |
| `/projects/:projectId/tasks/:taskId` | Main agent UI: step flow bar, message stream, file preview, diff view, file explorer, debug panel, permissions, input |
| `/projects/:projectId/prs`           | Project pull requests list                                                                             |
| `/projects/:projectId/prs/:prId`     | Pull request viewer with overview, files, commits, comments tabs                                       |

## Development Notes

- macOS: Uses `hiddenInset` title bar with custom traffic light positioning
- All IPC methods are async and go through the preload bridge
- Database auto-migrates on app startup
- Route params use `$paramName` convention (e.g., `$projectId.tsx`)
- See `ROADMAP.md` for feature phases and `docs/plans/` for detailed designs
- Coding agent does not need to try to run `pnpm dev` itself; it should focus on implementing features as per the roadmap and designs.
- When writeing design documents, implementation documents or exectuting implementation task you don't need commit
- When implementation is done, run `pnpm lint --fix` first
- To verify typescript, run `pnpm ts-check` (instead of `tsc` directly)

## Coding Guidelines

### General Principles

- Write TypeScript with strict mode enabled
- File and folder names should be kebab-case
- Favorise single object parameter for functions over multiple positional parameters
- Avoid defining types/interface when you can inline them (only define when reused)

### React Components

- Use functional components with hooks (no class components)
- Inline props typing instead of declaring an interface separately
- Colocate component-specific types in the same file
- Extract reusable logic (when we actually need to reuse) into custom hooks in `src/hooks/`

#### Component Organization

Components are organized by location:

- `src/layout/` - App shell components (header, sidebars)
- `src/features/<domain>/` - Feature components grouped by domain (agent, project, task, settings, background-jobs, pull-request)
- `src/common/ui/` - Atomic reusable components
- Route files - Route-specific components that aren't reused stay in the route file

#### Naming Conventions

- Files and folders: kebab-case
- Components outside `src/common/ui/`: prefix with `ui-` (e.g., `ui-message-stream`)
- Components inside `src/common/ui/`: no prefix (e.g., `status-indicator`)
- SVG icon components should be named with `Icon` prefix (e.g., `IconClaude`, `IconCodex`)
- Hooks: prefix with `use-` (e.g., `use-projects.ts`)
- Utility modules: prefix with `utils-` (e.g., `utils-search-highlight.tsx`)

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

Exception: `src/common/ui/icons/index.ts` is allowed as an icon asset re-export entrypoint.

When a component starts to get bloated, push logic down to the most specific
child component that owns the behavior. Keep parent components focused on
composition and data flow, and keep feature-specific state, fetching/mutations,
validation, and transient UI state (loading/errors) close to where they are
used.

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
