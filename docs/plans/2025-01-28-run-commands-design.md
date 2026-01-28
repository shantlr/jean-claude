# Run Commands Feature Design

## Overview

Add a "Run" button to the task page that executes project-configured commands (e.g., dev servers). Commands are defined at the project level with optional port associations. When ports are in use, the user is prompted to confirm killing those processes before starting.

## Data Model

### New Table: `project_commands`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| projectId | TEXT (FK) | References projects.id, ON DELETE CASCADE |
| command | TEXT | The full command (e.g., "pnpm dev") |
| ports | TEXT | JSON array of port numbers (e.g., "[3000, 3001]") |
| createdAt | TEXT | ISO timestamp |

Package manager detection is done at runtime by checking for lockfiles in the project path—no need to store it.

## Project Settings UI

**Location:** `/projects/:projectId/details`

**New section: "Run Commands"**

- List of command cards (add/remove)
- Each card contains:
  - Command input with autocomplete (detects package manager + package.json scripts)
  - Port chip input (tag-style, removable chips)
  - Delete button
- "Add Command" button at the bottom

**Autocomplete behavior:**
- Fetch package.json scripts from project path
- Detect package manager from lockfile:
  - `pnpm-lock.yaml` → "pnpm"
  - `yarn.lock` → "yarn"
  - `package-lock.json` → "npm"
  - `bun.lockb` → "bun"
- Prefix suggestions: `pnpm dev`, `pnpm build`, etc.
- User can type any custom command (not limited to package.json scripts)

## Task Page Run Button

**Location:** Task header, between session ID and Editor button

**States:**

1. **No commands configured:** Button hidden or grayed out with tooltip
2. **Ready:** Green button with play icon `[▶ Run]`
3. **Running:** Red button with stop icon + status badge `[■ Stop] [2/2 running]`
4. **Partial:** Red stop button + yellow badge `[■ Stop] [1/2 running]`

**Behavior:**
- **Click Run:** Check ports → start all commands in parallel
- **Click Stop:** Kill all spawned processes (tracked by PID)
- **Working directory:** `task.worktreePath` if exists, else `project.path`

## Backend Service

### New Service: `run-command-service.ts`

**Responsibilities:**
- Track running processes per project (Map of projectId → child processes)
- Check if ports are in use before starting
- Spawn commands with correct working directory
- Clean up all processes on app quit

**Key Types:**

```typescript
type CommandStatus = 'running' | 'stopped' | 'errored';

type RunStatus = {
  isRunning: boolean;
  commands: Array<{
    id: string;
    command: string;
    status: CommandStatus;
    pid?: number;
  }>;
};

type PortInUse = {
  port: number;
  commandId: string;
  processInfo?: string; // e.g., "node (pid 1234)"
};

class PortsInUseError extends Error {
  portsInUse: PortInUse[];
}
```

**Key Functions:**

```typescript
// Start all commands for a project
// Throws PortsInUseError if any configured ports are occupied
startCommands(projectId: string, workingDir: string): Promise<RunStatus>

// Stop all running commands for a project (only processes we spawned)
stopCommands(projectId: string): Promise<void>

// Get current status
getRunStatus(projectId: string): RunStatus

// Check which ports are in use
checkPorts(ports: number[]): Promise<PortCheckResult[]>

// Kill ports for a specific command (user-confirmed action)
killPortsForCommand(projectId: string, commandId: string): Promise<void>
```

### Port Conflict Flow

1. User clicks "Run"
2. Backend checks all configured ports
3. If ports are free → start all commands
4. If ports in use → throw `PortsInUseError` with details
5. UI shows confirmation modal: "Ports 3000, 6006 are in use. Kill these processes?"
6. User confirms → UI calls `killPortsForCommand` for each affected command
7. UI retries `startCommands`

### App Lifecycle

On app `before-quit` event, call `stopAllCommands()` to kill all tracked processes.

## IPC Layer

**New channels:**

```typescript
runCommands: {
  start: (projectId: string, workingDir: string) => Promise<RunStatus>;
  stop: (projectId: string) => Promise<void>;
  getStatus: (projectId: string) => Promise<RunStatus>;
  killPortsForCommand: (projectId: string, commandId: string) => Promise<void>;
  onStatusChange: (callback: (projectId: string, status: RunStatus) => void) => () => void;
}
```

**Error handling:** `PortsInUseError` is serialized and reconstructed in the renderer.

## React Integration

### Hook: `useRunCommands(projectId, workingDir)`

```typescript
const {
  status,           // RunStatus | null
  isRunning,        // boolean (any command running)
  start,            // () => Promise<void>
  stop,             // () => Promise<void>
  portsInUseError,  // PortsInUseError | null
  confirmKillPorts, // () => Promise<void>
  dismissPortsError // () => void
} = useRunCommands(projectId, workingDir);
```

### Hook: `useProjectCommands(projectId)`

CRUD operations for project commands configuration.

```typescript
const {
  commands,         // ProjectCommand[]
  addCommand,       // (command: string, ports: number[]) => Promise<void>
  updateCommand,    // (id: string, updates: Partial<ProjectCommand>) => Promise<void>
  deleteCommand,    // (id: string) => Promise<void>
} = useProjectCommands(projectId);
```

### Hook: `usePackageScripts(projectPath)`

Fetches package.json scripts and detects package manager.

```typescript
const {
  scripts,          // string[] (e.g., ["pnpm dev", "pnpm build"])
  packageManager,   // "pnpm" | "npm" | "yarn" | "bun" | null
  isLoading,
} = usePackageScripts(projectPath);
```

## File Structure

### New Files

```
electron/
  services/
    run-command-service.ts
  database/
    migrations/
      NNN_add_project_commands.ts
    repositories/
      project-commands-repository.ts

shared/
  run-command-types.ts

src/
  hooks/
    use-run-commands.ts
    use-project-commands.ts
    use-package-scripts.ts
  features/
    project/
      ui-run-commands-config/
        index.tsx
        command-row.tsx
        port-chip-input.tsx
    agent/
      ui-run-button/
        index.tsx
        kill-ports-modal.tsx
```

### Modified Files

- `electron/ipc/handlers.ts` — Add run command IPC handlers
- `electron/preload.ts` — Expose run command API
- `src/lib/api.ts` — Add run command types
- `src/routes/projects/$projectId/details.tsx` — Add RunCommandsConfig section
- `src/routes/projects/$projectId/tasks/$taskId.tsx` — Add RunButton to header
- `electron/main.ts` — Add app quit cleanup

## UI Components

### RunButton (task header)

- Green play button when idle
- Red stop button when running
- Status badge showing command count
- Triggers kill-ports modal on PortsInUseError

### KillPortsModal

- Shows list of ports in use with process info
- "Kill & Start" button to proceed
- "Cancel" button to dismiss

### RunCommandsConfig (project settings)

- Section with list of CommandRow components
- "Add Command" button

### CommandRow

- Command text input with autocomplete dropdown
- PortChipInput for managing ports
- Delete button

### PortChipInput

- Displays ports as removable chips
- Small input field to add new ports
- Validates port numbers (1-65535)
