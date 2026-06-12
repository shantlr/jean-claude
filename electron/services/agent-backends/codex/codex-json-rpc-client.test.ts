import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { describe, expect, it, vi } from 'vitest';

import {
  CodexJsonRpcError,
  CodexJsonRpcClient,
  type CodexJsonRpcProcess,
} from './codex-json-rpc-client';

function createFakeProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
  });

  return proc as unknown as CodexJsonRpcProcess & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    emit: EventEmitter['emit'];
    listenerCount: EventEmitter['listenerCount'];
  };
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createWriteFailingProcess(error: Error) {
  const proc = createFakeProcess();
  proc.stdin.write = vi.fn((_chunk: unknown, callback?: unknown) => {
    if (typeof callback === 'function') {
      callback(error);
    }

    return true;
  }) as unknown as PassThrough['write'];

  return proc;
}

function createHangingWriteProcess() {
  const proc = createFakeProcess();
  proc.stdin.write = vi.fn(() => true) as unknown as PassThrough['write'];

  return proc;
}

describe('CodexJsonRpcClient', () => {
  it('resolves matching response by id', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.request('model/list', { limit: 1 });
    proc.stdout.write('{"id":1,"result":{"data":[]}}\n');

    await expect(promise).resolves.toEqual({ data: [] });
  });

  it('correlates out-of-order responses by id', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const first = client.request('first');
    const second = client.request('second');

    proc.stdout.write('{"id":2,"result":"second-result"}\n');
    proc.stdout.write('{"id":1,"result":"first-result"}\n');

    await expect(first).resolves.toBe('first-result');
    await expect(second).resolves.toBe('second-result');
  });

  it('writes requests and notifications as JSONL', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    const written: string[] = [];
    proc.stdin.on('data', (chunk: Buffer) => written.push(chunk.toString()));

    const request = client.request('model/list', { limit: 1 });
    await client.notify('turn/cancel', { turnId: 'turn-1' });

    proc.stdout.write('{"id":1,"result":null}\n');
    await request;

    expect(written).toEqual([
      '{"jsonrpc":"2.0","id":1,"method":"model/list","params":{"limit":1}}\n',
      '{"jsonrpc":"2.0","method":"turn/cancel","params":{"turnId":"turn-1"}}\n',
    ]);
  });

  it('rejects matching request on JSON-RPC error response', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.request('model/list');
    proc.stdout.write(
      '{"id":1,"error":{"code":-32601,"message":"Method not found","data":{"method":"model/list"}}}\n',
    );

    await expect(promise).rejects.toMatchObject({
      code: -32601,
      data: { method: 'model/list' },
      message: 'Method not found',
    });
    await expect(promise).rejects.toBeInstanceOf(CodexJsonRpcError);
  });

  it('emits notifications without resolving requests', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    const seen: unknown[] = [];
    client.onNotification((message) => seen.push(message));

    const request = client.request('model/list');
    proc.stdout.write(
      '{"method":"turn/started","params":{"turn":{"id":"turn-1"}}}\n',
    );
    proc.stdout.write('{"id":1,"result":{"data":[]}}\n');

    await request;
    expect(seen).toEqual([
      { method: 'turn/started', params: { turn: { id: 'turn-1' } } },
    ]);
  });

  it('isolates notification subscriber errors', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    const seen: unknown[] = [];
    client.onNotification(() => {
      throw new Error('subscriber failed');
    });
    client.onNotification((message) => seen.push(message));

    proc.stdout.write('{"method":"turn/started"}\n');
    await nextTick();

    expect(seen).toEqual([{ method: 'turn/started', params: undefined }]);
  });

  it('emits parse errors for invalid stdout JSON lines', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    const errors: Error[] = [];
    client.onError((error) => errors.push(error));

    proc.stdout.write('{not-json}\n');
    await nextTick();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Failed to parse Codex JSON-RPC line');
  });

  it('rejects pending requests when process exits', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.request('model/list');
    proc.emit('exit', 1, null);

    await expect(promise).rejects.toThrow('Codex process exited');
  });

  it('rejects future request and notify calls after process exits', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    proc.emit('exit', 1, null);

    await expect(client.request('model/list')).rejects.toThrow(
      'Codex process exited',
    );
    await expect(client.notify('turn/cancel')).rejects.toThrow(
      'Codex process exited',
    );
  });

  it('rejects pending and future requests when process errors', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    const error = new Error('spawn failed');

    const pending = client.request('model/list');
    proc.emit('error', error);

    await expect(pending).rejects.toThrow('spawn failed');
    await expect(client.request('model/list')).rejects.toThrow('spawn failed');
  });

  it('rejects a request when stdin write callback fails', async () => {
    const proc = createWriteFailingProcess(new Error('broken pipe'));
    const client = new CodexJsonRpcClient({ process: proc });

    await expect(client.request('model/list')).rejects.toThrow('broken pipe');
    await expect(client.request('model/list')).rejects.toThrow('broken pipe');
  });

  it('rejects notify when stdin write callback fails', async () => {
    const proc = createWriteFailingProcess(new Error('write failed'));
    const client = new CodexJsonRpcClient({ process: proc });

    await expect(client.notify('turn/cancel')).rejects.toThrow('write failed');
    await expect(client.notify('turn/cancel')).rejects.toThrow('write failed');
  });

  it('keeps late stdin errors handled after write callback failure', async () => {
    const proc = createWriteFailingProcess(new Error('write failed'));
    const client = new CodexJsonRpcClient({ process: proc });

    await expect(client.notify('turn/cancel')).rejects.toThrow('write failed');

    expect(() =>
      proc.stdin.emit('error', new Error('late stdin error')),
    ).not.toThrow();
  });

  it('rejects in-flight notify when process exits before write callback', async () => {
    const proc = createHangingWriteProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.notify('turn/cancel');
    proc.emit('exit', 1, null);

    await expect(promise).rejects.toThrow('Codex process exited');
  });

  it('rejects in-flight notify when process errors before write callback', async () => {
    const proc = createHangingWriteProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.notify('turn/cancel');
    proc.emit('error', new Error('process failed'));

    await expect(promise).rejects.toThrow('process failed');
  });

  it('rejects in-flight notify on dispose before write callback', async () => {
    const proc = createHangingWriteProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.notify('turn/cancel');
    client.dispose();

    await expect(promise).rejects.toThrow('Codex JSON-RPC client disposed');
  });

  it('rejects pending request even if error subscriber throws', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });
    client.onError(() => {
      throw new Error('subscriber failed');
    });

    const promise = client.request('model/list');
    proc.emit('error', new Error('process failed'));

    await expect(promise).rejects.toThrow('process failed');
  });

  it('keeps late process errors handled after process exit', () => {
    const proc = createFakeProcess();
    new CodexJsonRpcClient({ process: proc });

    expect(proc.listenerCount('exit')).toBe(1);
    expect(proc.listenerCount('error')).toBe(1);
    proc.emit('exit', 1, null);

    expect(proc.listenerCount('exit')).toBe(0);
    expect(proc.listenerCount('error')).toBe(1);
    expect(proc.stdin.listenerCount('error')).toBe(1);
    expect(() =>
      proc.emit('error', new Error('late process error')),
    ).not.toThrow();
  });

  it('rejects requests that time out', async () => {
    vi.useFakeTimers();
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({
      process: proc,
      requestTimeoutMs: 100,
    });

    const promise = client.request('model/list');
    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow(
      'Codex JSON-RPC request timed out: model/list',
    );
    vi.useRealTimers();
  });

  it('kills process and rejects pending requests on dispose', async () => {
    const proc = createFakeProcess();
    const client = new CodexJsonRpcClient({ process: proc });

    const promise = client.request('model/list');
    client.dispose();

    await expect(promise).rejects.toThrow('Codex JSON-RPC client disposed');
    expect(proc.kill).toHaveBeenCalledOnce();
  });
});
