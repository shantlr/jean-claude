import type {
  AiUsagePricingStatus,
  AiUsageTokenInput,
} from '@shared/ai-usage-types';

export const AI_USAGE_PRICING_VERSION = '2026-06-12-anthropic-pricing';

type ModelPricing = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

// USD per 1M tokens. Claude rates verified against Anthropic pricing docs on 2026-06-12.
// Keep conservative; unknown models cost $0 and are flagged.
const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  opus: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-3-haiku': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.025,
    cacheWrite: 0.3125,
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.025,
    cacheWrite: 0.3125,
  },
  'claude-3-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-sonnet-20240229': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-3-opus': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-3-opus-20240229': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-haiku-4.5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-haiku-4-5-20251001': {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4.6': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4-5': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4.5': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-3-5-haiku-latest': {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  'claude-3-5-haiku-20241022': {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  'claude-3-5-sonnet-latest': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-3-5-sonnet-20241022': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-3-5-sonnet-20240620': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-3-7-sonnet-latest': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-3-7-sonnet-20250219': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4-0': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4-20250514': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-opus-4-0': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  'claude-opus-4-20250514': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  'claude-opus-4-1': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  'claude-opus-4-1-20250805': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5 },
  'gpt-5.5-codex': { input: 5, output: 30, cacheRead: 0.5 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25 },
  'gpt-5.4-codex': { input: 2.5, output: 15, cacheRead: 0.25 },
  'gpt-5.3-codex': { input: 2.5, output: 15, cacheRead: 0.25 },
  'gpt-5-codex': { input: 2.5, output: 15, cacheRead: 0.25 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  o3: { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'codestral-latest': { input: 0.3, output: 0.9 },
};

function normalizeModel(model: string): string {
  return model.trim().toLowerCase();
}

function getPricingForModel(model: string): ModelPricing | undefined {
  const normalized = normalizeModel(model);
  const providerModel = normalized.split('/').pop() ?? normalized;
  return (
    PRICING_BY_MODEL[normalized] ??
    PRICING_BY_MODEL[providerModel] ??
    (normalized.includes('fable-5')
      ? PRICING_BY_MODEL['claude-fable-5']
      : undefined) ??
    (normalized.includes('mythos-5')
      ? PRICING_BY_MODEL['claude-mythos-5']
      : undefined) ??
    (normalized.includes('haiku-4-5') || normalized.includes('haiku-4.5')
      ? PRICING_BY_MODEL['claude-haiku-4-5']
      : undefined) ??
    (normalized.includes('3-5-haiku') || normalized.includes('3.5-haiku')
      ? PRICING_BY_MODEL['claude-3-5-haiku-latest']
      : undefined) ??
    (normalized.includes('3-haiku') || normalized.includes('haiku-3')
      ? PRICING_BY_MODEL['claude-3-haiku']
      : undefined) ??
    (normalized.includes('sonnet-4-6') || normalized.includes('sonnet-4.6')
      ? PRICING_BY_MODEL['claude-sonnet-4-6']
      : undefined) ??
    (normalized.includes('sonnet-4-5') || normalized.includes('sonnet-4.5')
      ? PRICING_BY_MODEL['claude-sonnet-4-5']
      : undefined) ??
    (normalized.includes('sonnet-4')
      ? PRICING_BY_MODEL['claude-sonnet-4-0']
      : undefined) ??
    (normalized.includes('3-7-sonnet') || normalized.includes('3.7-sonnet')
      ? PRICING_BY_MODEL['claude-3-7-sonnet-latest']
      : undefined) ??
    (normalized.includes('3-5-sonnet') || normalized.includes('3.5-sonnet')
      ? PRICING_BY_MODEL['claude-3-5-sonnet-latest']
      : undefined) ??
    (normalized.includes('3-sonnet') || normalized.includes('sonnet-3')
      ? PRICING_BY_MODEL['claude-3-sonnet']
      : undefined) ??
    (normalized.includes('opus-4-8') || normalized.includes('opus-4.8')
      ? PRICING_BY_MODEL['claude-opus-4-8']
      : undefined) ??
    (normalized.includes('opus-4-7') || normalized.includes('opus-4.7')
      ? PRICING_BY_MODEL['claude-opus-4-7']
      : undefined) ??
    (normalized.includes('opus-4-6') || normalized.includes('opus-4.6')
      ? PRICING_BY_MODEL['claude-opus-4-6']
      : undefined) ??
    (normalized.includes('opus-4-5') || normalized.includes('opus-4.5')
      ? PRICING_BY_MODEL['claude-opus-4-5']
      : undefined) ??
    (normalized.includes('opus-4')
      ? PRICING_BY_MODEL['claude-opus-4-0']
      : undefined) ??
    (normalized.includes('3-opus') || normalized.includes('opus-3')
      ? PRICING_BY_MODEL['claude-3-opus']
      : undefined) ??
    (normalized.includes('gpt-5.5-codex')
      ? PRICING_BY_MODEL['gpt-5.5-codex']
      : undefined) ??
    (normalized.includes('gpt-5.4-codex')
      ? PRICING_BY_MODEL['gpt-5.4-codex']
      : undefined) ??
    (normalized.includes('gpt-5.3-codex')
      ? PRICING_BY_MODEL['gpt-5.3-codex']
      : undefined) ??
    (normalized.includes('gpt-5') && normalized.includes('codex')
      ? PRICING_BY_MODEL['gpt-5-codex']
      : undefined)
  );
}

export function estimateAiUsageCost({
  model,
  usage,
}: {
  model: string;
  usage: AiUsageTokenInput;
}): { estimatedCostUsd: number; pricingStatus: AiUsagePricingStatus } {
  const pricing = getPricingForModel(model);
  if (!pricing) {
    return { estimatedCostUsd: 0, pricingStatus: 'unknown' };
  }

  const estimatedCostUsd =
    ((usage.inputTokens ?? 0) * pricing.input +
      (usage.outputTokens ?? 0) * pricing.output +
      (usage.cacheReadTokens ?? 0) * (pricing.cacheRead ?? pricing.input) +
      (usage.cacheCreationTokens ?? 0) *
        (pricing.cacheWrite ?? pricing.input)) /
    1_000_000;

  return { estimatedCostUsd, pricingStatus: 'priced' };
}
