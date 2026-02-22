import type { UsageResult } from '@shared/usage-types';

export interface BackendUsageProvider {
  getUsage(): Promise<UsageResult>;
  dispose(): void;
}
