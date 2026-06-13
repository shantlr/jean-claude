import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: execMock,
}));

import { ClaudeUsageProvider } from './claude-usage-provider';

let credentialsPath: string;
let homeDirectory: string;

function mockKeychainMiss(): void {
  execMock.mockImplementation((_command, _options, callback) => {
    callback(new Error('not found'));
  });
}

async function writeClaudeCredentials(token: string): Promise<void> {
  await mkdir(path.dirname(credentialsPath), { recursive: true });
  await writeFile(
    credentialsPath,
    JSON.stringify({ claudeAiOauth: { accessToken: token } }),
  );
}

describe('ClaudeUsageProvider', () => {
  beforeEach(async (context) => {
    homeDirectory = path.join('/tmp', `jc-claude-test-${context.task.id}`);
    await mkdir(homeDirectory, { recursive: true });
    credentialsPath = path.join(homeDirectory, '.claude', '.credentials.json');
    vi.restoreAllMocks();
    mockKeychainMiss();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(homeDirectory, {
      recursive: true,
      force: true,
    });
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
