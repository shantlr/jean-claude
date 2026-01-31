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

export interface WorkspacePackage {
  name: string; // e.g., "@app/web"
  path: string; // relative path, e.g., "packages/web"
  scripts: string[]; // prefixed with filter syntax
}

export interface PackageScriptsResult {
  scripts: string[];
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
  isWorkspace: boolean;
  workspacePackages: WorkspacePackage[];
}
