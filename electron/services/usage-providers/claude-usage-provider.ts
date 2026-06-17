import { exec, type ExecOptions, spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import type {
  UsageLimitData,
  UsageDisplayData,
  UsageResult,
} from '@shared/usage-types';

import type { BackendUsageProvider } from './types';
import { formatTimeUntil } from './utils';

const execAsync = promisify(exec) as (
  command: string,
  options?: ExecOptions,
) => Promise<{ stdout: string; stderr: string }>;

interface ClaudeUsageProviderOptions {
  credentialsPath?: string;
}

interface ClaudeOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[] | null;
  credentials: Record<string, unknown>;
  source: 'keychain' | 'file';
}

export class ClaudeUsageProvider implements BackendUsageProvider {
  private cachedToken: string | null = null;
  private cachedTokenExpiresAt: number | null = null;
  private cachedOAuthToken: ClaudeOAuthToken | null = null;
  private tokenCacheTime: number = 0;
  private rateLimitedUntil: Date | null = null;
  private readonly credentialsPath: string;
  private readonly TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly FALLBACK_CLAUDE_CODE_VERSION = '2.1.0';
  private readonly OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
  private readonly OAUTH_TOKEN_URL =
    'https://platform.claude.com/v1/oauth/token';
  private readonly KEYCHAIN_SERVICE = 'Claude Code-credentials';

  constructor(options: ClaudeUsageProviderOptions = {}) {
    this.credentialsPath =
      options.credentialsPath ??
      path.join(os.homedir(), '.claude', '.credentials.json');
  }

