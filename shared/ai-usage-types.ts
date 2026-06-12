export type AiUsageFeature =
  | 'agent'
  | 'summary'
  | 'project-summary'
  | 'step-summary'
  | 'task-name'
  | 'pr'
  | 'pr-description'
  | 'commit-message'
  | 'merge-message'
  | 'autocomplete'
  | 'verification-note'
  | 'review'
  | 'skill'
  | 'other';

export type AiUsagePricingStatus = 'priced' | 'unknown';

export interface AiUsageContext {
  feature: AiUsageFeature;
  projectId: string | null;
  taskId?: string | null;
  stepId?: string | null;
  taskName?: string | null;
  projectName?: string | null;
}

export interface AiUsageTokenInput {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface AiUsageEvent {
  id: string;
  createdAt: string;
  sourceId: string | null;
  feature: AiUsageFeature;
  projectId: string | null;
  taskId: string | null;
  stepId: string | null;
  taskName: string | null;
  projectName: string | null;
  backend: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providerCostUsd: number | null;
  providerApiCostUsd: number | null;
  pricingStatus: AiUsagePricingStatus;
  pricingVersion: string;
}

export interface AiUsageDashboardParams {
  since: string;
  until?: string;
}

export interface AiUsageDashboard {
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    providerCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
    taskCount: number;
  };
  byDay: Array<{
    date: string;
    totalTokens: number;
    estimatedCostUsd: number;
    providerCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
  }>;
  byFeature: Array<{
    feature: AiUsageFeature;
    totalTokens: number;
    estimatedCostUsd: number;
    providerCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
  }>;
  byModel: Array<{
    backend: string;
    model: string;
    totalTokens: number;
    estimatedCostUsd: number;
    providerCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
  }>;
  topTasks: Array<{
    taskId: string;
    projectId: string;
    taskName: string | null;
    projectName: string | null;
    totalTokens: number;
    estimatedCostUsd: number;
    providerCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
    updatedAt: string;
  }>;
  unknownPricing: Array<{
    backend: string;
    model: string;
    requests: number;
  }>;
}

export interface AiUsageTaskUsage {
  events: AiUsageEvent[];
  totals: AiUsageDashboard['totals'];
}
