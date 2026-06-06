import type { AgentBackendType } from './agent-backend-types';

export type BackendUserConfig = {
  backend: AgentBackendType;
  path: string;
  schemaUrl: string;
  exists: boolean;
  content: string;
};

export type BackendUserConfigUpdate = {
  backend: AgentBackendType;
  content: string;
};
