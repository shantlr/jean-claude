import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, resolveAiSkillSlotMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  resolveAiSkillSlotMock: vi.fn(),
}));

vi.mock('./ai-generation-service', () => ({
  generateText: generateTextMock,
}));

vi.mock('../database/repositories/projects', () => ({
  ProjectRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./ai-skill-slot-resolver', () => ({
  resolveAiSkillSlot: resolveAiSkillSlotMock,
}));

import { generateProjectSummary } from './project-summary-generation-service';

describe('generateProjectSummary', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    resolveAiSkillSlotMock.mockReset();
    resolveAiSkillSlotMock.mockResolvedValue(undefined);
  });

  it('allows Read in the project directory', async () => {
    generateTextMock.mockResolvedValue({
      summary: 'Desktop app for managing coding agents.',
    });

    const result = await generateProjectSummary({
      project: {
        name: 'Jean Claude',
        path: '/workspace/jean-claude',
        color: '#7c3aed',
        aiSkillSlots: null,
      },
    });

    expect(result).toBe('Desktop app for managing coding agents.');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/workspace/jean-claude',
        allowedTools: ['Read'],
      }),
    );
  });
});
