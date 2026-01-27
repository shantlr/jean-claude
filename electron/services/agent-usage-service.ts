import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  ClaudeUsageResponse,
  UsageResult,
  UsageDisplayData,
} from '../../shared/usage-types';

const execAsync = promisify(exec);

class AgentUsageService {
  private cachedToken: string | null = null;
  private tokenCacheTime: number = 0;
  private readonly TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getUsage(): Promise<UsageResult> {
    try {
      const token = await this.getOAuthToken();
      if (!token) {
        return {
          data: null,
          error: { type: 'no_token', message: 'Claude Code OAuth token not found' },
        };
      }

      const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
      });

      if (!response.ok) {
        // Clear cached token on auth errors
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

      const apiData = (await response.json()) as ClaudeUsageResponse;
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

  private async getOAuthToken(): Promise<string | null> {
    // Use cached token if still valid
    if (this.cachedToken && Date.now() - this.tokenCacheTime < this.TOKEN_CACHE_TTL) {
      return this.cachedToken;
    }

    try {
      // Retrieve from macOS Keychain
      const { stdout } = await execAsync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf-8' }
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

  private transformResponse(apiData: ClaudeUsageResponse): UsageDisplayData {
    const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
    const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

    return {
      fiveHour: apiData.five_hour
        ? {
            utilization: apiData.five_hour.utilization,
            resetsAt: new Date(apiData.five_hour.resets_at),
            timeUntilReset: this.formatTimeUntil(new Date(apiData.five_hour.resets_at)),
            windowDurationMs: FIVE_HOUR_MS,
          }
        : null,
      sevenDay: apiData.seven_day
        ? {
            utilization: apiData.seven_day.utilization,
            resetsAt: new Date(apiData.seven_day.resets_at),
            timeUntilReset: this.formatTimeUntil(new Date(apiData.seven_day.resets_at)),
            windowDurationMs: SEVEN_DAY_MS,
          }
        : null,
    };
  }

  private formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) return 'now';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

export const agentUsageService = new AgentUsageService();
