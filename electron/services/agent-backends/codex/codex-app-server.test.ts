import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const spawn = vi.fn();
  const execFile = vi.fn((_command, _args, _options, callback) => {
    callback(null, 'codex 0.1.0\n', '');
  });
  const dbgAgent = vi.fn();
  const requestImplementations: Array<() => Promise<unknown>> = [];
  const notifyImplementations: Array<() => Promise<void>> = [];
  const clientInstances: Array<{
    process: unknown;
    request: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    emitError(error: Error): void;
  }> = [];

  class CodexJsonRpcClient {
    private readonly errorListeners = new Set<(error: Error) => void>();
    readonly request = vi.fn(() => {
      const implementation = requestImplementations.shift();
      return implementation?.() ?? Promise.resolve({});
    });
    readonly notify = vi.fn(() => {
      const implementation = notifyImplementations.shift();
      return implementation?.() ?? Promise.resolve(undefined);
    });
    readonly dispose = vi.fn();

    constructor(options: { process: unknown }) {
      clientInstances.push({
        process: options.process,
        request: this.request,
        notify: this.notify,
        dispose: this.dispose,
        emitError: (error: Error) => {
          for (const listener of this.errorListeners) {
            listener(error);
          }
        },
      });
    }

    onError(listener: (error: Error) => void) {
      this.errorListeners.add(listener);
      return () => this.errorListeners.delete(listener);
    }
  }

  return {
    spawn,
    execFile,
    dbgAgent,
    requestImplementations,
    notifyImplementations,
    clientInstances,
    CodexJsonRpcClient,
  };
});

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
  spawn: mocks.spawn,
}));

vi.mock('../../../lib/debug', () => ({
  dbg: { agent: mocks.dbgAgent },
}));

vi.mock('./codex-json-rpc-client', () => ({
  CodexJsonRpcClient: mocks.CodexJsonRpcClient,
}));

import {
  getOrCreateCodexAppServer,
  resetCodexAppServerForTest,
} from './codex-app-server';

function createFakeProcess(pid = 1234) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}

