// Agent backend class mapping.

import type {
  AgentBackend,
  AgentBackendType,
} from '@shared/agent-backend-types';

import { ClaudeCodeBackend } from './claude/claude-code-backend';
import { OpenCodeBackend } from './opencode/opencode-backend';

type AgentBackendClass = new () => AgentBackend;

export const AGENT_BACKEND_CLASSES: Record<
  AgentBackendType,
  AgentBackendClass
> = {
  'claude-code': ClaudeCodeBackend,
  opencode: OpenCodeBackend,
};
