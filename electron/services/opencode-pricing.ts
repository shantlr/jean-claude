export interface OpenCodeModelCost {
  input: number;
  output: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

// Fallback for subscription-backed OpenAI models that OpenCode reports as $0.
// Values are USD per 1M tokens from current official OpenAI standard pricing.
const OPENAI_THEORETICAL_COSTS_PER_M: Record<string, OpenCodeModelCost> = {
  'gpt-5.3-codex': {
    input: 1.75,
    output: 14,
    cache: { read: 0.175, write: 0 },
  },
  'gpt-5.4': { input: 2.5, output: 15, cache: { read: 0.25, write: 0 } },
  'gpt-5.4-mini': {
    input: 0.75,
    output: 4.5,
    cache: { read: 0.075, write: 0 },
  },
  'gpt-5.4-nano': {
    input: 0.2,
    output: 1.25,
    cache: { read: 0.02, write: 0 },
  },
  'gpt-5.5': { input: 5, output: 30, cache: { read: 0.5, write: 0 } },
  'gpt-5.5-pro': { input: 30, output: 180 },
};

export function getOpenCodeFallbackCost(
  providerID?: string,
  modelID?: string,
): OpenCodeModelCost | undefined {
  if (providerID !== 'openai' || !modelID) return undefined;

  return OPENAI_THEORETICAL_COSTS_PER_M[normalizeOpenAIModelID(modelID)];
}

function normalizeOpenAIModelID(modelID: string): string {
  return modelID.replace(/-fast$/, '');
}
