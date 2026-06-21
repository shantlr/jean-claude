import os from 'os';
import path from 'path';
import { readFile } from 'fs/promises';


import type { UsageDisplayData, UsageResult } from '@shared/usage-types';

import type { BackendUsageProvider } from './types';
import { formatTimeUntil } from './utils';

interface GeminiCredentials {
  access_token?: string;
  id_token?: string;
  expiry_date?: number;
}

interface GeminiQuotaBucket {
  remainingFraction?: number;
  resetTime?: string;
  modelId?: string;
}

interface GeminiQuotaResponse {
  buckets?: GeminiQuotaBucket[];
}

interface GeminiUsageProviderOptions {
  homeDirectory?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_AUTH_TYPES = new Set(['oauth-personal', undefined]);

export class GeminiUsageProvider implements BackendUsageProvider {
  private readonly homeDirectory: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: GeminiUsageProviderOptions = {}) {
    this.homeDirectory = options.homeDirectory ?? os.homedir();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getUsage(): Promise<UsageResult> {
    try {
      const authType = await this.getAuthType();
      if (!SUPPORTED_AUTH_TYPES.has(authType)) {
        return {
          data: null,
          error: {
            type: 'api_error',
            message: `Gemini ${authType} auth is not supported. Use Gemini CLI OAuth login.`,
          },
        };
      }

      const credentials = await this.readCredentials();
      if (!credentials) {
        return {
          data: null,
          error: {
            type: 'no_token',
            message:
              'Gemini CLI OAuth credentials not found. Install Gemini CLI and run `gemini` to authenticate.',
          },
        };
      }
      if (!credentials.access_token) {
        return {
          data: null,
          error: {
            type: 'no_token',
            message: 'Gemini CLI OAuth token not found',
          },
        };
      }
      if (this.isExpired(credentials)) {
        return {
          data: null,
          error: {
            type: 'api_error',
            message:
              'Gemini CLI OAuth token is expired. Run `gemini` to refresh authentication.',
          },
        };
      }

      const response = await this.fetchImpl(
        'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        },
      );

      if (response.status === 401 || response.status === 403) {
        return {
          data: null,
          error: {
            type: 'api_error',
            message:
              'Gemini quota API rejected the CLI OAuth token. Run `gemini` to re-authenticate.',
            statusCode: response.status,
          },
        };
      }
      if (!response.ok) {
        return {
          data: null,
          error: {
            type: 'api_error',
            message: `Gemini quota API error: ${response.statusText}`,
            statusCode: response.status,
          },
        };
      }

      const quota = (await response.json()) as GeminiQuotaResponse;
      return {
        data: this.transformQuotaResponse(quota),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: {
          type: 'api_error',
          message: err instanceof Error ? err.message : 'Gemini usage error',
        },
      };
    }
  }

  dispose(): void {}

  private async getAuthType(): Promise<string | undefined> {
    try {
      const contents = await readFile(
        path.join(this.homeDirectory, '.gemini', 'settings.json'),
        'utf-8',
      );
      const settings = JSON.parse(contents) as {
        security?: { auth?: { selectedType?: string } };
      };
      return settings.security?.auth?.selectedType;
    } catch {
      return undefined;
    }
  }

  private async readCredentials(): Promise<GeminiCredentials | null> {
    try {
      const contents = await readFile(
        path.join(this.homeDirectory, '.gemini', 'oauth_creds.json'),
        'utf-8',
      );
      return JSON.parse(contents) as GeminiCredentials;
    } catch {
      return null;
    }
  }

  private isExpired(credentials: GeminiCredentials): boolean {
    if (!credentials.expiry_date) return false;
    return credentials.expiry_date <= this.now().getTime();
  }

  private transformQuotaResponse(quota: GeminiQuotaResponse): UsageDisplayData {
    const buckets = quota.buckets ?? [];
    const byModel = new Map<string, GeminiQuotaBucket>();

    for (const bucket of buckets) {
      if (!bucket.modelId || typeof bucket.remainingFraction !== 'number') {
        continue;
      }
      const existing = byModel.get(bucket.modelId);
      if (
        !existing ||
        (bucket.remainingFraction ?? 1) < (existing.remainingFraction ?? 1)
      ) {
        byModel.set(bucket.modelId, bucket);
      }
    }

    const pro = this.pickLowest([...byModel.values()], (id) =>
      id.includes('pro'),
    );
    const flash = this.pickLowest(
      [...byModel.values()],
      (id) => id.includes('flash') && !id.includes('flash-lite'),
    );
    const flashLite = this.pickLowest([...byModel.values()], (id) =>
      id.includes('flash-lite'),
    );

    const limits: UsageDisplayData['limits'] = [];
    if (pro) limits.push(this.toLimit('pro', 'Pro', true, pro));
    if (flash) limits.push(this.toLimit('flash', 'Flash', false, flash));
    if (flashLite) {
      limits.push(this.toLimit('flash-lite', 'Flash Lite', false, flashLite));
    }

    if (limits.length === 0) {
      throw new Error(
        'Gemini quota response did not include model usage buckets',
      );
    }

    return { limits };
  }

  private pickLowest(
    buckets: GeminiQuotaBucket[],
    matches: (modelId: string) => boolean,
  ): GeminiQuotaBucket | null {
    return (
      buckets
        .filter((bucket) => matches(bucket.modelId?.toLowerCase() ?? ''))
        .sort(
          (a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1),
        )[0] ?? null
    );
  }

  private toLimit(
    key: string,
    label: string,
    isPrimary: boolean,
    bucket: GeminiQuotaBucket,
  ): UsageDisplayData['limits'][number] {
    const resetsAt = bucket.resetTime
      ? new Date(bucket.resetTime)
      : new Date(this.now().getTime() + DAY_MS);
    const remaining = Math.max(0, Math.min(1, bucket.remainingFraction ?? 0));
    return {
      key,
      label,
      isPrimary,
      range: {
        utilization: (1 - remaining) * 100,
        resetsAt,
        timeUntilReset: formatTimeUntil(resetsAt),
        windowDurationMs: DAY_MS,
      },
    };
  }
}
