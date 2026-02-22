import type { UsageProviderMap, UsageProviderType } from '@shared/usage-types';

import { ClaudeUsageProvider } from './usage-providers/claude-usage-provider';
import { CodexUsageProvider } from './usage-providers/codex-usage-provider';
import type { BackendUsageProvider } from './usage-providers/types';

class AgentUsageService {
  private providers = new Map<UsageProviderType, BackendUsageProvider>();

  async getUsage(
    providerTypes: UsageProviderType[],
  ): Promise<UsageProviderMap> {
    if (providerTypes.length === 0) return {};

    const results = await Promise.allSettled(
      providerTypes.map(async (providerType) => {
        const provider = this.getOrCreateProvider(providerType);
        const result = await provider.getUsage();
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
