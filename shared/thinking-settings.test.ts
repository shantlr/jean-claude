import { describe, expect, it } from 'vitest';

import { getThinkingEffortOptions } from './thinking-settings';

describe('getThinkingEffortOptions', () => {
  it('keeps default available for Claude model-specific capabilities', () => {
    expect(
      getThinkingEffortOptions({
        backend: 'claude-code',
        model: 'opus',
        capabilities: {
          supportsThinking: true,
          thinkingEfforts: ['low', 'medium', 'high', 'max'],
        },
      }).map((option) => option.value),
    ).toEqual(['default', 'low', 'medium', 'high', 'max']);
  });

  it('hides explicit efforts for known non-reasoning OpenCode models', () => {
    expect(
      getThinkingEffortOptions({
        backend: 'opencode',
        model: 'github-copilot/gpt-4.1',
        capabilities: { supportsThinking: false },
      }).map((option) => option.value),
    ).toEqual(['default']);
  });
});