  async getUsage(): Promise<UsageResult> {
    try {
      if (this.rateLimitedUntil && this.rateLimitedUntil > new Date()) {
        return {
          data: null,
          error: {
            type: 'api_error',
            message: `Claude usage API is rate limited until ${this.rateLimitedUntil.toLocaleTimeString()}`,
            statusCode: 429,
          },
        };
      }

      const oauthToken = await this.getOAuthToken();
      if (!oauthToken) {
        return {
          data: null,
          error: {
            type: 'no_token',
            message: 'Claude Code OAuth token not found',
          },
        };
      }

      const response = await this.fetchUsage(oauthToken.accessToken);

      if (response.status === 401 || response.status === 403) {
        this.clearTokenCache();
        const refreshedToken = await this.refreshOAuthToken(oauthToken);
        if (refreshedToken) {
          const retryResponse = await this.fetchUsage(
            refreshedToken.accessToken,
          );
          return await this.handleUsageResponse(retryResponse);
        }
        const latestToken = await this.getOAuthToken();
        if (latestToken && latestToken.accessToken !== oauthToken.accessToken) {
          const retryResponse = await this.fetchUsage(latestToken.accessToken);
          return await this.handleUsageResponse(retryResponse);
        }
      }

      return await this.handleUsageResponse(response);
    } catch (err) {
      return {
        data: null,
        error: {
          type: 'api_error',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      };
    }
  }

  dispose(): void {
    this.clearTokenCache();
    this.rateLimitedUntil = null;
  }

  private fetchUsage(token: string): Promise<Response> {
    return fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': `claude-code/${this.FALLBACK_CLAUDE_CODE_VERSION}`,
      },
    });
  }

  private async handleUsageResponse(response: Response): Promise<UsageResult> {
    if (response.status === 429) {
      this.rateLimitedUntil = this.parseRetryAfter(
        response.headers.get('retry-after'),
      );
      return {
        data: null,
        error: {
          type: 'api_error',
          message: 'Claude usage API is rate limited. Try again later.',
          statusCode: response.status,
        },
      };
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.clearTokenCache();
      }
      return {
        data: null,
        error: {
          type: 'api_error',
          message: `API error: ${response.statusText}`,
          statusCode: response.status,
        },
      };
    }

    const apiData = (await response.json()) as Record<string, unknown>;
    this.rateLimitedUntil = null;
    return {
      data: this.transformResponse(apiData),
      error: null,
    };
  }

  private async getOAuthToken(): Promise<ClaudeOAuthToken | null> {
    if (
      this.cachedToken &&
      this.cachedOAuthToken &&
      (!this.cachedTokenExpiresAt || this.cachedTokenExpiresAt > Date.now()) &&
      Date.now() - this.tokenCacheTime < this.TOKEN_CACHE_TTL
    ) {
      return this.cachedOAuthToken;
    }

    const token = await this.getOAuthTokenFromKeychain();
    if (token) {
      this.cacheToken(token);
      return token;
    }

    const fileToken = await this.getOAuthTokenFromFile();
    if (fileToken) {
      this.cacheToken(fileToken);
      return fileToken;
    }

    return null;
  }

  private cacheToken(token: ClaudeOAuthToken): void {
    this.cachedToken = token.accessToken;
    this.cachedTokenExpiresAt = token.expiresAt;
    this.cachedOAuthToken = token;
    this.tokenCacheTime = Date.now();
  }

  private clearTokenCache(): void {
    this.cachedToken = null;
    this.cachedTokenExpiresAt = null;
    this.cachedOAuthToken = null;
  }

  private async getOAuthTokenFromKeychain(): Promise<ClaudeOAuthToken | null> {
    try {
      const { stdout } = await execAsync(
        `security find-generic-password -s "${this.KEYCHAIN_SERVICE}" -w`,
        { encoding: 'utf-8' },
      );
      return this.extractOAuthToken(JSON.parse(stdout.trim()), 'keychain');
    } catch {
      return null;
    }
  }

  private async getOAuthTokenFromFile(): Promise<ClaudeOAuthToken | null> {
    try {
      const contents = await readFile(this.credentialsPath, 'utf-8');
      return this.extractOAuthToken(JSON.parse(contents), 'file');
    } catch {
      return null;
    }
  }

  private extractOAuthToken(
    credentials: unknown,
    source: ClaudeOAuthToken['source'],
  ): ClaudeOAuthToken | null {
    if (!credentials || typeof credentials !== 'object') return null;
    const record = credentials as Record<string, unknown>;
    const claudeAiOauth = record.claudeAiOauth as
      | Record<string, unknown>
      | undefined;
    const accessToken = claudeAiOauth?.accessToken ?? record.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return null;
    }

    const expiresAt = claudeAiOauth?.expiresAt ?? record.expiresAt;
    const refreshToken = claudeAiOauth?.refreshToken ?? record.refreshToken;
    const scopes = claudeAiOauth?.scopes ?? record.scopes;
    return {
      accessToken,
      refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
      scopes: Array.isArray(scopes)
        ? scopes.filter((scope): scope is string => typeof scope === 'string')
        : null,
      credentials: record,
      source,
    };
  }

  private async refreshOAuthToken(
    expiredToken: ClaudeOAuthToken,
  ): Promise<ClaudeOAuthToken | null> {
    if (!expiredToken.refreshToken) return null;

    const response = await fetch(this.OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: expiredToken.refreshToken,
        client_id:
          process.env.CLAUDE_CODE_OAUTH_CLIENT_ID ?? this.OAUTH_CLIENT_ID,
        scope: (expiredToken.scopes?.length
          ? expiredToken.scopes
          : ['user:inference', 'user:profile']
        ).join(' '),
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.access_token ?? data.accessToken;
    if (typeof accessToken !== 'string' || accessToken.length === 0)
      return null;

    const refreshToken = data.refresh_token ?? data.refreshToken;
    const expiresIn = data.expires_in ?? data.expiresIn;
    const expiresAt =
      typeof expiresIn === 'number' ? Date.now() + expiresIn * 1000 : null;

    const updatedCredentials = this.mergeRefreshedCredentials(
      expiredToken.credentials,
      {
        accessToken,
        refreshToken:
          typeof refreshToken === 'string'
            ? refreshToken
            : expiredToken.refreshToken,
        expiresAt,
      },
    );
    const refreshedToken = this.extractOAuthToken(
      updatedCredentials,
      expiredToken.source,
    );
    if (!refreshedToken) return null;

    await this.saveOAuthCredentials(refreshedToken);
    this.cacheToken(refreshedToken);
    return refreshedToken;
  }

  private mergeRefreshedCredentials(
    credentials: Record<string, unknown>,
    refreshed: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number | null;
    },
  ): Record<string, unknown> {
    const claudeAiOauth = credentials.claudeAiOauth;
    if (claudeAiOauth && typeof claudeAiOauth === 'object') {
      return {
        ...credentials,
        claudeAiOauth: {
          ...(claudeAiOauth as Record<string, unknown>),
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        },
      };
    }

    return {
      ...credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
  }

  private async saveOAuthCredentials(token: ClaudeOAuthToken): Promise<void> {
    const contents = JSON.stringify(token.credentials);
    if (token.source === 'file') {
      await writeFile(this.credentialsPath, contents);
      return;
    }

    const account = await this.getKeychainAccount();
    await this.writeKeychainPassword(account, contents);
  }

  private async getKeychainAccount(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `security find-generic-password -s "${this.KEYCHAIN_SERVICE}"`,
        { encoding: 'utf-8' },
      );
      const match = stdout.match(/"acct"<blob>="([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch {
      // Fall back to current user if metadata lookup fails.
    }

    return os.userInfo().username;
  }

  private writeKeychainPassword(
    account: string,
    contents: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('security', [
        'add-generic-password',
        '-a',
        account,
        '-s',
        this.KEYCHAIN_SERVICE,
        '-U',
        '-w',
      ]);
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `security exited with code ${code}`));
      });
      child.stdin.end(`${contents}\n${contents}\n`);
    });
  }

  private parseRetryAfter(value: string | null): Date {
    const now = Date.now();
    if (!value) return new Date(now + 5 * 60 * 1000);

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(now + seconds * 1000);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > now) {
      return new Date(parsed);
    }

    return new Date(now + 5 * 60 * 1000);
  }

  private transformResponse(
    apiData: Record<string, unknown>,
  ): UsageDisplayData {
    const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
    const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;
    const DEFAULT_MS = 24 * 60 * 60 * 1000;

    const limits: UsageDisplayData['limits'] = [];

    for (const [key, value] of Object.entries(apiData)) {
      if (!this.isUsageLimitData(value)) continue;

      const windowDurationMs = key.startsWith('five_hour')
        ? FIVE_HOUR_MS
        : key.startsWith('seven_day')
          ? SEVEN_DAY_MS
          : DEFAULT_MS;

      limits.push({
        key,
        label: this.keyToLabel(key),
        isPrimary: key === 'five_hour',
        range: {
          utilization: value.utilization,
          resetsAt: new Date(value.resets_at),
          timeUntilReset: formatTimeUntil(new Date(value.resets_at)),
          windowDurationMs,
        },
      });
    }

    // Sort: primary first, then alphabetically
    limits.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.key.localeCompare(b.key);
    });

    return { limits };
  }

  private isUsageLimitData(value: unknown): value is UsageLimitData {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).utilization === 'number' &&
      typeof (value as Record<string, unknown>).resets_at === 'string'
    );
  }

  private keyToLabel(key: string): string {
    const TOKEN_MAP: Record<string, string> = {
      five: '5',
      seven: '7',
      hour: 'hour',
      day: 'day',
    };
    return key
      .split('_')
      .map((t) => TOKEN_MAP[t] ?? t.charAt(0).toUpperCase() + t.slice(1))
      .join(' ');
  }
}
