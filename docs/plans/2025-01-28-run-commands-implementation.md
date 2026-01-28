# Run Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Run" button to task pages that executes project-configured commands with port management.

**Architecture:** Database stores project commands with ports. Backend service spawns processes and tracks PIDs. IPC layer exposes start/stop/status APIs. React hook manages state with port conflict modals.

**Tech Stack:** SQLite/Kysely, Node.js child_process, Electron IPC, React Query, Zustand

---

## Task 1: Shared Types

**Files:**
- Create: `shared/run-command-types.ts`

**Step 1: Create the types file**

```typescript
// shared/run-command-types.ts

export type CommandStatus = 'running' | 'stopped' | 'errored';

export interface ProjectCommand {
  id: string;
  projectId: string;
  command: string;
  ports: number[];
  createdAt: string;
}

export type NewProjectCommand = Omit<ProjectCommand, 'id' | 'createdAt'>;
export type UpdateProjectCommand = Partial<Pick<ProjectCommand, 'command' | 'ports'>>;

export interface CommandRunStatus {
  id: string;
  command: string;
  status: CommandStatus;
  pid?: number;
}

export interface RunStatus {
  isRunning: boolean;
  commands: CommandRunStatus[];
}

export interface PortInUse {
  port: number;
  commandId: string;
  command: string;
  processInfo?: string;
}

export interface PortsInUseErrorData {
  type: 'PortsInUseError';
  message: string;
  portsInUse: PortInUse[];
}

export function isPortsInUseError(error: unknown): error is PortsInUseErrorData {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as PortsInUseErrorData).type === 'PortsInUseError'
  );
}

export interface PackageScriptsResult {
  scripts: string[];
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
}
```

**Step 2: Commit**

```bash
git add shared/run-command-types.ts
git commit -m "feat: add shared types for run commands feature"
```

---

## Task 2: Database Migration

**Files:**
- Create: `electron/database/migrations/019_project_commands.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

```typescript
// electron/database/migrations/019_project_commands.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('project_commands')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('command', 'text', (col) => col.notNull())
    .addColumn('ports', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(new Date().toISOString())
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_commands').execute();
}
```

**Step 2: Register the migration in migrator.ts**

Add import at line 19:
```typescript
import * as m019 from './migrations/019_project_commands';
```

Add to migrations record after line 38:
```typescript
  '019_project_commands': m019,
```

**Step 3: Update schema.ts**

Add to Database interface (after line 31):
```typescript
  project_commands: ProjectCommandTable;
```

Add table interface (after SettingsTable):
```typescript
export interface ProjectCommandTable {
  id: Generated<string>;
  projectId: string;
  command: string;
  ports: string; // JSON array stored as text
  createdAt: Generated<string>;
}

export type ProjectCommandRow = Selectable<ProjectCommandTable>;
export type NewProjectCommandRow = Insertable<ProjectCommandTable>;
export type UpdateProjectCommandRow = Updateable<ProjectCommandTable>;
```

**Step 4: Commit**

```bash
git add electron/database/migrations/019_project_commands.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat: add project_commands database table"
```

---

## Task 3: Project Commands Repository

**Files:**
- Create: `electron/database/repositories/project-commands.ts`

**Step 1: Create the repository**

```typescript
// electron/database/repositories/project-commands.ts
import { db } from '../index';
import type { ProjectCommand, NewProjectCommand, UpdateProjectCommand } from '../../../shared/run-command-types';

function parseRow(row: {
  id: string;
  projectId: string;
  command: string;
  ports: string;
  createdAt: string;
}): ProjectCommand {
  return {
    ...row,
    ports: JSON.parse(row.ports) as number[],
  };
}

