import { spawn } from 'child_process';

const OUTPUT_LIMIT = 4000;

function appendOutput(current: string, chunk: Buffer): string {
  const next = current + chunk.toString();
  return next.length > OUTPUT_LIMIT ? next.slice(-OUTPUT_LIMIT) : next;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}

function formatDuration(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function buildFailureMessage(params: {
  label: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}): string {
  const output = (params.stderr.trim() || params.stdout.trim()).trim();
  const status = params.signal
    ? `signal ${params.signal}`
    : `exit code ${params.code ?? 'unknown'}`;

  if (!output) return `${params.label} failed with ${status}`;
  return `${params.label} failed with ${status}: ${output}`;
}

export async function runReloadPreviewCommand(params: {
  command: string;
  args?: string[];
  cwd: string;
  label: string;
  timeoutMs: number;
  onStdout?: (data: Buffer) => void;
  onStderr?: (data: Buffer) => void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(params.command, params.args ?? [], {
      cwd: params.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(
        new Error(
          `${params.label} timed out after ${formatDuration(
            params.timeoutMs,
          )}: ${formatCommand(params.command, params.args ?? [])}`,
        ),
      );
    }, params.timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      stdout = appendOutput(stdout, data);
      params.onStdout?.(data);
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr = appendOutput(stderr, data);
      params.onStderr?.(data);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`${params.label} failed to start: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          buildFailureMessage({
            label: params.label,
            code,
            signal,
            stdout,
            stderr,
          }),
        ),
      );
    });
  });
}
