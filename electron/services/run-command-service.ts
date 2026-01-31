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
    workingDir: string,
  ): Promise<RunStatus | PortsInUseErrorData> {
    dbg.runCommand(
      'Starting commands for project %s in %s',
      projectId,
      workingDir,
    );
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

      dbg.runCommand(
        'Process started with PID %d for command: %s',
        childProcess.pid,
        cmd.command,
      );

      childProcess.on('exit', (code) => {
        dbg.runCommand(
          'Process %d exited with code %d',
          childProcess.pid,
          code,
        );
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
          dbg.runCommand(
            'Sending SIGTERM to PID %d (%s)',
            t.process.pid,
            t.command,
          );
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
    const projectIds = [...this.runningProcesses.keys()];
    dbg.runCommand('Stopping all commands for %d projects', projectIds.length);
    for (const projectId of projectIds) {
      await this.stopCommands(projectId);
    }
    dbg.runCommand('All commands stopped');
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
