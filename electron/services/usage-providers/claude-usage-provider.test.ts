import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock, spawnMock, stdinEndMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  spawnMock: vi.fn(),
  stdinEndMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: spawnMock,
}));

import { ClaudeUsageProvider } from './claude-usage-provider';

let credentialsPath: string;
let homeDirectory: string;

function mockKeychainMiss(): void {
  execMock.mockImplementation((_command, _options, callback) => {
    callback(new Error('not found'));
  });
}

function mockKeychainHit(token: string): void {
  const credentials = JSON.stringify({
    claudeAiOauth: {
      accessToken: token,
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 60_000,
      scopes: ['user:inference'],
    },
  });
  execMock.mockImplementation((command, _options, callback) => {
    if (command.includes('-w')) {
      callback(null, { stdout: credentials, stderr: '' });
      return;
    }
    callback(null, {
      stdout:
        'attributes:\n    "acct"<blob>="patricklin"\n    "svce"<blob>="Claude Code-credentials"\n',
      stderr: '',
    });
  });
}

async function writeClaudeCredentials(
  token: string,
  options: {
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  } = {},
): Promise<void> {
  await mkdir(path.dirname(credentialsPath), { recursive: true });
  await writeFile(
    credentialsPath,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: token,
        ...(options.refreshToken ? { refreshToken: options.refreshToken } : {}),
        ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
        ...(options.scopes ? { scopes: options.scopes } : {}),
      },
    }),
  );
}

describe('ClaudeUsageProvider', () => {
  beforeEach(async (context) => {
    homeDirectory = path.join('/tmp', `jc-claude-test-${context.task.id}`);
    await mkdir(homeDirectory, { recursive: true });
    credentialsPath = path.join(homeDirectory, '.claude', '.credentials.json');
    vi.restoreAllMocks();
    mockKeychainMiss();
    spawnMock.mockImplementation(() => {
      let closeHandler: ((code: number) => void) | undefined;
      return {
        stderr: { on: vi.fn() },
        stdin: {
          end: (input: string) => {
            stdinEndMock(input);
            closeHandler?.(0);
          },
        },
        on: (event: string, handler: (code: number) => void) => {
          if (event === 'close') closeHandler = handler;
        },
      };
    });
    stdinEndMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(homeDirectory, {
      recursive: true,
      force: true,
    });
  });

  it('refreshes Keychain credentials without passing secrets as arguments', async () => {
    mockKeychainHit('old-token');
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (input === 'https://platform.claude.com/v1/oauth/token') {
        return new Response(
          JSON.stringify({
            access_token: 'new-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }

      const callCount = vi.mocked(fetch).mock.calls.length;
      if (callCount === 1) {
        return new Response('{}', { status: 401, statusText: 'Unauthorized' });
      }
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 12, resets_at: '2026-06-09T12:00:00Z' },
        }),
        { status: 200 },
      );
    });

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const result = await provider.getUsage();

    expect(result.error).toBeNull();
    expect(spawnMock).toHaveBeenCalledWith('security', [
      'add-generic-password',
      '-a',
      'patricklin',
      '-s',
      'Claude Code-credentials',
      '-U',
      '-w',
    ]);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).not.toContain('new-token');
    expect(spawnArgs).not.toContain('new-refresh-token');
    expect(stdinEndMock).toHaveBeenCalledWith(
      expect.stringContaining('new-refresh-token'),
    );
  });

  it('uses Claude credentials file when Keychain token is unavailable', async () => {
    await writeClaudeCredentials('file-token');
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            five_hour: { utilization: 12, resets_at: '2026-06-09T12:00:00Z' },
          }),
          { status: 200 },
        ),
    );

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const result = await provider.getUsage();

    expect(result.error).toBeNull();
    expect(result.data?.limits[0]?.key).toBe('five_hour');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer file-token',
      'User-Agent': 'claude-code/2.1.0',
      'anthropic-beta': 'oauth-2025-04-20',
    });
  });

  it('retries once with fresh credentials after unauthorized response', async () => {
    mockKeychainMiss();
    await writeClaudeCredentials('old-token');
    vi.mocked(fetch).mockImplementation(async () => {
      const callCount = vi.mocked(fetch).mock.calls.length;
      if (callCount === 1) {
        await writeClaudeCredentials('new-token');
        return new Response('{}', { status: 401, statusText: 'Unauthorized' });
      }
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 12, resets_at: '2026-06-09T12:00:00Z' },
        }),
        { status: 200 },
      );
    });

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const result = await provider.getUsage();

    expect(result.error).toBeNull();
    expect(result.data?.limits[0]?.key).toBe('five_hour');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  it('refreshes expired credentials after unauthorized response', async () => {
    mockKeychainMiss();
    await writeClaudeCredentials('old-token', {
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 60_000,
      scopes: ['user:inference'],
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (input === 'https://platform.claude.com/v1/oauth/token') {
        return new Response(
          JSON.stringify({
            access_token: 'new-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }

      const callCount = vi.mocked(fetch).mock.calls.length;
      if (callCount === 1) {
        return new Response('{}', { status: 401, statusText: 'Unauthorized' });
      }
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 12, resets_at: '2026-06-09T12:00:00Z' },
        }),
        { status: 200 },
      );
    });

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const result = await provider.getUsage();

    expect(result.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[1]).toMatchObject([
      'https://platform.claude.com/v1/oauth/token',
      {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token',
          client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
          scope: 'user:inference',
        }),
      },
    ]);
    expect(vi.mocked(fetch).mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  it('tries expired credentials so unauthorized responses can refresh them', async () => {
    mockKeychainMiss();
    await mkdir(path.dirname(credentialsPath), { recursive: true });
    await writeFile(
      credentialsPath,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'expired-token',
          expiresAt: Date.now() - 60_000,
        },
      }),
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', { status: 401, statusText: 'Unauthorized' }),
    );

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const result = await provider.getUsage();

    expect(result.error).toMatchObject({ type: 'api_error', statusCode: 401 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer expired-token',
    });
  });

  it('does not reuse cached credentials after they expire', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T10:00:00Z'));
    mockKeychainMiss();
    await mkdir(path.dirname(credentialsPath), { recursive: true });
    await writeFile(
      credentialsPath,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'old-token',
          expiresAt: Date.now() + 1_000,
        },
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            five_hour: { utilization: 12, resets_at: '2026-06-09T12:00:00Z' },
          }),
          { status: 200 },
        ),
    );

    const provider = new ClaudeUsageProvider({ credentialsPath });
    await provider.getUsage();

    vi.setSystemTime(new Date('2026-06-09T10:00:02Z'));
    await writeFile(
      credentialsPath,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'new-token',
          expiresAt: Date.now() + 60_000,
        },
      }),
    );

    const result = await provider.getUsage();

    expect(result.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  it('caches Claude usage API rate-limit responses', async () => {
    await writeClaudeCredentials('file-token');
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', {
        status: 429,
        headers: { 'retry-after': '60' },
      }),
    );

    const provider = new ClaudeUsageProvider({ credentialsPath });
    const first = await provider.getUsage();
    const second = await provider.getUsage();

    expect(first.error).toMatchObject({ statusCode: 429 });
    expect(second.error).toMatchObject({ statusCode: 429 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
