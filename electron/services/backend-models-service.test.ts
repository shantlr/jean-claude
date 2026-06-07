import { describe, expect, it } from 'vitest';

import {
  calculateTheoreticalOpenCodeCost,
  parseOpenCodeModelsVerbose,
} from './backend-models-service';

describe('parseOpenCodeModelsVerbose', () => {
  it('extracts reasoning variants from verbose OpenCode model output', () => {
    const models = parseOpenCodeModelsVerbose(`openai/gpt-5.3-codex
{
  "id": "gpt-5.3-codex",
  "providerID": "openai",
  "name": "GPT-5.3 Codex",
  "capabilities": {
    "reasoning": true
  },
  "variants": {
    "none": { "reasoningEffort": "none" },
    "low": { "reasoningEffort": "low" },
    "medium": { "reasoningEffort": "medium" },
    "high": { "reasoningEffort": "high" },
    "xhigh": { "reasoningEffort": "xhigh" }
  }
}
github-copilot/gpt-4.1
{
  "id": "gpt-4.1",
  "name": "GPT-4.1",
  "capabilities": {
    "reasoning": false
  },
  "variants": {}
}
`);

    expect(models).toEqual([
      {
        id: 'openai/gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        supportsThinking: true,
        thinkingEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
      },
      {
        id: 'github-copilot/gpt-4.1',
        label: 'GPT-4.1',
        supportsThinking: false,
      },
    ]);
  });

  it('extracts model cost metadata', () => {
    const models = parseOpenCodeModelsVerbose(`github-copilot/gpt-5.4
{
  "id": "gpt-5.4",
  "providerID": "github-copilot",
  "name": "GPT-5.4",
  "cost": {
    "input": 2.5,
    "output": 15,
    "cache": { "read": 0.25, "write": 0 }
  },
  "capabilities": { "reasoning": true },
  "variants": {}
}
`);

    expect(models[0]).toMatchObject({
      id: 'github-copilot/gpt-5.4',
      cost: { input: 2.5, output: 15, cache: { read: 0.25, write: 0 } },
    });
  });

  it('calculates theoretical cost for zero-cost subscription models', () => {
    expect(
      calculateTheoreticalOpenCodeCost({
        providerID: 'openai',
        modelID: 'gpt-5.4',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      }),
    ).toBe(17.75);
  });

  it('uses current official GPT-5.5 Pro fallback pricing', () => {
    expect(
      calculateTheoreticalOpenCodeCost({
        providerID: 'openai',
        modelID: 'gpt-5.5-pro',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(210);
  });

  it('does not estimate removed unverified fallback models', () => {
    expect(
      calculateTheoreticalOpenCodeCost({
        providerID: 'openai',
        modelID: 'gpt-5.2',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(0);
  });
});
