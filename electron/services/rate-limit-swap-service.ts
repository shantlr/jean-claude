import { BrowserWindow } from 'electron';

import type { AgentBackendType } from '../../shared/agent-backend-types';
import { SettingsRepository } from '../database/repositories/settings';
import type { ThinkingEffort } from '../../shared/types';
import type { UsageProviderType } from '../../shared/usage-types';


import { agentUsageService } from './agent-usage-service';

export interface SwapResult {
  backend: AgentBackendType;
  model?: string;
  thinkingEffort?: ThinkingEffort;
  swapped: boolean;
  skippedDueToRateLimit?: boolean;
}

const BACKEND_TO_USAGE_PROVIDER: Partial<
  Record<AgentBackendType, UsageProviderType>
> = {
  'claude-code': 'claude-code',
};

export class RateLimitSwapService {
  private notifiedBackends = new Set<string>();

  async resolveBackend(
    requestedBackend: AgentBackendType,
    options: { notify?: boolean } = {},
  ): Promise<SwapResult> {
    const settings = await SettingsRepository.get('rateLimitSwap');

    if (!settings?.enabled || !settings.chain?.length) {
      return { backend: requestedBackend, swapped: false };
    }

    // Walk the chain top-to-bottom
    let skippedDueToRateLimit = false;
    for (const entry of settings.chain) {
      // Last entry (no threshold) = absolute fallback
      if (entry.threshold == null) {
        return this.makeResult(requestedBackend, entry, {
          ...options,
          skippedDueToRateLimit,
        });
      }

      const utilization = await this.getUtilization(entry.backend);

      // No data = optimistic (treat as 0%), pick this entry
      if (utilization === null || utilization < entry.threshold) {
        return this.makeResult(requestedBackend, entry, {
          ...options,
          skippedDueToRateLimit,
        });
      }
      // utilization >= threshold, skip to next entry
      skippedDueToRateLimit = true;
    }

    // Should not reach here if last entry has no threshold
    // But if all entries have thresholds and all exceeded, use last entry
    const lastEntry = settings.chain[settings.chain.length - 1];
    return this.makeResult(requestedBackend, lastEntry, {
      ...options,
      skippedDueToRateLimit,
    });
  }

  private makeResult(
    requestedBackend: AgentBackendType,
    entry: {
      backend: AgentBackendType;
      model?: string;
      thinkingEffort?: ThinkingEffort;
    },
    options: { notify?: boolean; skippedDueToRateLimit?: boolean },
  ): SwapResult {
    const model =
      entry.model && entry.model !== 'default' ? entry.model : undefined;
    const thinkingEffort =
      entry.thinkingEffort && entry.thinkingEffort !== 'default'
        ? entry.thinkingEffort
        : undefined;
    const swapped =
      entry.backend !== requestedBackend ||
      model != null ||
      thinkingEffort != null;

    if (
      options.notify !== false &&
      swapped &&
      !this.notifiedBackends.has(requestedBackend)
    ) {
      this.notifiedBackends.add(requestedBackend);
      this.emitSwapNotification(requestedBackend, entry.backend, model);
    }

    return {
      backend: entry.backend,
      model,
      thinkingEffort,
      swapped,
      ...(options.skippedDueToRateLimit ? { skippedDueToRateLimit: true } : {}),
    };
  }

  private emitSwapNotification(
    from: AgentBackendType,
    to: AgentBackendType,
    model?: string,
  ): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('rate-limit-swap:triggered', { from, to, model });
    }
  }

  private async getUtilization(
    backend: AgentBackendType,
  ): Promise<number | null> {
    const providerType = BACKEND_TO_USAGE_PROVIDER[backend];
    if (!providerType) return null;

    const usage = await agentUsageService.getUsage([providerType]);
    const result = usage[providerType];

    if (!result?.data?.limits?.length) return null;

    const primary =
      result.data.limits.find((l) => l.isPrimary) ?? result.data.limits[0];
    return primary.range.utilization;
  }

  reset(): void {
    this.notifiedBackends.clear();
  }
}

export const rateLimitSwapService = new RateLimitSwapService();
