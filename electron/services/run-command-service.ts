import { ChildProcess, spawn, exec } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { promisify } from 'util';

import { glob } from 'glob';

import type {
  RunStatus,
  CommandRunStatus,
  PortInUse,
  PortsInUseErrorData,
  PackageScriptsResult,
  WorkspacePackage,
  RunCommandLogStream,
} from '@shared/run-command-types';

import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { dbg } from '../lib/debug';

const execAsync = promisify(exec);

function getProcessEnvWithoutNodeEnv(): NodeJS.ProcessEnv {
  const { NODE_ENV: _nodeEnv, ...env } = process.env;
  return env;
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
  command: string;
  process: ChildProcess;
  status: 'running' | 'stopped' | 'errored';
  stdoutBuffer: string;
  stderrBuffer: string;
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
    if (
      tracked.process.exitCode !== null ||
      tracked.process.signalCode !== null
    ) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const onDone = () => {
        clearTimeout(timer);
        tracked.process.removeListener('exit', onExit);
        tracked.process.removeListener('error', onError);
      };

      const onExit = () => {
        onDone();
        resolve(true);
      };

      const onError = () => {
        onDone();
        resolve(true);
      };

      const timer = setTimeout(() => {
        onDone();
        resolve(false);
      }, timeoutMs);

      tracked.process.once('exit', onExit);
      tracked.process.once('error', onError);
    });
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
    const key = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    const value = tracked[key];
    if (!value) {
      return;
    }
    this.notifyLog(taskId, tracked.commandId, stream, value);
    tracked[key] = '';
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
    const key = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    const combined = `${tracked[key]}${chunk.replace(/\r\n/g, '\n')}`;
    const parts = combined.split('\n');
    tracked[key] = parts.pop() ?? '';

    for (const line of parts) {
      this.notifyLog(taskId, tracked.commandId, stream, line);
    }
  }

  getRunStatus(taskId: string): RunStatus {
    const tracked = this.runningProcesses.get(taskId);
    const commands: CommandRunStatus[] = tracked
      ? [...tracked.values()].map((t) => ({
          id: t.commandId,
          command: t.command,
          status: t.status,
          pid: t.process.pid,
        }))
      : [];
    return {
      isRunning: commands.some((c) => c.status === 'running'),
      commands,
    };
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
          dbg.runCommand('Killing PID %s on port %d', match[1], port);
          await execAsync(`taskkill /PID ${match[1]} /F`);
        }
      } else {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean);
        for (const pid of pids) {
          dbg.runCommand('Killing PID %s on port %d', pid, port);
          await execAsync(`kill -9 ${pid}`);
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

    const portsInUse: PortInUse[] = [];
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

    if (portsInUse.length > 0) {
      dbg.runCommand('Ports in use, cannot start: %o', portsInUse);
      return {
        type: 'PortsInUseError',
        message: `Ports in use: ${portsInUse.map((p) => p.port).join(', ')}`,
        portsInUse,
      };
    }

    dbg.runCommand('Spawning command: %s', command.command);
    const childProcess = spawn(command.command, {
      cwd: workingDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getProcessEnvWithoutNodeEnv(),
      // Create a new process group so we can kill the shell AND its children
      detached: true,
    });

    const trackedProcess: TrackedProcess = {
      commandId: command.id,
      command: command.command,
      process: childProcess,
      status: 'running',
      stdoutBuffer: '',
      stderrBuffer: '',
    };

    const taskProcesses = this.getTaskProcesses(taskId);
    taskProcesses.set(command.id, trackedProcess);

    dbg.runCommand(
      'Process started with PID %d for command: %s',
      childProcess.pid,
      command.command,
    );

    childProcess.stdout?.setEncoding('utf8');
    childProcess.stdout?.on('data', (chunk: string) => {
      this.appendLogChunk({
        taskId,
        tracked: trackedProcess,
        stream: 'stdout',
        chunk,
      });
    });

    childProcess.stderr?.setEncoding('utf8');
    childProcess.stderr?.on('data', (chunk: string) => {
      this.appendLogChunk({
        taskId,
        tracked: trackedProcess,
        stream: 'stderr',
        chunk,
      });
    });

    childProcess.on('exit', (code) => {
      dbg.runCommand('Process %d exited with code %d', childProcess.pid, code);
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stdout' });
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stderr' });
      trackedProcess.status = code === 0 ? 'stopped' : 'errored';
      this.notifyStatusChange(taskId);
    });

    childProcess.on('error', (err) => {
      dbg.runCommand('Process %d error: %O', childProcess.pid, err);
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stdout' });
      this.flushBuffer({ taskId, tracked: trackedProcess, stream: 'stderr' });
      trackedProcess.status = 'errored';
      this.notifyStatusChange(taskId);
    });

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

    if (tracked.process.pid && tracked.status === 'running') {
      let exited = false;
      const pgid = -tracked.process.pid; // Negative PID targets the process group
      try {
        dbg.runCommand(
          'Sending SIGTERM to process group %d (%s)',
          tracked.process.pid,
          tracked.command,
        );
        process.kill(pgid, 'SIGTERM');
        exited = await this.waitForExit({ tracked, timeoutMs: 1500 });

        if (!exited) {
          dbg.runCommand(
            'SIGTERM timeout for process group %d, sending SIGKILL',
            tracked.process.pid,
          );
          process.kill(pgid, 'SIGKILL');
          exited = await this.waitForExit({ tracked, timeoutMs: 1500 });
        }
      } catch {
        dbg.runCommand(
          'Process group %d may already be dead',
          tracked.process.pid,
        );
        exited = true;
      }

      if (!exited) {
        dbg.runCommand(
          'Process %d did not exit; keeping tracked as running',
          tracked.process.pid,
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
   * Synchronous last-resort cleanup: sends SIGTERM to every tracked process group.
   * Registered on `process.on('exit')` so it fires even on unexpected shutdown
   * (SIGINT, SIGTERM, uncaught exception). Cannot help with SIGKILL (kill -9).
   */
  killAllProcessGroupsSync(): void {
    for (const taskProcesses of this.runningProcesses.values()) {
      for (const tracked of taskProcesses.values()) {
        if (tracked.process.pid && tracked.status === 'running') {
          try {
            process.kill(-tracked.process.pid, 'SIGTERM');
          } catch {
            // Process group may already be dead
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
