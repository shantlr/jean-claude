import { ChildProcess, spawn, exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

import type {
  RunStatus,
  CommandRunStatus,
  PortInUse,
  PortsInUseErrorData,
  PackageScriptsResult,
} from '../../shared/run-command-types';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { dbg } from '../lib/debug';

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

  async startCommands(
    projectId: string,
    workingDir: string
  ): Promise<RunStatus | PortsInUseErrorData> {
    dbg.runCommand('Starting commands for project %s in %s', projectId, workingDir);
    const commands = await ProjectCommandRepository.findByProjectId(projectId);
    if (commands.length === 0) {
      dbg.runCommand('No commands configured for project %s', projectId);
      return { isRunning: false, commands: [] };
    }
    dbg.runCommand('Found %d commands to run', commands.length);

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
      dbg.runCommand('Ports in use, cannot start: %o', portsInUse);
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
      dbg.runCommand('Spawning: %s %o', executable, args);
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

      dbg.runCommand('Process started with PID %d for command: %s', childProcess.pid, cmd.command);

      childProcess.on('exit', (code) => {
        dbg.runCommand('Process %d exited with code %d', childProcess.pid, code);
        trackedProcess.status = code === 0 ? 'stopped' : 'errored';
        this.notifyStatusChange(projectId);
      });

      childProcess.on('error', (err) => {
        dbg.runCommand('Process %d error: %O', childProcess.pid, err);
        trackedProcess.status = 'errored';
        this.notifyStatusChange(projectId);
      });

      tracked.push(trackedProcess);
    }

    this.runningProcesses.set(projectId, tracked);
    this.notifyStatusChange(projectId);
    dbg.runCommand('All commands started for project %s', projectId);
    return this.getRunStatus(projectId);
  }

  async stopCommands(projectId: string): Promise<void> {
    dbg.runCommand('Stopping commands for project %s', projectId);
    const tracked = this.runningProcesses.get(projectId) ?? [];
    for (const t of tracked) {
      if (t.process.pid && t.status === 'running') {
        try {
          dbg.runCommand('Sending SIGTERM to PID %d (%s)', t.process.pid, t.command);
          process.kill(t.process.pid, 'SIGTERM');
        } catch {
          dbg.runCommand('Process %d may already be dead', t.process.pid);
        }
      }
    }
    this.runningProcesses.delete(projectId);
    this.notifyStatusChange(projectId);
    dbg.runCommand('Commands stopped for project %s', projectId);
  }

  async killPortsForCommand(projectId: string, commandId: string): Promise<void> {
    const command = await ProjectCommandRepository.findById(commandId);
    if (!command || command.projectId !== projectId) return;

    for (const port of command.ports) {
      await this.killPort(port);
    }
  }

  async stopAllCommands(): Promise<void> {
    const projectIds = [...this.runningProcesses.keys()];
    dbg.runCommand('Stopping all commands for %d projects', projectIds.length);
    for (const projectId of projectIds) {
      await this.stopCommands(projectId);
    }
    dbg.runCommand('All commands stopped');
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
