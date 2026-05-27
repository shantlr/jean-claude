import { describe, expect, it } from 'vitest';

import { parseOpenCodeModelsVerbose } from './backend-models-service';

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
});
