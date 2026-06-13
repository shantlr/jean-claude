import { describe, expect, it } from 'vitest';

import { estimateAiUsageCost } from './model-pricing';

describe('estimateAiUsageCost', () => {
  it('prices Codex GPT-5 models by provider-qualified model id', () => {
    expect(
      estimateAiUsageCost({
        model: 'openai/gpt-5.3-codex',
        usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      }),
    ).toEqual({ estimatedCostUsd: 17.5, pricingStatus: 'priced' });
  });

  it('prices OpenCode GPT-5.4 mini by provider-qualified model id', () => {
    for (const model of [
      'opencode/openai/gpt-5.4-mini',
      'opencode/github-copilot/gpt-5.4-mini',
    ]) {
      expect(
        estimateAiUsageCost({
          model,
          usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        }),
      ).toEqual({ estimatedCostUsd: 5.25, pricingStatus: 'priced' });
    }
  });
});
