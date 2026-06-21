import { createInterface, type Interface as ReadlineInterface } from 'readline';
import type { Readable, Writable } from 'stream';
import type { EventEmitter } from 'events';



export type CodexJsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type CodexJsonRpcProcess = Pick<EventEmitter, 'on' | 'off'> & {
  stdin: Writable;
  stdout: Readable;
  stderr?: Readable;
  kill: () => void;
};

export class CodexJsonRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'CodexJsonRpcError';
  }
}

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type JsonRpcResponse = {
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class CodexJsonRpcClient {
  private nextId = 1;
  private disposed = false;
  private terminalError: Error | undefined;
  private noopErrorHandlersInstalled = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingWrites = new Set<(error: Error) => void>();
  private readonly notifications = new Set<
    (message: CodexJsonRpcNotification) => void
  >();
  private readonly errors = new Set<(error: Error) => void>();
  private readonly readline: ReadlineInterface;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly options: {
      process: CodexJsonRpcProcess;
      requestTimeoutMs?: number;
    },
  ) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.readline = createInterface({ input: options.process.stdout });
    this.readline.on('line', this.handleLine);
    options.process.on('exit', this.handleExit);
    options.process.on('error', this.handleProcessError);
    options.process.stdin.on('error', this.handleStdinError);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const activeError = this.getInactiveError();
    if (activeError !== undefined) {
      return Promise.reject(activeError);
    }

    const id = this.nextId++;
    const message = this.withOptionalParams(
      { jsonrpc: '2.0', id, method },
      params,
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex JSON-RPC request timed out: ${method}`));
      }, this.requestTimeoutMs);
      timeout.unref?.();

      this.pending.set(id, { method, resolve, reject, timeout });
      this.writeLine(message).catch((error: unknown) => {
        this.failTerminal(this.toError(error));
      });
    });
  }

  notify(method: string, params?: unknown): Promise<void> {
    const activeError = this.getInactiveError();
    if (activeError !== undefined) {
      return Promise.reject(activeError);
    }

    const message = this.withOptionalParams({ jsonrpc: '2.0', method }, params);
    return this.writeLine(message).catch((error: unknown) => {
      const normalized = this.toError(error);
      this.failTerminal(normalized);
      throw normalized;
    });
  }

  onNotification(
    listener: (message: CodexJsonRpcNotification) => void,
  ): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errors.add(listener);
    return () => this.errors.delete(listener);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.terminalError = new Error('Codex JSON-RPC client disposed');
    this.options.process.off('exit', this.handleExit);
    this.options.process.off('error', this.handleProcessError);
    this.options.process.stdin.off('error', this.handleStdinError);
    this.installNoopErrorHandlers();
    this.readline.off('line', this.handleLine);
    this.readline.close();
    this.rejectAll(this.terminalError);
    this.rejectPendingWrites(this.terminalError);
    this.notifications.clear();
    this.errors.clear();
    this.options.process.kill();
  }

  private readonly handleLine = (line: string) => {
    if (line.trim() === '') {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.emitError(
        new Error(
          `Failed to parse Codex JSON-RPC line: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
      return;
    }

    if (!this.isObject(message)) {
      return;
    }

    if (typeof message.method === 'string' && message.id === undefined) {
      this.emitNotification({ method: message.method, params: message.params });
      return;
    }

    this.handleResponse(message);
  };

  private readonly handleExit = (
    code: number | null,
    signal: string | null,
  ) => {
    this.failTerminal(
      new Error(
        `Codex process exited${code === null ? '' : ` with code ${code}`}${
          signal === null ? '' : ` and signal ${signal}`
        }`,
      ),
    );
  };

  private readonly handleProcessError = (error: Error) => {
    this.failTerminal(error);
  };

  private readonly handleStdinError = (error: Error) => {
    this.failTerminal(error);
  };

  private handleResponse(message: JsonRpcResponse): void {
    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }

    this.pending.delete(message.id);
    clearTimeout(pending.timeout);

    if (message.error !== undefined) {
      pending.reject(this.errorFromResponse(pending.method, message.error));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private failTerminal(error: Error): void {
    if (this.terminalError !== undefined) {
      return;
    }

    this.terminalError = error;
    this.options.process.off('exit', this.handleExit);
    this.options.process.off('error', this.handleProcessError);
    this.options.process.stdin.off('error', this.handleStdinError);
    this.installNoopErrorHandlers();
    this.readline.off('line', this.handleLine);
    this.readline.close();
    this.rejectAll(error);
    this.rejectPendingWrites(error);
    this.emitError(error);
  }

  private emitNotification(message: CodexJsonRpcNotification): void {
    for (const listener of this.notifications) {
      try {
        listener(message);
      } catch {
        // Notification subscribers must not break stream processing.
      }
    }
  }

  private installNoopErrorHandlers(): void {
    if (this.noopErrorHandlersInstalled) {
      return;
    }

    this.noopErrorHandlersInstalled = true;
    this.options.process.on('error', this.ignoreLateError);
    this.options.process.stdin.on('error', this.ignoreLateError);
  }

  private readonly ignoreLateError = () => {};

  private emitError(error: Error): void {
    for (const listener of this.errors) {
      try {
        listener(error);
      } catch {
        // Error subscribers must not prevent request/write rejection.
      }
    }
  }

  private getInactiveError(): Error | undefined {
    if (this.disposed) {
      return new Error('Codex JSON-RPC client disposed');
    }

    return this.terminalError;
  }

  private writeLine(message: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const activeError = this.getInactiveError();
      if (activeError !== undefined) {
        reject(activeError);
        return;
      }

      let settled = false;
      const rejectWrite = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.pendingWrites.delete(rejectWrite);
        reject(error);
      };
      const resolveWrite = () => {
        if (settled) {
          return;
        }

        settled = true;
        this.pendingWrites.delete(rejectWrite);
        resolve();
      };

      this.pendingWrites.add(rejectWrite);

      try {
        this.options.process.stdin.write(
          `${JSON.stringify(message)}\n`,
          (error?: Error | null) => {
            if (error != null) {
              rejectWrite(error);
              return;
            }

            resolveWrite();
          },
        );
      } catch (error) {
        rejectWrite(this.toError(error));
      }
    });
  }

  private rejectPendingWrites(error: Error): void {
    for (const reject of [...this.pendingWrites]) {
      reject(error);
    }
  }

  private withOptionalParams<T extends Record<string, unknown>>(
    message: T,
    params: unknown,
  ): T & { params?: unknown } {
    if (params === undefined) {
      return message;
    }

    return { ...message, params };
  }

  private errorFromResponse(method: string, error: unknown): Error {
    if (this.isObject(error) && typeof error.message === 'string') {
      return new CodexJsonRpcError(
        error.message,
        typeof error.code === 'number' ? error.code : undefined,
        error.data,
      );
    }

    return new Error(
      `Codex JSON-RPC request failed: ${method}: ${JSON.stringify(error)}`,
    );
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
