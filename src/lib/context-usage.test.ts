import { describe, expect, it } from 'vitest';

import { calculateContextUsage } from './context-usage';

describe('calculateContextUsage', () => {
  it('uses latest Claude Code result after compact and excludes output tokens', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'old',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 90_000, outputTokens: 10_000 },
        },
        {
          id: 'compact',
          date: '2026-01-01T00:00:01.000Z',
          type: 'system-status',
          status: null,
        },
        {
          id: 'latest',
          date: '2026-01-01T00:00:02.000Z',
          type: 'result',
          isError: false,
          usage: {
            inputTokens: 10_000,
            outputTokens: 5_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 15_000,
      contextWindow: 200_000,
      percentage: 7.5,
      hasData: true,
      source: 'latest-response',
      isEstimate: false,
    });
  });

  it('uses latest OpenCode context usage and includes output, reasoning, and cache tokens', () => {
    const result = calculateContextUsage({
      backend: 'opencode',
      contextWindow: 128_000,
      entries: [
        {
          id: 'a',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          contextUsage: {
            inputTokens: 20_000,
            outputTokens: 4_000,
            reasoningTokens: 1_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 30_000,
      contextWindow: 128_000,
      percentage: 23.4375,
      hasData: true,
      source: 'opencode-estimate',
      isEstimate: true,
    });
  });

  it('does not use cumulative OpenCode usage when context usage is missing', () => {
    const result = calculateContextUsage({
      backend: 'opencode',
      contextWindow: 128_000,
      entries: [
        {
          id: 'old-opencode-result',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: {
            inputTokens: 20_000,
            outputTokens: 4_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 0,
      hasData: false,
      isEstimate: true,
    });
  });

  it('prefers contextUsage over cumulative usage', () => {
    const result = calculateContextUsage({
      backend: 'opencode',
      contextWindow: 128_000,
      entries: [
        {
          id: 'a',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: {
            inputTokens: 90_000,
            outputTokens: 10_000,
            cacheReadTokens: 5_000,
            cacheCreationTokens: 5_000,
          },
          contextUsage: {
            inputTokens: 20_000,
            outputTokens: 4_000,
            reasoningTokens: 1_000,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 2_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 30_000,
      hasData: true,
      source: 'opencode-estimate',
    });
  });

  it('returns no data when no post-compact result has usage', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'old',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 90_000, outputTokens: 10_000 },
        },
        {
          id: 'compact',
          date: '2026-01-01T00:00:01.000Z',
          type: 'system-status',
          status: null,
        },
      ],
    });

    expect(result.hasData).toBe(false);
    expect(result.contextTokens).toBe(0);
  });

  it('skips result entries without context usage and uses the previous usable result', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'usable',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 10_000, outputTokens: 5_000 },
        },
        {
          id: 'metadata-only',
          date: '2026-01-01T00:00:01.000Z',
          type: 'result',
          isError: false,
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 10_000,
      hasData: true,
      source: 'latest-response',
    });
  });

  it('keeps last known usage while compaction is running', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'latest',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 10_000, outputTokens: 5_000 },
        },
        {
          id: 'compacting',
          date: '2026-01-01T00:00:01.000Z',
          type: 'system-status',
          status: 'compacting',
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 10_000,
      hasData: true,
      source: 'latest-response',
    });
  });

  it('treats a zero-token usage payload as data', () => {
    const result = calculateContextUsage({
      backend: 'claude-code',
      contextWindow: 200_000,
      entries: [
        {
          id: 'zero',
          date: '2026-01-01T00:00:00.000Z',
          type: 'result',
          isError: false,
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      ],
    });

    expect(result).toMatchObject({
      contextTokens: 0,
      percentage: 0,
      hasData: true,
      source: 'latest-response',
    });
  });
});
