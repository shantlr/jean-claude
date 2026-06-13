import { describe, expect, it } from 'vitest';

import { getContextWindowForModel } from './model-context-window';

describe('getContextWindowForModel', () => {
  it('prefers dynamic model context window', () => {
    expect(
      getContextWindowForModel({
        backend: 'opencode',
        model: 'anthropic/claude-sonnet-4',
        dynamicContextWindow: 1_000_000,
      }),
    ).toBe(1_000_000);
  });

  it('falls back to Claude Code default window', () => {
    expect(
      getContextWindowForModel({ backend: 'claude-code', model: 'sonnet' }),
    ).toBe(200_000);
  });
});
