// shared/run-command-types.ts

export type CommandStatus = 'running' | 'stopped' | 'errored';

export interface ProjectCommand {
  id: string;
  projectId: string;
  name: string | null;
  command: string;
  ports: number[];
  confirmBeforeRun: boolean;
  confirmMessage: string | null;
  sortOrder: number;
  createdAt: string;
}

export type NewProjectCommand = Omit<
  ProjectCommand,
  'id' | 'createdAt' | 'sortOrder'
>;
export type UpdateProjectCommand = Partial<
  Pick<
    ProjectCommand,
    'name' | 'command' | 'ports' | 'confirmBeforeRun' | 'confirmMessage'
  >
>;

export interface ProjectCommandGroup {
  id: string;
  projectId: string;
  name: string;
  commandIds: string[];
  sortOrder: number;
  createdAt: string;
}

export type NewProjectCommandGroup = Omit<
  ProjectCommandGroup,
  'id' | 'createdAt' | 'sortOrder'
>;

export type UpdateProjectCommandGroup = Partial<
  Pick<ProjectCommandGroup, 'name' | 'commandIds'>
>;

export type RunCommandConfigItem =
  | ({ type: 'command' } & Pick<ProjectCommand, 'id' | 'sortOrder'>)
  | ({ type: 'group' } & Pick<ProjectCommandGroup, 'id' | 'sortOrder'>);

export interface CommandRunStatus {
  id: string;
  name: string | null;
  command: string;
  status: CommandStatus;
  pid?: number;
}

export interface RunStatus {
  isRunning: boolean;
  commands: CommandRunStatus[];
}

export type RunCommandLogStream = 'stdout' | 'stderr';

export interface RunCommandLogEvent {
  taskId: string;
  runCommandId: string;
  stream: RunCommandLogStream;
  line: string;
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

export function isPortsInUseError(
  error: unknown,
): error is PortsInUseErrorData {
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

export function getRunCommandDisplayName(command: {
  name?: string | null;
  command: string;
}): string {
  return command.name?.trim() || command.command;
}
