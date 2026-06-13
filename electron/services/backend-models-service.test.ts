import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrCreateCodexAppServer: vi.fn(),
}));

vi.mock('./agent-backends/codex/codex-app-server', () => ({
  getOrCreateCodexAppServer: mocks.getOrCreateCodexAppServer,
}));

import {
  calculateTheoreticalOpenCodeCost,
  getBackendModels,
  parseCodexModel,
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
  "limit": {
    "context": 272000
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
        contextWindow: 272_000,
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

  it('ignores missing OpenCode context window metadata', () => {
    const models = parseOpenCodeModelsVerbose(`github-copilot/gpt-4.1
{
  "id": "gpt-4.1",
  "name": "GPT-4.1",
  "capabilities": { "reasoning": false },
  "variants": {}
}
`);

    expect(models[0]).toEqual({
      id: 'github-copilot/gpt-4.1',
      label: 'GPT-4.1',
      supportsThinking: false,
    });
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 128_000.5],
    ['non-number', '128000'],
  ])('ignores %s OpenCode context window metadata', (_, context) => {
    const models = parseOpenCodeModelsVerbose(`github-copilot/gpt-4.1
{
  "id": "gpt-4.1",
  "name": "GPT-4.1",
  "limit": { "context": ${JSON.stringify(context)} },
  "capabilities": { "reasoning": false },
  "variants": {}
}
`);

    expect(models[0]).not.toHaveProperty('contextWindow');
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

  it('calculates GPT-5.4 mini fallback cost for OpenAI and Copilot', () => {
    for (const providerID of ['openai', 'github-copilot']) {
      expect(
        calculateTheoreticalOpenCodeCost({
          providerID,
          modelID: 'gpt-5.4-mini',
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cacheReadTokens: 1_000_000,
          cacheCreationTokens: 1_000_000,
        }),
      ).toBe(5.325);
    }
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

  it('parses Codex model metadata with reasoning efforts', () => {
    expect(
      parseCodexModel({
        id: 'gpt-5.4',
        displayName: 'GPT-5.4',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'minimal' },
          { reasoningEffort: 'medium' },
        ],
      }),
    ).toEqual({
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      supportsThinking: true,
      thinkingEfforts: ['minimal', 'medium'],
    });
  });

  it('fetches Codex models from app-server', async () => {
    mocks.getOrCreateCodexAppServer.mockResolvedValue({
      client: {
        request: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'gpt-5.4',
              displayName: 'GPT-5.4',
              hidden: false,
              supportedReasoningEfforts: [
                { reasoningEffort: 'minimal' },
                { reasoningEffort: 'medium' },
              ],
            },
          ],
        }),
      },
    });

    await expect(getBackendModels('codex')).resolves.toEqual([
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        supportsThinking: true,
        thinkingEfforts: ['minimal', 'medium'],
      },
    ]);
  });
});
