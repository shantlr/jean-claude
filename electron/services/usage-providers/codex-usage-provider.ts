import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';

import type { UsageResult, UsageDisplayData } from '@shared/usage-types';

import type { BackendUsageProvider } from './types';
import { formatTimeUntil } from './utils';

// JSON-RPC types for the Codex App Server protocol
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id?: number;
  params?: Record<string, unknown>;
}

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number; // unix seconds
}

interface RateLimitData {
  limitId: string;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
}

interface RateLimitsResult {
  rateLimits: RateLimitData;
  rateLimitsByLimitId?: Record<string, RateLimitData>;
}

function getProcessEnvWithoutNodeEnv(): typeof process.env {
  const { NODE_ENV: _nodeEnv, ...env } = process.env;
  return env;
}

export class CodexUsageProvider implements BackendUsageProvider {
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private initialized = false;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  private cachedResult: UsageResult | null = null;
  private spawnAttempts = 0;
  private lastSpawnAttemptTime = 0;
  private readonly MAX_SPAWN_ATTEMPTS = 3;
  private readonly SPAWN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private disposed = false;

  async getUsage(): Promise<UsageResult> {
    try {
      await this.ensureConnected();

      const result = await this.sendRequest<RateLimitsResult>(
        'account/rateLimits/read',
      );

      const data = this.transformRateLimits(result.rateLimits);
      this.cachedResult = { data, error: null };
      return this.cachedResult;
    } catch (err) {
      // Return cached data if available on transient failure
      if (this.cachedResult) {
        return this.cachedResult;
      }
      return {
        data: null,
        error: {
          type: 'api_error',
          message:
            err instanceof Error ? err.message : 'Codex App Server error',
        },
      };
    }
  }

  dispose(): void {
    this.disposed = true;
    this.killProcess();
  }

  private async ensureConnected(): Promise<void> {
    if (this.disposed) {
      throw new Error('CodexUsageProvider has been disposed');
    }

    if (this.process && this.initialized) return;

    // Reset spawn attempts after cooldown period
    if (
      this.spawnAttempts >= this.MAX_SPAWN_ATTEMPTS &&
      Date.now() - this.lastSpawnAttemptTime >= this.SPAWN_COOLDOWN_MS
    ) {
      this.spawnAttempts = 0;
    }

    if (this.spawnAttempts >= this.MAX_SPAWN_ATTEMPTS) {
      throw new Error(
        'Failed to connect to Codex App Server after multiple attempts',
      );
    }

    this.killProcess();
    this.spawnAttempts++;
    this.lastSpawnAttemptTime = Date.now();

    this.process = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getProcessEnvWithoutNodeEnv(),
    });

    // Parse newline-delimited JSON from stdout
    this.readline = createInterface({ input: this.process.stdout! });
    this.readline.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        this.handleMessage(msg);
      } catch {
        // Ignore non-JSON lines
      }
    });

    this.process.on('exit', () => {
      this.process = null;
      this.initialized = false;
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('Codex App Server exited unexpectedly'));
      }
      this.pendingRequests.clear();
    });

    this.process.on('error', () => {
      this.process = null;
      this.initialized = false;
    });

    // Handshake: send initialize request
    const initResult = await this.sendRequest('initialize', {
      clientInfo: {
        name: 'jean-claude',
        title: 'Jean-Claude',
        version: '1.0.0',
      },
    });

    if (!initResult) {
      throw new Error('Codex App Server initialization failed');
    }

    // Send initialized notification (no id = notification)
    this.sendNotification('initialized');
    this.initialized = true;
    this.spawnAttempts = 0; // Reset on success
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Response to a request (has id)
    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(
          new Error(
            (msg.error as { message?: string }).message ?? 'JSON-RPC error',
          ),
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Server notification (no id)
    if (msg.method === 'account/rateLimits/updated' && msg.params) {
      const params = msg.params as { rateLimits?: RateLimitData };
      if (params.rateLimits) {
        const data = this.transformRateLimits(params.rateLimits);
        this.cachedResult = { data, error: null };
      }
    }
  }

  private sendRequest<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Codex App Server not connected'));
        return;
      }

      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        id,
        ...(params ? { params } : {}),
      };

      // 10 second timeout per request
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Codex App Server request timed out: ${method}`));
        }
      }, 10_000);

      this.pendingRequests.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timeout);
          (resolve as (v: unknown) => void)(v);
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private sendNotification(method: string): void {
    if (!this.process?.stdin?.writable) return;

    const notification: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private transformRateLimits(rateLimits: RateLimitData): UsageDisplayData {
    const limits: UsageDisplayData['limits'] = [];

    if (rateLimits.primary) {
      limits.push({
        key: 'primary',
        label: 'Primary',
        isPrimary: true,
        range: {
          utilization: rateLimits.primary.usedPercent,
          resetsAt: new Date(rateLimits.primary.resetsAt * 1000),
          timeUntilReset: formatTimeUntil(
            new Date(rateLimits.primary.resetsAt * 1000),
          ),
          windowDurationMs: rateLimits.primary.windowDurationMins * 60 * 1000,
        },
      });
    }

    if (rateLimits.secondary) {
      limits.push({
        key: 'secondary',
        label: 'Secondary',
        isPrimary: false,
        range: {
          utilization: rateLimits.secondary.usedPercent,
          resetsAt: new Date(rateLimits.secondary.resetsAt * 1000),
          timeUntilReset: formatTimeUntil(
            new Date(rateLimits.secondary.resetsAt * 1000),
          ),
          windowDurationMs: rateLimits.secondary.windowDurationMins * 60 * 1000,
        },
      });
    }

    return { limits };
  }

  private killProcess(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.process = null;
      this.initialized = false;
    }
  }
}
