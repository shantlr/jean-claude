import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { dbg } from '../../../lib/debug';

import { CodexJsonRpcClient } from './codex-json-rpc-client';

export interface CodexAppServerHandle {
  client: CodexJsonRpcClient;
  rootPid?: number;
  dispose(): Promise<void>;
}

const APP_VERSION = '0.0.1';
const execFileAsync = promisify(execFile);

type CodexAppServerState = {
  promise: Promise<CodexAppServerHandle>;
  handle?: CodexAppServerHandle;
};

let serverState: CodexAppServerState | undefined;

export async function getOrCreateCodexAppServer(): Promise<CodexAppServerHandle> {
  if (serverState === undefined) {
    let state: CodexAppServerState;
    const clearIfCurrent = () => {
      if (serverState === state) {
        serverState = undefined;
      }
    };

    const promise = startCodexAppServer(clearIfCurrent)
      .then(async (handle) => {
        state.handle = handle;
        if (serverState !== state) {
          await handle.dispose();
          throw new Error('Codex app-server startup was superseded');
        }

        return handle;
      })
      .catch((error: unknown) => {
        clearIfCurrent();
        throw error;
      });
    state = { promise };
    serverState = state;
  }

  return serverState.promise;
}

export async function resetCodexAppServerForTest(): Promise<void> {
  const state = serverState;
  serverState = undefined;

  if (state === undefined) {
    return;
  }

  if (state.handle !== undefined) {
    await state.handle.dispose();
    return;
  }

  void state.promise.then((handle) => handle.dispose()).catch(() => undefined);
}

async function startCodexAppServer(
  clearIfCurrent: () => void,
): Promise<CodexAppServerHandle> {
  await assertCodexCliAvailable();

  const proc = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new CodexJsonRpcClient({ process: proc });

  const clearOnTerminal = () => clearIfCurrent();
  proc.on('exit', clearOnTerminal);
  proc.on('error', clearOnTerminal);

  proc.stderr.on('data', (chunk: Buffer) => {
    dbg.agent('Codex app-server stderr: %s', chunk.toString().trimEnd());
  });

  let disposed = false;

  const handle: CodexAppServerHandle = {
    client,
    rootPid: proc.pid,
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      clearIfCurrent();
      proc.off('exit', clearOnTerminal);
      proc.off('error', clearOnTerminal);
      client.dispose();
    },
  };

  try {
    await client.request('initialize', {
      clientInfo: {
        name: 'jean_claude',
        title: 'Jean-Claude',
        version: APP_VERSION,
      },
      capabilities: { experimentalApi: true },
    });
    await client.notify('initialized', {});
  } catch (error) {
    await handle.dispose();
    throw error;
  }

  return handle;
}

async function assertCodexCliAvailable(): Promise<void> {
  try {
    await execFileAsync('codex', ['--version'], { timeout: 5_000 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      throw new Error(
        'Codex CLI not found. Install Codex and ensure `codex` is on PATH, then sign in before running Codex tasks.',
      );
    }

    throw new Error(
      `Unable to run Codex CLI: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
