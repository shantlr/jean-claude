import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  UsageLimitData,
  UsageDisplayData,
  UsageResult,
} from '@shared/usage-types';

import type { BackendUsageProvider } from './types';
import { formatTimeUntil } from './utils';

const execAsync = promisify(exec);

export class ClaudeUsageProvider implements BackendUsageProvider {
  private cachedToken: string | null = null;
  private tokenCacheTime: number = 0;
  private readonly TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getUsage(): Promise<UsageResult> {
    try {
      const token = await this.getOAuthToken();
      if (!token) {
        return {
          data: null,
          error: {
            type: 'no_token',
            message: 'Claude Code OAuth token not found',
          },
        };
      }

      const response = await fetch(
        'https://api.anthropic.com/api/oauth/usage',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'anthropic-beta': 'oauth-2025-04-20',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.cachedToken = null;
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
      return {
        data: this.transformResponse(apiData),
        error: null,
      };
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
    this.cachedToken = null;
  }

  private async getOAuthToken(): Promise<string | null> {
    if (
      this.cachedToken &&
      Date.now() - this.tokenCacheTime < this.TOKEN_CACHE_TTL
    ) {
      return this.cachedToken;
    }

    try {
      const { stdout } = await execAsync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf-8' },
      );

      const credentials = JSON.parse(stdout.trim());
      const token = credentials?.claudeAiOauth?.accessToken;

      if (token) {
        this.cachedToken = token;
        this.tokenCacheTime = Date.now();
      }

      return token || null;
    } catch {
      return null;
    }
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