describe('Codex app server process manager', () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
    mocks.execFile.mockReset();
    mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, 'codex 0.1.0\n', '');
    });
    mocks.dbgAgent.mockReset();
    mocks.requestImplementations.length = 0;
    mocks.notifyImplementations.length = 0;
    mocks.clientInstances.length = 0;
  });

  afterEach(async () => {
    await resetCodexAppServerForTest();
  });

  it('spawns codex app-server over stdio and performs handshake in order', async () => {
    const proc = createFakeProcess();
    mocks.spawn.mockReturnValue(proc);

    const handle = await getOrCreateCodexAppServer();

    expect(mocks.execFile).toHaveBeenCalledWith(
      'codex',
      ['--version'],
      { timeout: 5_000 },
      expect.any(Function),
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      'codex',
      ['app-server', '--listen', 'stdio://'],
      expect.objectContaining({
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
    expect(handle.client).toBeInstanceOf(mocks.CodexJsonRpcClient);
    expect(handle.rootPid).toBe(1234);
    expect(mocks.clientInstances).toHaveLength(1);
    expect(mocks.clientInstances[0].process).toBe(proc);
    expect(mocks.clientInstances[0].request).toHaveBeenCalledWith(
      'initialize',
      {
        clientInfo: {
          name: 'jean_claude',
          title: 'Jean-Claude',
          version: '0.0.1',
        },
        capabilities: { experimentalApi: true },
      },
    );
    expect(mocks.clientInstances[0].notify).toHaveBeenCalledWith(
      'initialized',
      {},
    );
    expect(
      mocks.clientInstances[0].request.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.clientInstances[0].notify.mock.invocationCallOrder[0]);
  });

  it('fails clearly when Codex CLI is missing', async () => {
    const missingError = Object.assign(new Error('spawn codex ENOENT'), {
      code: 'ENOENT',
    });
    mocks.execFile.mockImplementationOnce(
      (_command, _args, _options, callback) => {
        callback(missingError, '', '');
      },
    );

    await expect(getOrCreateCodexAppServer()).rejects.toThrow(
      'Codex CLI not found',
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('logs stderr from codex app-server', async () => {
    const proc = createFakeProcess();
    mocks.spawn.mockReturnValue(proc);

    await getOrCreateCodexAppServer();
    proc.stderr.write('server warning\n');

    expect(mocks.dbgAgent).toHaveBeenCalledWith(
      'Codex app-server stderr: %s',
      'server warning',
    );
  });

  it('reuses singleton server for multiple callers', async () => {
    const proc = createFakeProcess();
    mocks.spawn.mockReturnValue(proc);

    const first = await getOrCreateCodexAppServer();
    const second = await getOrCreateCodexAppServer();

    expect(second).toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.clientInstances).toHaveLength(1);
  });

  it('resets singleton on startup failure', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);
    const failure = new Error('initialize failed');
    mocks.requestImplementations.push(
      () => Promise.reject(failure),
      () => Promise.resolve({}),
    );

    await expect(getOrCreateCodexAppServer()).rejects.toThrow(
      'initialize failed',
    );

    const secondStart = await getOrCreateCodexAppServer();

    expect(secondStart.client).toBeInstanceOf(mocks.CodexJsonRpcClient);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.clientInstances).toHaveLength(2);
    expect(mocks.clientInstances[0].dispose).toHaveBeenCalled();
  });

  it('disposes singleton and lets the next caller spawn a new process', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const first = await getOrCreateCodexAppServer();
    await first.dispose();
    const second = await getOrCreateCodexAppServer();

    expect(second).not.toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.clientInstances).toHaveLength(2);
    expect(mocks.clientInstances[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('does not clear singleton after generic client errors', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const first = await getOrCreateCodexAppServer();
    mocks.clientInstances[0].emitError(new Error('failed to parse json'));
    const second = await getOrCreateCodexAppServer();

    expect(second).toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('clears singleton after process exits at runtime', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const first = await getOrCreateCodexAppServer();
    firstProc.emit('exit', 1, null);
    const second = await getOrCreateCodexAppServer();

    expect(second).not.toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it('clears singleton after process errors at runtime', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const first = await getOrCreateCodexAppServer();
    firstProc.emit('error', new Error('process failed'));
    const second = await getOrCreateCodexAppServer();

    expect(second).not.toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it('resets singleton when initialized notification fails during handshake', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    mocks.spawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);
    mocks.notifyImplementations.push(
      () => Promise.reject(new Error('notify failed')),
      () => Promise.resolve(),
    );

    await expect(getOrCreateCodexAppServer()).rejects.toThrow('notify failed');

    const secondStart = await getOrCreateCodexAppServer();

    expect(secondStart.client).toBeInstanceOf(mocks.CodexJsonRpcClient);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.clientInstances[0].dispose).toHaveBeenCalled();
  });

  it('rejects superseded startup success and keeps newer singleton', async () => {
    const firstProc = createFakeProcess();
    const secondProc = createFakeProcess();
    const thirdProc = createFakeProcess();
    mocks.spawn
      .mockReturnValueOnce(firstProc)
      .mockReturnValueOnce(secondProc)
      .mockReturnValueOnce(thirdProc);

    let resolveFirstStart: () => void = () => {};
    mocks.requestImplementations.push(
      () =>
        new Promise((resolve) => {
          resolveFirstStart = () => resolve({});
        }),
      () => Promise.resolve({}),
    );

    const firstStart = getOrCreateCodexAppServer();
    await resetCodexAppServerForTest();
    const secondStart = await getOrCreateCodexAppServer();

    resolveFirstStart();
    await expect(firstStart).rejects.toThrow(
      'Codex app-server startup was superseded',
    );

    const thirdStart = await getOrCreateCodexAppServer();

    expect(thirdStart).toBe(secondStart);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.clientInstances[0].dispose).toHaveBeenCalled();
  });
});