export const ProjectCommandRepository = {
  findByProjectId: async (projectId: string): Promise<ProjectCommand[]> => {
    const rows = await db
      .selectFrom('project_commands')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(parseRow);
  },

  findById: async (id: string): Promise<ProjectCommand | undefined> => {
    const row = await db
      .selectFrom('project_commands')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? parseRow(row) : undefined;
  },

  create: async (data: NewProjectCommand): Promise<ProjectCommand> => {
    const id = crypto.randomUUID();
    const row = await db
      .insertInto('project_commands')
      .values({
        id,
        projectId: data.projectId,
        command: data.command,
        ports: JSON.stringify(data.ports),
        createdAt: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  update: async (id: string, data: UpdateProjectCommand): Promise<ProjectCommand> => {
    const updateData: Record<string, unknown> = {};
    if (data.command !== undefined) updateData.command = data.command;
    if (data.ports !== undefined) updateData.ports = JSON.stringify(data.ports);

    const row = await db
      .updateTable('project_commands')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('project_commands').where('id', '=', id).execute();
  },
};
```

**Step 2: Commit**

```bash
git add electron/database/repositories/project-commands.ts
git commit -m "feat: add project commands repository"
```

---

## Task 4: Run Command Service

**Files:**
- Create: `electron/services/run-command-service.ts`

**Step 1: Create the service**

```typescript
// electron/services/run-command-service.ts
import { ChildProcess, spawn, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { ProjectCommandRepository } from '../database/repositories/project-commands';
import type {
  RunStatus,
  CommandRunStatus,
  PortInUse,
  PortsInUseErrorData,
  PackageScriptsResult,
} from '../../shared/run-command-types';

const execAsync = promisify(exec);

type StatusChangeCallback = (projectId: string, status: RunStatus) => void;

interface TrackedProcess {
  commandId: string;
  command: string;
  process: ChildProcess;
  status: 'running' | 'stopped' | 'errored';
}

class RunCommandService {
  private runningProcesses = new Map<string, TrackedProcess[]>();
  private statusChangeCallbacks: StatusChangeCallback[] = [];

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusChangeCallbacks.push(callback);
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback);
      if (index > -1) this.statusChangeCallbacks.splice(index, 1);
    };
  }

  private notifyStatusChange(projectId: string): void {
    const status = this.getRunStatus(projectId);
    this.statusChangeCallbacks.forEach((cb) => cb(projectId, status));
  }

  getRunStatus(projectId: string): RunStatus {
    const tracked = this.runningProcesses.get(projectId) ?? [];
    const commands: CommandRunStatus[] = tracked.map((t) => ({
      id: t.commandId,
      command: t.command,
      status: t.status,
      pid: t.process.pid,
    }));
    return {
      isRunning: commands.some((c) => c.status === 'running'),
      commands,
    };
  }

  async checkPortInUse(port: number): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const match = stdout.match(/LISTENING\s+(\d+)/);
        return match ? `PID ${match[1]}` : null;
      } else {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pid = stdout.trim().split('\n')[0];
        if (pid) {
          try {
            const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm=`);
            return `${psOut.trim()} (PID ${pid})`;
          } catch {
            return `PID ${pid}`;
          }
        }
        return null;
      }
    } catch {
      return null;
    }
  }

  async killPort(port: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const match = stdout.match(/LISTENING\s+(\d+)/);
        if (match) {
          await execAsync(`taskkill /PID ${match[1]} /F`);
        }
      } else {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean);
        for (const pid of pids) {
          await execAsync(`kill -9 ${pid}`);
        }
      }
    } catch {
      // Port may already be free
    }
  }

  async startCommands(
    projectId: string,
    workingDir: string
  ): Promise<RunStatus | PortsInUseErrorData> {
    const commands = await ProjectCommandRepository.findByProjectId(projectId);
    if (commands.length === 0) {
      return { isRunning: false, commands: [] };
    }

    // Check all ports first
    const portsInUse: PortInUse[] = [];
    for (const cmd of commands) {
      for (const port of cmd.ports) {
        const processInfo = await this.checkPortInUse(port);
        if (processInfo) {
          portsInUse.push({
            port,
            commandId: cmd.id,
            command: cmd.command,
            processInfo,
          });
        }
      }
    }

    if (portsInUse.length > 0) {
      return {
        type: 'PortsInUseError',
        message: `Ports in use: ${portsInUse.map((p) => p.port).join(', ')}`,
        portsInUse,
      };
    }

    // Stop any existing processes for this project
    await this.stopCommands(projectId);

    // Start all commands
    const tracked: TrackedProcess[] = [];
    for (const cmd of commands) {
      const [executable, ...args] = cmd.command.split(' ');
      const childProcess = spawn(executable, args, {
        cwd: workingDir,
        shell: true,
        stdio: 'ignore',
        detached: false,
      });

      const trackedProcess: TrackedProcess = {
        commandId: cmd.id,
        command: cmd.command,
        process: childProcess,
        status: 'running',
      };

      childProcess.on('exit', (code) => {
        trackedProcess.status = code === 0 ? 'stopped' : 'errored';
        this.notifyStatusChange(projectId);
      });

      childProcess.on('error', () => {
        trackedProcess.status = 'errored';
        this.notifyStatusChange(projectId);
      });

      tracked.push(trackedProcess);
    }

    this.runningProcesses.set(projectId, tracked);
    this.notifyStatusChange(projectId);
    return this.getRunStatus(projectId);
  }

  async stopCommands(projectId: string): Promise<void> {
    const tracked = this.runningProcesses.get(projectId) ?? [];
    for (const t of tracked) {
      if (t.process.pid && t.status === 'running') {
        try {
          process.kill(t.process.pid, 'SIGTERM');
        } catch {
          // Process may already be dead
        }
      }
    }
    this.runningProcesses.delete(projectId);
    this.notifyStatusChange(projectId);
  }

  async killPortsForCommand(projectId: string, commandId: string): Promise<void> {
    const command = await ProjectCommandRepository.findById(commandId);
    if (!command || command.projectId !== projectId) return;

    for (const port of command.ports) {
      await this.killPort(port);
    }
  }

  async stopAllCommands(): Promise<void> {
    for (const projectId of this.runningProcesses.keys()) {
      await this.stopCommands(projectId);
    }
  }

  async getPackageScripts(projectPath: string): Promise<PackageScriptsResult> {
    const packageJsonPath = join(projectPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return { scripts: [], packageManager: null };
    }

    let scripts: string[] = [];
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      scripts = Object.keys(packageJson.scripts ?? {});
    } catch {
      // Invalid package.json
    }

    // Detect package manager
    let packageManager: PackageScriptsResult['packageManager'] = null;
    if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (existsSync(join(projectPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (existsSync(join(projectPath, 'bun.lockb'))) {
      packageManager = 'bun';
    } else if (existsSync(join(projectPath, 'package-lock.json'))) {
      packageManager = 'npm';
    }

    // Prefix scripts with package manager
    const prefixedScripts = packageManager
      ? scripts.map((s) => `${packageManager} ${s}`)
      : scripts;

    return { scripts: prefixedScripts, packageManager };
  }
}

export const runCommandService = new RunCommandService();
```

**Step 2: Commit**

```bash
git add electron/services/run-command-service.ts
git commit -m "feat: add run command service for process management"
```

---

## Task 5: IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers**

In `electron/ipc/handlers.ts`, add import:
```typescript
import { runCommandService } from '../services/run-command-service';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import type { NewProjectCommand, UpdateProjectCommand } from '../../shared/run-command-types';
```

Add handlers inside `registerIpcHandlers()`:
```typescript
  // Project Commands
  ipcMain.handle('projectCommands:findByProjectId', (_, projectId: string) =>
    ProjectCommandRepository.findByProjectId(projectId)
  );
  ipcMain.handle('projectCommands:create', (_, data: NewProjectCommand) =>
    ProjectCommandRepository.create(data)
  );
  ipcMain.handle(
    'projectCommands:update',
    (_, { id, data }: { id: string; data: UpdateProjectCommand }) =>
      ProjectCommandRepository.update(id, data)
  );
  ipcMain.handle('projectCommands:delete', (_, id: string) =>
    ProjectCommandRepository.delete(id)
  );

  // Run Commands
  ipcMain.handle(
    'runCommands:start',
    (_, { projectId, workingDir }: { projectId: string; workingDir: string }) =>
      runCommandService.startCommands(projectId, workingDir)
  );
  ipcMain.handle('runCommands:stop', (_, projectId: string) =>
    runCommandService.stopCommands(projectId)
  );
  ipcMain.handle('runCommands:getStatus', (_, projectId: string) =>
    runCommandService.getRunStatus(projectId)
  );
  ipcMain.handle(
    'runCommands:killPortsForCommand',
    (_, { projectId, commandId }: { projectId: string; commandId: string }) =>
      runCommandService.killPortsForCommand(projectId, commandId)
  );
  ipcMain.handle('runCommands:getPackageScripts', (_, projectPath: string) =>
    runCommandService.getPackageScripts(projectPath)
  );
```

**Step 2: Update preload.ts**

Add to the api object:
```typescript
  projectCommands: {
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('projectCommands:findByProjectId', projectId),
    create: (data: unknown) => ipcRenderer.invoke('projectCommands:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('projectCommands:update', { id, data }),
    delete: (id: string) => ipcRenderer.invoke('projectCommands:delete', id),
  },
  runCommands: {
    start: (projectId: string, workingDir: string) =>
      ipcRenderer.invoke('runCommands:start', { projectId, workingDir }),
    stop: (projectId: string) => ipcRenderer.invoke('runCommands:stop', projectId),
    getStatus: (projectId: string) =>
      ipcRenderer.invoke('runCommands:getStatus', projectId),
    killPortsForCommand: (projectId: string, commandId: string) =>
      ipcRenderer.invoke('runCommands:killPortsForCommand', { projectId, commandId }),
    getPackageScripts: (projectPath: string) =>
      ipcRenderer.invoke('runCommands:getPackageScripts', projectPath),
    onStatusChange: (callback: (projectId: string, status: unknown) => void) => {
      const handler = (_: unknown, projectId: string, status: unknown) =>
        callback(projectId, status);
      ipcRenderer.on('runCommands:statusChange', handler);
      return () => ipcRenderer.removeListener('runCommands:statusChange', handler);
    },
  },
```

**Step 3: Update src/lib/api.ts**

Add type declarations:
```typescript
import type {
  ProjectCommand,
  NewProjectCommand,
  UpdateProjectCommand,
  RunStatus,
  PortsInUseErrorData,
  PackageScriptsResult,
} from '../../shared/run-command-types';
```

Add to api interface:
```typescript
  projectCommands: {
    findByProjectId: (projectId: string) => Promise<ProjectCommand[]>;
    create: (data: NewProjectCommand) => Promise<ProjectCommand>;
    update: (id: string, data: UpdateProjectCommand) => Promise<ProjectCommand>;
    delete: (id: string) => Promise<void>;
  };
  runCommands: {
    start: (projectId: string, workingDir: string) => Promise<RunStatus | PortsInUseErrorData>;
    stop: (projectId: string) => Promise<void>;
    getStatus: (projectId: string) => Promise<RunStatus>;
    killPortsForCommand: (projectId: string, commandId: string) => Promise<void>;
    getPackageScripts: (projectPath: string) => Promise<PackageScriptsResult>;
    onStatusChange: (callback: (projectId: string, status: RunStatus) => void) => () => void;
  };
```

**Step 4: Setup status change event emission**

In `electron/ipc/handlers.ts`, at the end of `registerIpcHandlers()`:
```typescript
  // Subscribe to run command status changes and forward to renderer
  runCommandService.onStatusChange((projectId, status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('runCommands:statusChange', projectId, status);
    });
  });
```

Add import at top:
```typescript
import { BrowserWindow } from 'electron';
```

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add IPC layer for project commands and run commands"
```

---

## Task 6: App Cleanup on Quit

**Files:**
- Modify: `electron/main.ts`

**Step 1: Add cleanup handler**

Add import:
```typescript
import { runCommandService } from './services/run-command-service';
```

Add before `app.on('window-all-closed', ...)`:
```typescript
app.on('before-quit', async () => {
  await runCommandService.stopAllCommands();
});
```

**Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: stop all running commands on app quit"
```

---

## Task 7: React Query Hooks for Project Commands

**Files:**
- Create: `src/hooks/use-project-commands.ts`
- Create: `src/hooks/use-package-scripts.ts`

**Step 1: Create use-project-commands.ts**

```typescript
// src/hooks/use-project-commands.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { NewProjectCommand, UpdateProjectCommand } from '../../shared/run-command-types';

export function useProjectCommands(projectId: string) {
  return useQuery({
    queryKey: ['projectCommands', projectId],
    queryFn: () => api.projectCommands.findByProjectId(projectId),
  });
}

export function useCreateProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProjectCommand) => api.projectCommands.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommands', variables.projectId],
      });
    },
  });
}

export function useUpdateProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectCommand }) =>
      api.projectCommands.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommands'] });
    },
  });
}

export function useDeleteProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projectCommands.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommands'] });
    },
  });
}
```

**Step 2: Create use-package-scripts.ts**

```typescript
// src/hooks/use-package-scripts.ts
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function usePackageScripts(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['packageScripts', projectPath],
    queryFn: () => api.runCommands.getPackageScripts(projectPath!),
    enabled: !!projectPath,
  });
}
```

**Step 3: Commit**

```bash
git add src/hooks/use-project-commands.ts src/hooks/use-package-scripts.ts
git commit -m "feat: add React Query hooks for project commands"
```

---

## Task 8: useRunCommands Hook

**Files:**
- Create: `src/hooks/use-run-commands.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/use-run-commands.ts
import { useState, useEffect, useCallback } from 'react';

import { api } from '@/lib/api';
import type { RunStatus, PortsInUseErrorData } from '../../shared/run-command-types';
import { isPortsInUseError } from '../../shared/run-command-types';

export function useRunCommands(projectId: string, workingDir: string) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [portsInUseError, setPortsInUseError] = useState<PortsInUseErrorData | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Fetch initial status
  useEffect(() => {
    api.runCommands.getStatus(projectId).then(setStatus);
  }, [projectId]);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = api.runCommands.onStatusChange((changedProjectId, newStatus) => {
      if (changedProjectId === projectId) {
        setStatus(newStatus);
      }
    });
    return unsubscribe;
  }, [projectId]);

  const start = useCallback(async () => {
    setIsStarting(true);
    setPortsInUseError(null);
    try {
      const result = await api.runCommands.start(projectId, workingDir);
      if (isPortsInUseError(result)) {
        setPortsInUseError(result);
      } else {
        setStatus(result);
      }
    } finally {
      setIsStarting(false);
    }
  }, [projectId, workingDir]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await api.runCommands.stop(projectId);
    } finally {
      setIsStopping(false);
    }
  }, [projectId]);

  const confirmKillPorts = useCallback(async () => {
    if (!portsInUseError) return;

    // Kill ports for each affected command
    const commandIds = [...new Set(portsInUseError.portsInUse.map((p) => p.commandId))];
    for (const commandId of commandIds) {
      await api.runCommands.killPortsForCommand(projectId, commandId);
    }

    setPortsInUseError(null);

    // Retry start
    await start();
  }, [projectId, portsInUseError, start]);

  const dismissPortsError = useCallback(() => {
    setPortsInUseError(null);
  }, []);

  return {
    status,
    isRunning: status?.isRunning ?? false,
    isStarting,
    isStopping,
    start,
    stop,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-run-commands.ts
git commit -m "feat: add useRunCommands hook for run state management"
```

---

## Task 9: Port Chip Input Component

**Files:**
- Create: `src/features/project/ui-run-commands-config/port-chip-input.tsx`

**Step 1: Create the component**

```typescript
// src/features/project/ui-run-commands-config/port-chip-input.tsx
import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface PortChipInputProps {
  ports: number[];
  onChange: (ports: number[]) => void;
}

export function PortChipInput({ ports, onChange }: PortChipInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addPort = (value: string) => {
    const port = parseInt(value.trim(), 10);
    if (port >= 1 && port <= 65535 && !ports.includes(port)) {
      onChange([...ports, port]);
    }
    setInputValue('');
  };

  const removePort = (port: number) => {
    onChange(ports.filter((p) => p !== port));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addPort(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && ports.length > 0) {
      removePort(ports[ports.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5">
      {ports.map((port) => (
        <span
          key={port}
          className="flex items-center gap-1 rounded bg-neutral-700 px-2 py-0.5 text-sm"
        >
          {port}
          <button
            type="button"
            onClick={() => removePort(port)}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addPort(inputValue)}
        placeholder={ports.length === 0 ? 'Add port...' : ''}
        className="min-w-16 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-neutral-500"
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/project/ui-run-commands-config/port-chip-input.tsx
git commit -m "feat: add PortChipInput component"
```

---

## Task 10: Command Row Component

**Files:**
- Create: `src/features/project/ui-run-commands-config/command-row.tsx`

**Step 1: Create the component**

```typescript
// src/features/project/ui-run-commands-config/command-row.tsx
import { useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

import { PortChipInput } from './port-chip-input';
import type { ProjectCommand, UpdateProjectCommand } from '../../../../shared/run-command-types';

interface CommandRowProps {
  command: ProjectCommand;
  suggestions: string[];
  onUpdate: (data: UpdateProjectCommand) => void;
  onDelete: () => void;
}

export function CommandRow({ command, suggestions, onUpdate, onDelete }: CommandRowProps) {
  const [localCommand, setLocalCommand] = useState(command.command);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalCommand(command.command);
  }, [command.command]);

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(localCommand.toLowerCase()) && s !== localCommand
  );

  const handleCommandChange = (value: string) => {
    setLocalCommand(value);
    setShowSuggestions(true);
  };

  const handleCommandBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
    if (localCommand !== command.command) {
      onUpdate({ command: localCommand });
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setLocalCommand(suggestion);
    setShowSuggestions(false);
    onUpdate({ command: suggestion });
    inputRef.current?.blur();
  };

  const handlePortsChange = (ports: number[]) => {
    onUpdate({ ports });
  };

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
      <div className="flex items-start gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={localCommand}
            onChange={(e) => handleCommandChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={handleCommandBlur}
            placeholder="Enter command (e.g., pnpm dev)"
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-2 text-neutral-400 hover:bg-neutral-700 hover:text-red-400"
          title="Delete command"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs text-neutral-400">Ports to check</label>
        <PortChipInput ports={command.ports} onChange={handlePortsChange} />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/project/ui-run-commands-config/command-row.tsx
git commit -m "feat: add CommandRow component with autocomplete"
```

---

## Task 11: Run Commands Config Component

**Files:**
- Create: `src/features/project/ui-run-commands-config/index.tsx`

**Step 1: Create the component**

```typescript
// src/features/project/ui-run-commands-config/index.tsx
import { Plus } from 'lucide-react';

import { CommandRow } from './command-row';
import {
  useProjectCommands,
  useCreateProjectCommand,
  useUpdateProjectCommand,
  useDeleteProjectCommand,
} from '@/hooks/use-project-commands';
import { usePackageScripts } from '@/hooks/use-package-scripts';
import type { UpdateProjectCommand } from '../../../../shared/run-command-types';

interface RunCommandsConfigProps {
  projectId: string;
  projectPath: string;
}

export function RunCommandsConfig({ projectId, projectPath }: RunCommandsConfigProps) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const { data: scriptsData } = usePackageScripts(projectPath);
  const createCommand = useCreateProjectCommand();
  const updateCommand = useUpdateProjectCommand();
  const deleteCommand = useDeleteProjectCommand();

  const suggestions = scriptsData?.scripts ?? [];

  const handleAddCommand = () => {
    createCommand.mutate({
      projectId,
      command: '',
      ports: [],
    });
  };

  const handleUpdateCommand = (id: string, data: UpdateProjectCommand) => {
    updateCommand.mutate({ id, data });
  };

  const handleDeleteCommand = (id: string) => {
    deleteCommand.mutate(id);
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Run Commands</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Configure commands to run from the task page. Each command can have ports that will be
        checked before starting.
      </p>

      <div className="space-y-3">
        {commands.map((cmd) => (
          <CommandRow
            key={cmd.id}
            command={cmd}
            suggestions={suggestions}
            onUpdate={(data) => handleUpdateCommand(cmd.id, data)}
            onDelete={() => handleDeleteCommand(cmd.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddCommand}
        disabled={createCommand.isPending}
        className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-neutral-600 px-4 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Command
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/project/ui-run-commands-config/index.tsx
git commit -m "feat: add RunCommandsConfig component for project settings"
```

---

## Task 12: Kill Ports Modal Component

**Files:**
- Create: `src/features/agent/ui-run-button/kill-ports-modal.tsx`

**Step 1: Create the component**

```typescript
// src/features/agent/ui-run-button/kill-ports-modal.tsx
import { AlertTriangle } from 'lucide-react';

import type { PortsInUseErrorData } from '../../../../shared/run-command-types';

interface KillPortsModalProps {
  error: PortsInUseErrorData;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function KillPortsModal({ error, onConfirm, onCancel, isLoading }: KillPortsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-yellow-500/20 p-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
          <h3 className="text-lg font-semibold">Ports in Use</h3>
        </div>

        <p className="mb-4 text-sm text-neutral-300">
          The following ports are already in use. Do you want to kill these processes and start
          the commands?
        </p>

        <div className="mb-4 rounded-md border border-neutral-700 bg-neutral-900 p-3">
          {error.portsInUse.map((portInfo, idx) => (
            <div key={idx} className="flex items-center justify-between py-1 text-sm">
              <span className="font-mono text-neutral-200">:{portInfo.port}</span>
              <span className="text-neutral-400">{portInfo.processInfo ?? 'Unknown process'}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            {isLoading ? 'Killing...' : 'Kill & Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/agent/ui-run-button/kill-ports-modal.tsx
git commit -m "feat: add KillPortsModal component"
```

---

## Task 13: Run Button Component

**Files:**
- Create: `src/features/agent/ui-run-button/index.tsx`

**Step 1: Create the component**

```typescript
// src/features/agent/ui-run-button/index.tsx
import { Play, Square } from 'lucide-react';

import { KillPortsModal } from './kill-ports-modal';
import { useRunCommands } from '@/hooks/use-run-commands';
import { useProjectCommands } from '@/hooks/use-project-commands';

interface RunButtonProps {
  projectId: string;
  workingDir: string;
}

export function RunButton({ projectId, workingDir }: RunButtonProps) {
  const { data: commands = [] } = useProjectCommands(projectId);
  const {
    status,
    isRunning,
    isStarting,
    isStopping,
    start,
    stop,
    portsInUseError,
    confirmKillPorts,
    dismissPortsError,
  } = useRunCommands(projectId, workingDir);

  // Don't show button if no commands configured
  if (commands.length === 0) {
    return null;
  }

  const runningCount = status?.commands.filter((c) => c.status === 'running').length ?? 0;
  const totalCount = status?.commands.length ?? 0;

  const handleClick = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={isStarting || isStopping}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            isRunning
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isRunning ? 'Stop all commands' : 'Run all commands'}
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run
            </>
          )}
        </button>
        {isRunning && totalCount > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              runningCount === totalCount
                ? 'bg-green-500/20 text-green-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {runningCount}/{totalCount}
          </span>
        )}
      </div>

      {portsInUseError && (
        <KillPortsModal
          error={portsInUseError}
          onConfirm={confirmKillPorts}
          onCancel={dismissPortsError}
          isLoading={isStarting}
        />
      )}
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/agent/ui-run-button/index.tsx
git commit -m "feat: add RunButton component for task header"
```

---

## Task 14: Integrate into Project Details Page

**Files:**
- Modify: `src/routes/projects/$projectId/details.tsx`

**Step 1: Add RunCommandsConfig to the page**

Add import:
```typescript
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
```

Add section after the "Default Merge Branch" section and before the "Danger Zone" section:
```typescript
        {/* Divider */}
        <div className="border-t border-neutral-700" />

        {/* Run Commands */}
        <RunCommandsConfig projectId={projectId} projectPath={project.path} />
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/details.tsx
git commit -m "feat: add run commands config to project details page"
```

---

## Task 15: Integrate into Task Page

**Files:**
- Modify: `src/routes/projects/$projectId/tasks/$taskId.tsx`

**Step 1: Add RunButton to the header**

Add import:
```typescript
import { RunButton } from '@/features/agent/ui-run-button';
```

Add the RunButton in the header, after the session ID button and before the "Open in editor" button (around line 317):
```typescript
          {/* Run button */}
          <RunButton
            projectId={projectId}
            workingDir={task.worktreePath ?? project.path}
          />
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/tasks/\$taskId.tsx
git commit -m "feat: add run button to task page header"
```

---

## Task 16: Final Testing & Verification

**Step 1: Run the app and test the full flow**

1. Open project details, add a command (e.g., `pnpm dev`) with port 3000
2. Navigate to a task in that project
3. Click the green "Run" button
4. Verify the button turns red with "Stop" and shows "1/1 running"
5. Click "Stop" and verify processes are killed
6. Start a process manually on port 3000 (e.g., `npx serve -l 3000`)
7. Click "Run" again - should show the kill ports modal
8. Click "Kill & Start" and verify it works
9. Close the app and verify processes are killed

**Step 2: Run linting**

```bash
pnpm lint
```

**Step 3: Fix any lint errors**

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: address lint errors"
```
