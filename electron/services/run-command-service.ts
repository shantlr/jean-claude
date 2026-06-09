import { exec } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { promisify } from 'util';

import { glob } from 'glob';
import * as nodePty from 'node-pty';

import type {
  RunStatus,
  CommandRunStatus,
  ProjectCommand,
  PortInUse,
  PortsInUseErrorData,
  PackageScriptsResult,
  WorkspacePackage,
  RunCommandLogStream,
} from '@shared/run-command-types';

import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { dbg } from '../lib/debug';

const execAsync = promisify(exec);

type ProcessSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

function getProcessEnvWithoutNodeEnv(): Record<string, string> {
  const { NODE_ENV: _nodeEnv, ...env } = process.env;
  // node-pty expects string values; filter out undefined values.
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Get all descendant PIDs of a given parent PID.
 * Uses `pgrep -P` on macOS/Linux to recursively find child processes.
 * This is needed because complex apps (e.g. Electron) spawn child processes
 * that may escape the process group and survive a group kill.
 */
async function getDescendantPids(parentPid: number): Promise<number[]> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(
        `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
      );
      const childPids = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line))
        .map(Number);

      const allDescendants: number[] = [];
      for (const childPid of childPids) {
        allDescendants.push(childPid);
        const grandchildren = await getDescendantPids(childPid);
        allDescendants.push(...grandchildren);
      }
      return allDescendants;
    } catch {
      return [];
    }
  }

  // macOS / Linux: use pgrep -P
  try {
    const { stdout } = await execAsync(`pgrep -P ${parentPid}`);
    const childPids = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

    const allDescendants: number[] = [];
    for (const childPid of childPids) {
      allDescendants.push(childPid);
      const grandchildren = await getDescendantPids(childPid);
      allDescendants.push(...grandchildren);
    }
    return allDescendants;
  } catch {
    // pgrep returns exit code 1 when no processes found
    return [];
  }
}

/**
 * Kill a process and all its descendants. First collects the full process tree,
 * then sends the signal to all PIDs (leaf-first to avoid orphan reparenting).
 */
async function killProcessTree(
  pid: number,
  signal: string | number,
): Promise<void> {
  const descendants = await getDescendantPids(pid);

  // Kill descendants in reverse order (deepest children first)
  for (const descendantPid of descendants.reverse()) {
    try {
      process.kill(descendantPid, signal);
    } catch {
      // Process may already be dead
    }
  }

  // Kill the root process itself
  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be dead
  }
}

function signalProcessGroupOrProcess(pid: number, signal: ProcessSignal): void {
  if (pid <= 0) return;

  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall back to the PTY shell process if group signaling fails.
    }
  }

  process.kill(pid, signal);
}

/**
 * Handle terminal line-overwrite sequences within a single line.
 *
 * Many CLI tools (Metro, webpack, npm) rewrite the current line using:
 *   - `\r`        — carriage return (cursor to column 0, next text overwrites)
 *   - `\x1b[2K`   — erase entire line
 *   - `\x1b[K`    — erase to end of line
 *   - `\x1b[1G`   — cursor to column 1
 *
 * Since we're not a full terminal emulator, we take the pragmatic approach:
 * find the last "restart" point and keep only the text after it.
 */
function applyLineOverwrites(line: string): string {
  let result = line;

  // Find the last erase-line sequence (\x1b[2K or \x1b[K) and discard everything before it
  // eslint-disable-next-line no-control-regex
  const eraseMatch = /\x1b\[2?K/g;
  let lastEraseEnd = -1;
  let match;
  while ((match = eraseMatch.exec(result)) !== null) {
    lastEraseEnd = match.index + match[0].length;
  }
  if (lastEraseEnd > 0) {
    result = result.substring(lastEraseEnd);
  }

  // Find the last cursor-to-column-1 (\x1b[1G) and discard everything before it
  const cursorHomeIdx = result.lastIndexOf('\x1b[1G');
  if (cursorHomeIdx !== -1) {
    result = result.substring(cursorHomeIdx + 4);
  }

  // Handle bare \r — take text after the last carriage return
  const crIdx = result.lastIndexOf('\r');
  if (crIdx !== -1) {
    result = result.substring(crIdx + 1);
  }

  return result;
}

type StatusChangeCallback = (taskId: string, status: RunStatus) => void;
type LogCallback = (
  taskId: string,
  runCommandId: string,
  stream: RunCommandLogStream,
  line: string,
) => void;

interface TrackedProcess {
  commandId: string;
  name: string | null;
  command: string;
  pty: nodePty.IPty;
  pid: number;
  status: 'running' | 'stopped' | 'errored';
  outputBuffers: Record<RunCommandLogStream, string>;
  /** Set to true once the 'exit' event fires */
  exited: boolean;
  /** Resolves when the process exits */
  exitPromise: Promise<{ exitCode: number; signal?: number }>;
}

class RunCommandService {
  private runningProcesses = new Map<string, Map<string, TrackedProcess>>();
  private commandOperationLocks = new Map<string, Promise<void>>();
  private statusChangeCallbacks: StatusChangeCallback[] = [];
  private logCallbacks: LogCallback[] = [];

  private getCommandKey({
    taskId,
    runCommandId,
  }: {
    taskId: string;
    runCommandId: string;
  }): string {
    return `${taskId}:${runCommandId}`;
  }

  private async withCommandLock<T>({
    taskId,
    runCommandId,
    operation,
  }: {
    taskId: string;
    runCommandId: string;
    operation: () => Promise<T>;
  }): Promise<T> {
    const key = this.getCommandKey({ taskId, runCommandId });
    const previous = this.commandOperationLocks.get(key) ?? Promise.resolve();

    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.commandOperationLocks.set(key, current);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.commandOperationLocks.get(key) === current) {
        this.commandOperationLocks.delete(key);
      }
    }
  }

  private waitForExit({
    tracked,
    timeoutMs,
  }: {
    tracked: TrackedProcess;
    timeoutMs: number;
  }): Promise<boolean> {
    if (tracked.exited) {
      return Promise.resolve(true);
    }

    return Promise.race([
      tracked.exitPromise.then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), timeoutMs),
      ),
    ]);
  }

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusChangeCallbacks.push(callback);
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback);
      if (index > -1) this.statusChangeCallbacks.splice(index, 1);
    };
  }

  onLog(callback: LogCallback): () => void {
    this.logCallbacks.push(callback);
    return () => {
      const index = this.logCallbacks.indexOf(callback);
      if (index > -1) this.logCallbacks.splice(index, 1);
    };
  }

  private notifyStatusChange(taskId: string): void {
    const status = this.getRunStatus(taskId);
    this.statusChangeCallbacks.forEach((cb) => cb(taskId, status));
  }

  private notifyLog(
    taskId: string,
    runCommandId: string,
    stream: RunCommandLogStream,
    line: string,
  ): void {
    this.logCallbacks.forEach((cb) => cb(taskId, runCommandId, stream, line));
  }

  private getTaskProcesses(taskId: string): Map<string, TrackedProcess> {
    if (!this.runningProcesses.has(taskId)) {
      this.runningProcesses.set(taskId, new Map<string, TrackedProcess>());
    }
    return this.runningProcesses.get(taskId)!;
  }

  private flushBuffer({
    taskId,
    tracked,
    stream,
  }: {
    taskId: string;
    tracked: TrackedProcess;
    stream: RunCommandLogStream;
  }): void {
    if (!tracked.outputBuffers[stream]) {
      return;
    }
    this.notifyLog(
      taskId,
      tracked.commandId,
      stream,
      tracked.outputBuffers[stream],
    );
    tracked.outputBuffers[stream] = '';
  }

  private appendLogChunk({
    taskId,
    tracked,
    stream,
    chunk,
  }: {
    taskId: string;
    tracked: TrackedProcess;
    stream: RunCommandLogStream;
    chunk: string;
  }): void {
    // Normalize Windows line endings, then split on newlines
    const normalized = chunk.replace(/\r\n/g, '\n');
    const combined = tracked.outputBuffers[stream] + normalized;
    const lines = combined.split('\n');
    tracked.outputBuffers[stream] = lines.pop() ?? '';

    for (const rawLine of lines) {
      this.notifyLog(
        taskId,
        tracked.commandId,
        stream,
        applyLineOverwrites(rawLine),
      );
    }

    // Apply overwrites to the buffer itself so progressive \r updates
    // collapse rather than accumulate
    tracked.outputBuffers[stream] = applyLineOverwrites(
      tracked.outputBuffers[stream],
    );
  }

  private async getPortsInUse(
    commands: ProjectCommand[],
  ): Promise<PortInUse[]> {
    const portsInUse: PortInUse[] = [];

    for (const command of commands) {
      for (const port of command.ports) {
        const processInfo = await this.checkPortInUse(port);
        if (processInfo) {
          portsInUse.push({
            port,
            commandId: command.id,
            command: command.command,
            processInfo,
          });
        }
      }
    }

    return portsInUse;
  }

  private spawnTrackedCommand({
    taskId,
    workingDir,
    command,
  }: {
    taskId: string;
    workingDir: string;
    command: ProjectCommand;
  }): void {
    dbg.runCommand('Spawning command via PTY: %s', command.command);

    const shell =
      process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/sh';
    const shellArgs =
      process.platform === 'win32'
        ? ['/c', command.command]
        : ['-c', command.command];

    const ptyProcess = nodePty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workingDir,
      env: getProcessEnvWithoutNodeEnv(),
    });

    let exitResolve: (value: { exitCode: number; signal?: number }) => void;
    const exitPromise = new Promise<{ exitCode: number; signal?: number }>(
      (resolve) => {
        exitResolve = resolve;
      },
    );

    const trackedProcess: TrackedProcess = {
      commandId: command.id,
      name: command.name,
      command: command.command,
      pty: ptyProcess,
      pid: ptyProcess.pid,
      status: 'running',
      outputBuffers: { stdout: '', stderr: '' },
      exited: false,
      exitPromise,
    };

    const taskProcesses = this.getTaskProcesses(taskId);
    taskProcesses.set(command.id, trackedProcess);

    dbg.runCommand(
      'PTY process started with PID %d for command: %s',
      trackedProcess.pid,
      command.command,
    );

    ptyProcess.onData((data: string) => {
      this.appendLogChunk({
        taskId,
        tracked: trackedProcess,
        stream: 'stdout',
        chunk: data,
      });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (trackedProcess.exited) return;

      dbg.runCommand(
        'PTY process %d exited with code %d signal %d',
        trackedProcess.pid,
        exitCode,
        signal,
      );
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stdout' });
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stderr' });
      trackedProcess.exited = true;
      trackedProcess.status = exitCode === 0 ? 'stopped' : 'errored';
      exitResolve!({ exitCode, signal });
      this.notifyStatusChange(taskId);
    });
  }

  getRunStatus(taskId: string): RunStatus {
    const tracked = this.runningProcesses.get(taskId);
    const commands: CommandRunStatus[] = tracked
      ? [...tracked.values()].map((t) => ({
          id: t.commandId,
          name: t.name,
          command: t.command,
          status: t.status,
          pid: t.pid,
        }))
      : [];
    return {
      isRunning: commands.some((c) => c.status === 'running'),
      commands,
    };
  }

  /** Returns taskIds that currently have at least one running command. */
  getTaskIdsWithRunningCommands(): string[] {
    const result: string[] = [];
    for (const [taskId, tracked] of this.runningProcesses) {
      const hasRunning = [...tracked.values()].some(
        (t) => t.status === 'running',
      );
      if (hasRunning) {
        result.push(taskId);
      }
    }
    return result;
  }

  async checkPortInUse(port: number): Promise<string | null> {
    dbg.runCommand('Checking if port %d is in use', port);
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const match = stdout.match(/LISTENING\s+(\d+)/);
        const result = match ? `PID ${match[1]}` : null;
        dbg.runCommand('Port %d: %s', port, result ?? 'available');
        return result;
      } else {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pid = stdout.trim().split('\n')[0];
        if (pid) {
          try {
            const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm=`);
            const result = `${psOut.trim()} (PID ${pid})`;
            dbg.runCommand('Port %d in use by: %s', port, result);
            return result;
          } catch {
            dbg.runCommand('Port %d in use by PID %s', port, pid);
            return `PID ${pid}`;
          }
        }
        dbg.runCommand('Port %d is available', port);
        return null;
      }
    } catch {
      dbg.runCommand('Port %d check failed (likely available)', port);
      return null;
    }
  }

  async killPort(port: number): Promise<void> {
    dbg.runCommand('Killing processes on port %d', port);
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const match = stdout.match(/LISTENING\s+(\d+)/);
        if (match) {
          const pid = Number(match[1]);
          dbg.runCommand(
            'Killing process tree for PID %d on port %d',
            pid,
            port,
          );
          // Use /T to kill the entire process tree on Windows
          await execAsync(`taskkill /PID ${pid} /T /F`);
        }
      } else {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean).map(Number);
        for (const pid of pids) {
          dbg.runCommand(
            'Killing process tree for PID %d on port %d',
            pid,
            port,
          );
          await killProcessTree(pid, 'SIGKILL');
        }
      }
      dbg.runCommand('Port %d killed successfully', port);
    } catch {
      dbg.runCommand('Port %d may already be free', port);
    }
  }

  async startCommand({
    taskId,
    projectId,
    workingDir,
    runCommandId,
  }: {
    taskId: string;
    projectId: string;
    workingDir: string;
    runCommandId: string;
  }): Promise<RunStatus | PortsInUseErrorData> {
    return this.withCommandLock({
      taskId,
      runCommandId,
      operation: () =>
        this.startCommandWithoutLock({
          taskId,
          projectId,
          workingDir,
          runCommandId,
        }),
    });
  }

  private async startCommandWithoutLock({
    taskId,
    projectId,
    workingDir,
    runCommandId,
  }: {
    taskId: string;
    projectId: string;
    workingDir: string;
    runCommandId: string;
  }): Promise<RunStatus | PortsInUseErrorData> {
    dbg.runCommand(
      'Starting command %s for task %s in %s',
      runCommandId,
      taskId,
      workingDir,
    );
    const command = await ProjectCommandRepository.findById(runCommandId);
    if (!command || command.projectId !== projectId) {
      dbg.runCommand(
        'Command %s not found for project %s',
        runCommandId,
        projectId,
      );
      return this.getRunStatus(taskId);
    }

    await this.stopCommandWithoutLock({ taskId, runCommandId });

    const portsInUse = await this.getPortsInUse([command]);

    if (portsInUse.length > 0) {
      dbg.runCommand('Ports in use, cannot start: %o', portsInUse);
      return {
        type: 'PortsInUseError',
        message: `Ports in use: ${portsInUse.map((p) => p.port).join(', ')}`,
        portsInUse,
      };
    }

    this.spawnTrackedCommand({ taskId, workingDir, command });

    this.notifyStatusChange(taskId);
    return this.getRunStatus(taskId);
  }

  async startGroup({
    taskId,
    projectId,
    workingDir,
    runCommandIds,
  }: {
    taskId: string;
    projectId: string;
    workingDir: string;
    runCommandIds: string[];
  }): Promise<RunStatus | PortsInUseErrorData> {
    const commandIds = [...new Set(runCommandIds)];
    const commands = await Promise.all(
      commandIds.map((runCommandId) =>
        ProjectCommandRepository.findById(runCommandId),
      ),
    );
    const validCommands = commands.filter(
      (command): command is ProjectCommand =>
        command != null && command.projectId === projectId,
    );

    await Promise.all(
      validCommands.map((command) =>
        this.stopCommand({ taskId, runCommandId: command.id }),
      ),
    );

    const portsInUse = await this.getPortsInUse(validCommands);
    if (portsInUse.length > 0) {
      dbg.runCommand('Group ports in use, cannot start: %o', portsInUse);
      return {
        type: 'PortsInUseError',
        message: `Ports in use: ${portsInUse.map((p) => p.port).join(', ')}`,
        portsInUse,
      };
    }

    await Promise.all(
      validCommands.map((command) =>
        this.spawnTrackedCommand({ taskId, workingDir, command }),
      ),
    );

    this.notifyStatusChange(taskId);
    return this.getRunStatus(taskId);
  }

  async stopCommand({
    taskId,
    runCommandId,
  }: {
    taskId: string;
    runCommandId: string;
  }): Promise<void> {
    return this.withCommandLock({
      taskId,
      runCommandId,
      operation: () => this.stopCommandWithoutLock({ taskId, runCommandId }),
    });
  }

  sendInput({
    taskId,
    runCommandId,
    input,
  }: {
    taskId: string;
    runCommandId: string;
    input: string;
  }): void {
    const taskProcesses = this.runningProcesses.get(taskId);
    if (!taskProcesses) return;

    const tracked = taskProcesses.get(runCommandId);
    if (!tracked || tracked.status !== 'running') return;

    tracked.pty.write(input);
  }

  private static VALID_SIGNALS = new Set(['SIGINT', 'SIGTERM']);

  sendSignal({
    taskId,
    runCommandId,
    signal,
  }: {
    taskId: string;
    runCommandId: string;
    signal: string;
  }): void {
    if (!RunCommandService.VALID_SIGNALS.has(signal)) return;

    const taskProcesses = this.runningProcesses.get(taskId);
    if (!taskProcesses) return;

    const tracked = taskProcesses.get(runCommandId);
    if (!tracked || tracked.status !== 'running') return;

    try {
      signalProcessGroupOrProcess(tracked.pid, signal as ProcessSignal);
    } catch {
      // Process may already be dead
    }
  }

  private async stopCommandWithoutLock({
    taskId,
    runCommandId,
  }: {
    taskId: string;
    runCommandId: string;
  }): Promise<void> {
    const taskProcesses = this.runningProcesses.get(taskId);
    if (!taskProcesses) {
      return;
    }

    const tracked = taskProcesses.get(runCommandId);
    if (!tracked) {
      return;
    }

    if (tracked.status === 'running') {
      let exited = false;
      const pid = tracked.pid;

      // Collect descendant PIDs before killing, since the tree may become
      // partially orphaned after the signal
      const descendantPids = await getDescendantPids(pid);

      try {
        dbg.runCommand(
          'Sending SIGTERM to PTY process %d (%s)',
          pid,
          tracked.command,
        );
        signalProcessGroupOrProcess(pid, 'SIGTERM');
        exited = await this.waitForExit({ tracked, timeoutMs: 1500 });

        if (!exited) {
          dbg.runCommand(
            'SIGTERM timeout for PTY process %d, sending SIGKILL',
            pid,
          );
          signalProcessGroupOrProcess(pid, 'SIGKILL');
          exited = await this.waitForExit({ tracked, timeoutMs: 1500 });
        }
      } catch {
        dbg.runCommand('PTY process %d may already be dead', pid);
        exited = true;
      }

      // Kill any remaining descendant processes that survived.
      if (descendantPids.length > 0) {
        dbg.runCommand(
          'Killing %d remaining descendant processes of %d',
          descendantPids.length,
          pid,
        );
        for (const descendantPid of descendantPids.reverse()) {
          try {
            process.kill(descendantPid, 'SIGKILL');
          } catch {
            // Process may already be dead
          }
        }

        if (!exited) {
          exited = await this.waitForExit({ tracked, timeoutMs: 1500 });
        }
      }

      if (!exited) {
        dbg.runCommand(
          'Process %d did not exit; keeping tracked as running',
          pid,
        );
        this.notifyStatusChange(taskId);
        return;
      }
    }

    taskProcesses.delete(runCommandId);
    if (taskProcesses.size === 0) {
      this.runningProcesses.delete(taskId);
    }

    this.notifyStatusChange(taskId);
  }

  async killPortsForCommand(
    projectId: string,
    commandId: string,
  ): Promise<void> {
    const command = await ProjectCommandRepository.findById(commandId);
    if (!command || command.projectId !== projectId) return;

    for (const port of command.ports) {
      await this.killPort(port);
    }
  }

  async stopAllCommands(): Promise<void> {
    const taskIds = [...this.runningProcesses.keys()];
    dbg.runCommand('Stopping all commands for %d tasks', taskIds.length);
    for (const taskId of taskIds) {
      await this.stopCommandsForTask(taskId);
    }
    dbg.runCommand('All commands stopped');
  }

  /**
   * Synchronous last-resort cleanup: sends SIGTERM to every tracked process.
   * Registered on `process.on('exit')` so it fires even on unexpected shutdown
   * (SIGINT, SIGTERM, uncaught exception). Cannot help with SIGKILL (kill -9).
   */
  killAllProcessGroupsSync(): void {
    for (const taskProcesses of this.runningProcesses.values()) {
      for (const tracked of taskProcesses.values()) {
        if (tracked.status === 'running') {
          try {
            signalProcessGroupOrProcess(tracked.pid, 'SIGTERM');
          } catch {
            // Process may already be dead
          }
        }
      }
    }
  }

  async stopCommandsForTask(taskId: string): Promise<void> {
    const taskProcesses = this.runningProcesses.get(taskId);
    if (!taskProcesses) {
      return;
    }

    for (const runCommandId of [...taskProcesses.keys()]) {
      await this.stopCommand({ taskId, runCommandId });
    }
  }

  async getPackageScripts(projectPath: string): Promise<PackageScriptsResult> {
    const packageJsonPath = join(projectPath, 'package.json');

    // Read root package.json
    let scripts: string[] = [];
    let rootPkg: {
      scripts?: Record<string, string>;
      workspaces?: string[] | { packages: string[] };
    } = {};
    try {
      const content = await readFile(packageJsonPath, 'utf-8');
      rootPkg = JSON.parse(content);
      scripts = Object.keys(rootPkg.scripts ?? {});
    } catch {
      // Invalid or missing package.json
      return {
        scripts: [],
        packageManager: null,
        isWorkspace: false,
        workspacePackages: [],
      };
    }

    // Detect package manager
    const packageManager = await this.detectPackageManager(projectPath);

    // Prefix root scripts with package manager
    const prefixedScripts = packageManager
      ? scripts.map((s) => `${packageManager} ${s}`)
      : scripts;

    // Detect workspace globs
    const workspaceGlobs = await this.detectWorkspaceGlobs(
      projectPath,
      rootPkg,
    );
    if (!workspaceGlobs || workspaceGlobs.length === 0) {
      return {
        scripts: prefixedScripts,
        packageManager,
        isWorkspace: false,
        workspacePackages: [],
      };
    }

    // Resolve globs to package directories
    const packageDirs = await this.resolveWorkspaceGlobs(
      projectPath,
      workspaceGlobs,
    );

    // Read each sub-package in parallel
    const workspacePackagesResults = await Promise.all(
      packageDirs.map(async (dir) => {
        try {
          const pkgContent = await readFile(join(dir, 'package.json'), 'utf-8');
          const pkg = JSON.parse(pkgContent) as {
            name?: string;
            scripts?: Record<string, string>;
          };
          if (!pkg.name) return null; // Skip packages without a name
          const pkgScripts = Object.keys(pkg.scripts ?? {}).map((s) =>
            this.formatFilterCommand(packageManager, pkg.name!, s),
          );
          return {
            name: pkg.name,
            path: relative(projectPath, dir),
            scripts: pkgScripts,
          };
        } catch {
          return null; // Skip invalid packages
        }
      }),
    );

    const workspacePackages = workspacePackagesResults.filter(
      (p): p is WorkspacePackage => p !== null,
    );

    return {
      scripts: prefixedScripts,
      packageManager,
      isWorkspace: true,
      workspacePackages,
    };
  }

  private async detectPackageManager(
    projectPath: string,
  ): Promise<PackageScriptsResult['packageManager']> {
    const checks: [string, PackageScriptsResult['packageManager']][] = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lockb', 'bun'],
      ['package-lock.json', 'npm'],
    ];

    for (const [file, manager] of checks) {
      try {
        await stat(join(projectPath, file));
        return manager;
      } catch {
        // File doesn't exist
      }
    }

    return null;
  }

  private async detectWorkspaceGlobs(
    projectPath: string,
    rootPkg: { workspaces?: string[] | { packages: string[] } },
  ): Promise<string[] | null> {
    // Check pnpm-workspace.yaml first
    try {
      const pnpmWorkspacePath = join(projectPath, 'pnpm-workspace.yaml');
      const content = await readFile(pnpmWorkspacePath, 'utf-8');
      // Simple YAML parsing for packages field
      const match = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);
      if (match) {
        const packages = match[1]
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*['"]?|['"]?\s*$/g, ''))
          .filter(Boolean);
        if (packages.length > 0) return packages;
      }
    } catch {
      // No pnpm-workspace.yaml
    }

    // Check package.json workspaces field
    if (rootPkg.workspaces) {
      if (Array.isArray(rootPkg.workspaces)) {
        return rootPkg.workspaces;
      }
      if (rootPkg.workspaces.packages) {
        return rootPkg.workspaces.packages;
      }
    }

    return null;
  }

  private async resolveWorkspaceGlobs(
    projectPath: string,
    globs: string[],
  ): Promise<string[]> {
    const results: string[] = [];

    for (const pattern of globs) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        absolute: true,
      });
      results.push(...matches);
    }

    // Filter to only directories with package.json
    const validDirs: string[] = [];
    await Promise.all(
      results.map(async (dir) => {
        try {
          await stat(join(dir, 'package.json'));
          validDirs.push(dir);
        } catch {
          // No package.json, skip
        }
      }),
    );

    return validDirs;
  }

  private formatFilterCommand(
    packageManager: PackageScriptsResult['packageManager'],
    packageName: string,
    script: string,
  ): string {
    switch (packageManager) {
      case 'pnpm':
        return `pnpm --filter ${packageName} ${script}`;
      case 'npm':
        return `npm -w ${packageName} run ${script}`;
      case 'yarn':
        return `yarn workspace ${packageName} ${script}`;
      case 'bun':
        return `bun --filter ${packageName} ${script}`;
      default:
        return script;
    }
  }
}

export const runCommandService = new RunCommandService();
