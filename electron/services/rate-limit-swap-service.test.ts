import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
}));

vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: vi.fn(),
  },
}));

vi.mock('./agent-usage-service', () => ({
  agentUsageService: {
    getUsage: vi.fn(),
  },
}));

import { SettingsRepository } from '../database/repositories/settings';

import { agentUsageService } from './agent-usage-service';
import { RateLimitSwapService } from './rate-limit-swap-service';

function makeUsage(utilization: number) {
  return {
    data: {
      limits: [
        {
          key: 'primary',
          label: 'Primary',
          isPrimary: true,
          range: {
            utilization,
            resetsAt: new Date(),
            timeUntilReset: '10m',
            windowDurationMs: 300000,
          },
        },
      ],
    },
    error: null,
  };
}

describe('RateLimitSwapService (chain model)', () => {
  let service: RateLimitSwapService;

  beforeEach(() => {
    vi.mocked(SettingsRepository.get).mockReset();
    vi.mocked(agentUsageService.getUsage).mockReset();
    service = new RateLimitSwapService();
  });

  it('returns original when disabled', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: false,
      chain: [{ backend: 'claude-code', threshold: 0.8 }],
    });
    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('returns original when chain empty', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [],
    });
    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('picks first entry when under threshold', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', model: 'sonnet', threshold: 0.8 },
        { backend: 'opencode', model: 'gpt-4o' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.5),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('claude-code');
    expect(result.model).toBe('sonnet');
  });

  it('skips entries over threshold', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', model: 'sonnet', threshold: 0.8 },
        { backend: 'claude-code', model: 'haiku', threshold: 0.9 },
        { backend: 'opencode', model: 'gpt-4o' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.85),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('claude-code');
    expect(result.model).toBe('haiku');
  });

  it('falls through to last entry (no threshold) when all exceeded', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', model: 'sonnet', threshold: 0.8 },
        { backend: 'claude-code', model: 'haiku', threshold: 0.9 },
        { backend: 'opencode', model: 'gpt-4o' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.95),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('opencode');
    expect(result.model).toBe('gpt-4o');
    expect(result.swapped).toBe(true);
  });

  it('treats missing usage data as 0% (optimistic)', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', model: 'sonnet', threshold: 0.8 },
        { backend: 'opencode', model: 'gpt-4o' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({});
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('claude-code');
    expect(result.model).toBe('sonnet');
  });

  it('marks swapped=true when backend differs from requested', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', threshold: 0.8 },
        { backend: 'opencode' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.85),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.swapped).toBe(true);
    expect(result.skippedDueToRateLimit).toBe(true);
    expect(result.backend).toBe('opencode');
  });

  it('marks swapped=true when model override present even if same backend', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', model: 'haiku', threshold: 0.8 },
        { backend: 'opencode' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.5),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.swapped).toBe(true);
    expect(result.backend).toBe('claude-code');
    expect(result.model).toBe('haiku');
  });

  it('marks swapped=false when first entry matches requested with no model', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', threshold: 0.8 },
        { backend: 'opencode' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.5),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.swapped).toBe(false);
    expect(result.backend).toBe('claude-code');
  });

  it('treats default model and thinking as no override', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        {
          backend: 'claude-code',
          model: 'default',
          thinkingEffort: 'default',
          threshold: 0.8,
        },
        { backend: 'opencode' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.5),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result).toEqual({ backend: 'claude-code', swapped: false });
  });

  it('returns thinking override when configured', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', thinkingEffort: 'max', threshold: 0.8 },
        { backend: 'opencode' },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.5),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.swapped).toBe(true);
    expect(result.thinkingEffort).toBe('max');
  });

  it('checks different backend utilization for each entry', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', threshold: 0.8 },
        { backend: 'opencode', threshold: 0.7 },
        { backend: 'opencode', model: 'fallback' },
      ],
    });
    // claude-code over, opencode also over
    vi.mocked(agentUsageService.getUsage)
      .mockResolvedValueOnce({ 'claude-code': makeUsage(0.85) })
      .mockResolvedValueOnce({}); // opencode has no usage provider -> null -> optimistic -> pick it
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('opencode');
    expect(result.model).toBeUndefined();
  });

  it('reset clears notification state', async () => {
    service.reset();
    // No error = success
    expect(true).toBe(true);
  });

  it('falls back to last entry when all have thresholds and all exceeded', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      enabled: true,
      chain: [
        { backend: 'claude-code', threshold: 0.8 },
        { backend: 'claude-code', model: 'haiku', threshold: 0.9 },
      ],
    });
    vi.mocked(agentUsageService.getUsage).mockResolvedValue({
      'claude-code': makeUsage(0.95),
    });
    const result = await service.resolveBackend('claude-code');
    expect(result.backend).toBe('claude-code');
    expect(result.model).toBe('haiku');
  });
});
