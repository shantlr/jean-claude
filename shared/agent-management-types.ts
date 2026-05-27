import type { AgentBackendType } from './agent-backend-types';

export interface ManagedAgent {
  name: string;
  description: string;
  agentPath: string;
  managed: boolean;
  enabledBackends: Partial<Record<AgentBackendType, boolean>>;
  editable: boolean;
}

export type AgentMigrationStatus = 'migrate' | 'skip-conflict' | 'skip-invalid';

export interface AgentMigrationPreviewItem {
  id: string;
  backendType: AgentBackendType;
  legacyPath: string;
  targetCanonicalPath: string;
  name: string;
  status: AgentMigrationStatus;
  reason?: string;
}

export interface AgentMigrationPreviewResult {
  items: AgentMigrationPreviewItem[];
}

export interface AgentMigrationExecuteItemResult {
  id: string;
  backendType: AgentBackendType;
  legacyPath: string;
  targetCanonicalPath: string;
  name: string;
  status: 'migrated' | 'failed' | 'skipped';
  reason?: string;
}

export interface AgentMigrationExecuteResult {
  results: AgentMigrationExecuteItemResult[];
}
