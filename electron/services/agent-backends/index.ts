// Agent backend class mapping.

import type {
  AgentBackend,
  AgentBackendType,
  AgentTaskContext,
} from '@shared/agent-backend-types';

import { ClaudeCodeBackend } from './claude/claude-code-backend';
import { CodexBackend } from './codex/codex-backend';
import { OpenCodeBackend } from './opencode/opencode-backend';

type AgentBackendClass = new (context: AgentTaskContext) => AgentBackend;

export const AGENT_BACKEND_CLASSES: Record<
  AgentBackendType,
  AgentBackendClass
> = {
  'claude-code': ClaudeCodeBackend,
  opencode: OpenCodeBackend,
  codex: CodexBackend,
};
