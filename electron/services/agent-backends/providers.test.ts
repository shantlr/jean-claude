import {
  type AgentBackendCapabilities,
  type Capability,
  requireCapability,
  UnsupportedBackendCapabilityError,
} from '@shared/agent-backend-provider-types';
import type {
  AgentBackendConfig,
  AgentBackendType,
  AgentTaskContext,
} from '@shared/agent-backend-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { backendCalls, resetBackendCalls, TestBackend } = vi.hoisted(() => {
  const backendCalls = {
    permissions: [] as unknown[],
    questions: [] as unknown[],
    modes: [] as unknown[],
    sessionAllowedTools: [] as unknown[],
    stops: [] as unknown[],
    disposes: [] as unknown[],
    startError: null as Error | null,
  };

  function resetBackendCalls() {
    backendCalls.permissions.length = 0;
    backendCalls.questions.length = 0;
    backendCalls.modes.length = 0;
    backendCalls.sessionAllowedTools.length = 0;
    backendCalls.stops.length = 0;
    backendCalls.disposes.length = 0;
    backendCalls.startError = null;
  }

  class TestBackend {
    async start() {
      if (backendCalls.startError) {
        throw backendCalls.startError;
      }

      return {
        sessionId: 'session-id',
        events: (async function* () {})(),
        rootPid: 123,
      };
    }

    async stop(sessionId: string) {
      backendCalls.stops.push({ sessionId });
    }
    async respondToPermission(
      sessionId: string,
      requestId: string,
      response: unknown,
    ) {
      backendCalls.permissions.push({ sessionId, requestId, response });
    }
    async respondToQuestion(
      sessionId: string,
      requestId: string,
      answer: unknown,
    ) {
      backendCalls.questions.push({ sessionId, requestId, answer });
    }
    async setMode(sessionId: string, mode: string) {
      backendCalls.modes.push({ sessionId, mode });
    }
    getSessionAllowedTools(sessionId: string) {
      backendCalls.sessionAllowedTools.push({ sessionId });
      return ['Bash(ls)'];
    }
    async dispose() {
      backendCalls.disposes.push({});
    }
  }

  return { backendCalls, resetBackendCalls, TestBackend };
});

vi.mock('./claude/claude-code-backend', () => ({
  ClaudeCodeBackend: TestBackend,
}));

vi.mock('./opencode/opencode-backend', () => ({
  OpenCodeBackend: TestBackend,
  getOrCreateServer: vi.fn(),
}));

vi.mock('./codex/codex-backend', () => ({
  CodexBackend: TestBackend,
}));

import {
  AGENT_BACKEND_PROVIDERS,
  getAgentBackendProvider,
} from './providers';

const BACKEND_TYPES: AgentBackendType[] = ['claude-code', 'opencode', 'codex'];
const BACKEND_LABELS: Record<AgentBackendType, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
};

const CAPABILITY_KEYS = {
  agent: [
    'run',
    'resume',
    'permissions',
    'questions',
    'runtimeModeSwitch',
    'sessionAllowedTools',
    'resourceTracking',
  ],
  generation: ['text', 'structured'],
  configuration: ['models', 'nativeConfig'],
  resources: ['skills', 'agents', 'slashCommands', 'mcp'],
  input: ['text', 'images', 'files'],
} satisfies Record<keyof AgentBackendCapabilities, string[]>;

function collectCapabilities(
  capabilities: AgentBackendCapabilities,
): Capability<unknown>[] {
  return Object.values(capabilities).flatMap((group) =>
    Object.values(group),
  ) as Capability<unknown>[];
}

function createRunInput(): {
  context: AgentTaskContext;
  config: AgentBackendConfig;
  parts: [];
} {
  return {
    context: {
      taskId: 'task-id',
      sessionStartIndex: 0,
      persistRaw: async () => 'raw-id',
    },
    config: {
      type: 'claude-code',
      cwd: '/tmp',
      interactionMode: 'ask',
    },
    parts: [],
  };
}

