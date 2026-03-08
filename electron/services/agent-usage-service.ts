import type {
  UsageProviderMap,
  UsageProviderType,
  UsageResult,
} from '@shared/usage-types';

import { ClaudeUsageProvider } from './usage-providers/claude-usage-provider';
import { CodexUsageProvider } from './usage-providers/codex-usage-provider';
import type { BackendUsageProvider } from './usage-providers/types';

class AgentUsageService {
  private providers = new Map<UsageProviderType, BackendUsageProvider>();
  private cache = new Map<
    UsageProviderType,
    { value: UsageResult; cachedAt: number }
  >();
  private inFlight = new Map<UsageProviderType, Promise<UsageResult>>();

  private static readonly DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
  private static readonly CLAUDE_CACHE_TTL_MS = 7 * 60 * 1000;

  async getUsage(
    providerTypes: UsageProviderType[],
  ): Promise<UsageProviderMap> {
    if (providerTypes.length === 0) return {};

    const results = await Promise.allSettled(
      providerTypes.map(async (providerType) => {
        const result = await this.getUsageForProvider(providerType);
        return [providerType, result] as const;
      }),
    );

    const usageMap: UsageProviderMap = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [providerType, usageResult] = result.value;
        usageMap[providerType] = usageResult;
      }
    }

    return usageMap;
  }

  dispose(): void {
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
    this.cache.clear();
    this.inFlight.clear();
  }

  private async getUsageForProvider(
    providerType: UsageProviderType,
  ): Promise<UsageResult> {
    const now = Date.now();
    const cached = this.cache.get(providerType);
    const cacheTtlMs = this.getCacheTtlMs(providerType);

    if (cached && now - cached.cachedAt < cacheTtlMs) {
      return cached.value;
    }

    const existingRequest = this.inFlight.get(providerType);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const provider = this.getOrCreateProvider(providerType);
      const value = await provider.getUsage();
      this.cache.set(providerType, { value, cachedAt: Date.now() });
      return value;
    })();

    this.inFlight.set(providerType, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(providerType);
    }
  }

  private getCacheTtlMs(providerType: UsageProviderType): number {
    if (providerType === 'claude-code') {
      return AgentUsageService.CLAUDE_CACHE_TTL_MS;
    }

    return AgentUsageService.DEFAULT_CACHE_TTL_MS;
  }

  private getOrCreateProvider(
    providerType: UsageProviderType,
  ): BackendUsageProvider {
    let provider = this.providers.get(providerType);
    if (!provider) {
      provider = this.createProvider(providerType);
      this.providers.set(providerType, provider);
    }
    return provider;
  }

  private createProvider(
    providerType: UsageProviderType,
  ): BackendUsageProvider {
    switch (providerType) {
      case 'claude-code':
        return new ClaudeUsageProvider();
      case 'codex':
        return new CodexUsageProvider();
      default: {
        const _exhaustive: never = providerType;
        throw new Error(`Unknown usage provider: ${_exhaustive}`);
      }
    }
  }
}

export const agentUsageService = new AgentUsageService();
