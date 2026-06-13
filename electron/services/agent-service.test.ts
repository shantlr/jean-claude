import { describe, expect, it } from 'vitest';

import { buildSessionIdStepUpdate } from './agent-session-update';

describe('buildSessionIdStepUpdate', () => {
  it('does not overwrite model settings when backend stays the same', () => {
    expect(
      buildSessionIdStepUpdate({
        sessionId: 'session-1',
        backendType: 'claude-code',
        requestedBackendType: 'claude-code',
      }),
    ).toEqual({
      sessionId: 'session-1',
      agentBackend: 'claude-code',
    });
  });

  it('clears stale model settings when backend changes without explicit overrides', () => {
    expect(
      buildSessionIdStepUpdate({
        sessionId: 'session-1',
        backendType: 'opencode',
        requestedBackendType: 'claude-code',
      }),
    ).toEqual({
      sessionId: 'session-1',
      agentBackend: 'opencode',
      modelPreference: 'default',
      thinkingEffort: 'default',
    });
  });

  it('persists explicit swap overrides when backend changes', () => {
    expect(
      buildSessionIdStepUpdate({
        sessionId: 'session-1',
        backendType: 'opencode',
        requestedBackendType: 'claude-code',
        swapModel: 'openai/gpt-5.1',
        swapThinkingEffort: 'high',
      }),
    ).toEqual({
      sessionId: 'session-1',
      agentBackend: 'opencode',
      modelPreference: 'openai/gpt-5.1',
      thinkingEffort: 'high',
    });
  });
});