describe('agent backend providers', () => {
  beforeEach(() => {
    resetBackendCalls();
  });

  it('does not eagerly import generation runtime dependencies with the provider manifest', async () => {
    vi.resetModules();
    let claudeSdkImports = 0;
    let backendModelsImports = 0;

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => {
      claudeSdkImports += 1;
      return { query: vi.fn() };
    });
    vi.doMock('../backend-models-service', () => {
      backendModelsImports += 1;
      return { calculateTheoreticalOpenCodeCost: vi.fn() };
    });

    await import('./providers');

    expect(claudeSdkImports).toBe(0);
    expect(backendModelsImports).toBe(0);

    vi.doUnmock('@anthropic-ai/claude-agent-sdk');
    vi.doUnmock('../backend-models-service');
    vi.resetModules();
  });

  it('registers a provider for every backend type', () => {
    expect(Object.keys(AGENT_BACKEND_PROVIDERS).sort()).toEqual(
      [...BACKEND_TYPES].sort(),
    );

    for (const type of BACKEND_TYPES) {
      const provider = getAgentBackendProvider(type);
      expect(provider.id).toBe(type);
      expect(provider.label).toBe(BACKEND_LABELS[type]);
      expect('type' in provider).toBe(false);
      expect('displayName' in provider).toBe(false);
    }
  });

  it('declares the exact design capability manifest for every provider', () => {
    for (const provider of Object.values(AGENT_BACKEND_PROVIDERS)) {
      expect(Object.keys(provider.capabilities).sort()).toEqual(
        Object.keys(CAPABILITY_KEYS).sort(),
      );

      for (const [groupName, expectedKeys] of Object.entries(
        CAPABILITY_KEYS,
      )) {
        const group =
          provider.capabilities[groupName as keyof AgentBackendCapabilities];
        expect(Object.keys(group).sort()).toEqual([...expectedKeys].sort());
      }
    }
  });

  it('documents every unsupported capability with a reason', () => {
    for (const provider of Object.values(AGENT_BACKEND_PROVIDERS)) {
      for (const capability of collectCapabilities(provider.capabilities)) {
        if (capability.supported) continue;

        expect(capability.reason.trim()).not.toBe('');
      }
    }
  });

  it('provides an implementation for every supported capability', () => {
    for (const provider of Object.values(AGENT_BACKEND_PROVIDERS)) {
      for (const capability of collectCapabilities(provider.capabilities)) {
        if (!capability.supported) continue;

        expect(capability.implementation).toBeDefined();
      }
    }
  });

  it('supports agent.run for all current backends', () => {
    for (const provider of Object.values(AGENT_BACKEND_PROVIDERS)) {
      const runCapability = provider.capabilities.agent.run;
      if (!runCapability.supported) {
        throw new Error(`${provider.id} does not support agent.run`);
      }

      expect(runCapability.implementation.start).toBeDefined();
    }
  });

  it('keeps non-lifecycle operations off the public run handle', async () => {
    const provider = getAgentBackendProvider('claude-code');
    const runCapability = provider.capabilities.agent.run;
    if (!runCapability.supported) {
      throw new Error('claude-code does not support agent.run');
    }

    const handle = await runCapability.implementation.start(createRunInput());

    expect(handle).toMatchObject({
      rootPid: 123,
    });
    expect(handle.runId).toEqual(expect.any(String));
    expect(handle.runId).not.toBe('session-id');
    expect('backendSessionId' in handle).toBe(false);
    expect('respondToPermission' in handle).toBe(false);
    expect('respondToQuestion' in handle).toBe(false);
    expect('setMode' in handle).toBe(false);
    expect('getSessionAllowedTools' in handle).toBe(false);
  });

  it('makes provider-created run handle stop idempotent', async () => {
    const provider = getAgentBackendProvider('claude-code');
    const runCapability = provider.capabilities.agent.run;
    if (!runCapability.supported) {
      throw new Error('claude-code does not support agent.run');
    }

    const handle = await runCapability.implementation.start(createRunInput());

    await handle.stop();
    await handle.stop();

    expect(backendCalls.stops).toEqual([{ sessionId: 'session-id' }]);
  });

  it('makes provider-created run handle dispose idempotent', async () => {
    const provider = getAgentBackendProvider('claude-code');
    const runCapability = provider.capabilities.agent.run;
    if (!runCapability.supported) {
      throw new Error('claude-code does not support agent.run');
    }

    const handle = await runCapability.implementation.start(createRunInput());

    await handle.dispose();
    await handle.dispose();

    expect(backendCalls.disposes).toEqual([{}]);
  });

  it('disposes the backend when agent.run startup rejects', async () => {
    const provider = getAgentBackendProvider('claude-code');
    const runCapability = provider.capabilities.agent.run;
    const startError = new Error('startup failed');
    backendCalls.startError = startError;
    if (!runCapability.supported) {
      throw new Error('claude-code does not support agent.run');
    }

    await expect(
      runCapability.implementation.start(createRunInput()),
    ).rejects.toBe(startError);

    expect(backendCalls.disposes).toEqual([{}]);
  });

  it('delegates supported Claude agent operations to the backend instance', async () => {
    const provider = getAgentBackendProvider('claude-code');
    const runCapability = provider.capabilities.agent.run;
    const permissionsCapability = provider.capabilities.agent.permissions;
    const questionsCapability = provider.capabilities.agent.questions;
    const modeCapability = provider.capabilities.agent.runtimeModeSwitch;
    const toolsCapability = provider.capabilities.agent.sessionAllowedTools;
    if (
      !runCapability.supported ||
      !permissionsCapability.supported ||
      !questionsCapability.supported ||
      !modeCapability.supported ||
      !toolsCapability.supported
    ) {
      throw new Error('Claude provider is missing supported agent operations');
    }

    const handle = await runCapability.implementation.start(createRunInput());
    await permissionsCapability.implementation.respond({
      handle,
      requestId: 'permission-request',
      response: { behavior: 'allow' },
    });
    await questionsCapability.implementation.respond({
      handle,
      requestId: 'question-request',
      answer: { answer: 'yes' },
    });
    await modeCapability.implementation.setMode({
      handle,
      mode: 'auto',
    });

    expect(toolsCapability.implementation.list({ handle })).toEqual([
      'Bash(ls)',
    ]);
    expect(backendCalls.permissions).toEqual([
      {
        sessionId: 'session-id',
        requestId: 'permission-request',
        response: { behavior: 'allow' },
      },
    ]);
    expect(backendCalls.questions).toEqual([
      {
        sessionId: 'session-id',
        requestId: 'question-request',
        answer: { answer: 'yes' },
      },
    ]);
    expect(backendCalls.modes).toEqual([
      { sessionId: 'session-id', mode: 'auto' },
    ]);
    expect(backendCalls.sessionAllowedTools).toEqual([
      { sessionId: 'session-id' },
    ]);
  });

  it('declares unsupported agent operation matrix for Codex and OpenCode', () => {
    const openCodeAgent = getAgentBackendProvider('opencode').capabilities.agent;
    expect(openCodeAgent.permissions.supported).toBe(true);
    expect(openCodeAgent.questions.supported).toBe(true);
    expect(openCodeAgent.runtimeModeSwitch.supported).toBe(false);
    expect(openCodeAgent.sessionAllowedTools.supported).toBe(false);

    const codexAgent = getAgentBackendProvider('codex').capabilities.agent;
    expect(codexAgent.permissions.supported).toBe(false);
    expect(codexAgent.questions.supported).toBe(false);
    expect(codexAgent.runtimeModeSwitch.supported).toBe(false);
    expect(codexAgent.sessionAllowedTools.supported).toBe(false);
  });

  it('supports generation capabilities for all current backends', () => {
    for (const type of BACKEND_TYPES) {
      const generation = getAgentBackendProvider(type).capabilities.generation;

      expect(generation.text.supported).toBe(true);
      expect(generation.structured.supported).toBe(true);
      if (!generation.text.supported || !generation.structured.supported) {
        throw new Error(`${type} generation capabilities are unsupported`);
      }

      expect(generation.text.implementation.generate).toBeDefined();
      expect(generation.structured.implementation.generate).toBeDefined();
    }
  });

  it('rejects supported operations when passed a handle from another provider', async () => {
    const claudeProvider = getAgentBackendProvider('claude-code');
    const openCodeProvider = getAgentBackendProvider('opencode');
    const claudeRunCapability = claudeProvider.capabilities.agent.run;
    const openCodePermissionsCapability =
      openCodeProvider.capabilities.agent.permissions;
    if (!claudeRunCapability.supported) {
      throw new Error('Claude provider does not support agent.run');
    }
    if (!openCodePermissionsCapability.supported) {
      throw new Error('OpenCode provider does not support agent.permissions');
    }

    const handle = await claudeRunCapability.implementation.start(
      createRunInput(),
    );

    try {
      await openCodePermissionsCapability.implementation.respond({
        handle,
        requestId: 'permission-request',
        response: { behavior: 'allow' },
      });
      throw new Error('expected cross-provider operation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedBackendCapabilityError);
      expect(error).toMatchObject({
        backend: 'opencode',
        capability: 'agent.permissions',
        reason: 'run handle was not created by this backend provider',
      });
    }
  });

  it('throws unsupported capability errors with backend, capability, and reason', () => {
    const capability = getAgentBackendProvider('codex').capabilities.agent
      .permissions;

    expect(() =>
      requireCapability('codex', 'agent.permissions', capability),
    ).toThrow(UnsupportedBackendCapabilityError);

    try {
      requireCapability('codex', 'agent.permissions', capability);
      throw new Error('expected requireCapability to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedBackendCapabilityError);
      expect(error).toMatchObject({
        backend: 'codex',
        capability: 'agent.permissions',
        reason:
          'runtime permission responses are not integrated for this backend yet',
      });
    }
  });
});
