import { describe, expect, it, vi } from 'vitest';

import { parsePsRows, sampleProcessTree } from './process-resource-sampler';

describe('parsePsRows', () => {
  it('sums CPU/RSS for root and descendants', () => {
    const result = parsePsRows(
      [
        ' 10   1  1000  2.5 opencode',
        ' 11  10  2000  3.5 node',
        ' 12  11   500  1.0 sh',
        ' 99   1  9000  9.0 other',
      ].join('\n'),
      10,
    );

    expect(result).toEqual({
      pids: [10, 11, 12],
      cpuPercent: 7,
      rssBytes: 3_500 * 1024,
    });
  });

  it('returns zeroes when root pid is missing', () => {
    expect(parsePsRows(' 11 10 2000 3.5 node', 10)).toEqual({
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
    });
  });
});

describe('sampleProcessTree', () => {
  it('returns unsupported on win32', async () => {
    const result = await sampleProcessTree({
      rootPid: 10,
      platform: 'win32',
      execPs: vi.fn(),
    });

    expect(result.unsupportedReason).toBe(
      'process resource sampling is not supported on win32',
    );
  });

  it('returns unsupported reason when ps fails', async () => {
    const result = await sampleProcessTree({
      rootPid: 10,
      execPs: async () => {
        throw new Error('ps failed');
      },
    });

    expect(result).toEqual({
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
      unsupportedReason: 'ps failed',
    });
  });
});
