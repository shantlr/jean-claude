import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, resolveAiSkillSlotMock, getSkillContentMock } =
  vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    resolveAiSkillSlotMock: vi.fn(),
    getSkillContentMock: vi.fn(),
  }));

vi.mock('./ai-generation-service', () => ({
  generateText: generateTextMock,
}));

vi.mock('./ai-skill-slot-resolver', () => ({
  resolveAiSkillSlot: resolveAiSkillSlotMock,
}));

vi.mock('./builtin-skills-service', () => ({
  getBuiltinSkillPath: vi.fn(() => '/builtin/task-name-generation/SKILL.md'),
}));

vi.mock('./skill-management-service', () => ({
  getSkillContent: getSkillContentMock,
}));

import { generateTaskName } from './name-generation-service';

describe('generateTaskName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAiSkillSlotMock.mockResolvedValue({
      backend: 'opencode',
      model: 'default',
      skillName: null,
    });
    getSkillContentMock.mockResolvedValue({
      content: 'Return a task name value no longer than 40 characters.',
    });
    generateTextMock.mockResolvedValue({
      name: 'fix PR details split-pane scroll',
    });
  });

  it('passes task name length limit as schema field constraint', async () => {
    const name = await generateTaskName('fix PR details split-pane scroll');

    expect(name).toBe('fix PR details split-pane scroll');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'opencode',
        outputSchema: expect.objectContaining({
          properties: {
            name: { type: 'string', maxLength: 40 },
          },
        }),
      }),
    );
  });

  it('passes Codex slot config through to AI generation', async () => {
    resolveAiSkillSlotMock.mockResolvedValue({
      backend: 'codex',
      model: 'gpt-5.1-codex',
      thinkingEffort: 'minimal',
      skillName: null,
    });

    const name = await generateTaskName('add codex task name generation');

    expect(name).toBe('fix PR details split-pane scroll');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'codex',
        model: 'gpt-5.1-codex',
        thinkingEffort: 'minimal',
        prompt: expect.stringContaining('Task to name:'),
        outputSchema: expect.objectContaining({
          properties: {
            name: { type: 'string', maxLength: 40 },
          },
        }),
      }),
    );
  });

  it('unwraps JSON text returned inside the name field', async () => {
    generateTextMock.mockResolvedValue({
      name: '{"name":"fix task name truncation"}',
    });

    const name = await generateTaskName('fix task name truncation');

    expect(name).toBe('fix task name truncation');
  });

  it('rejects partial JSON returned inside the name field', async () => {
    generateTextMock.mockResolvedValue({
      name: '{',
    });

    const name = await generateTaskName('fix partial JSON task names');

    expect(name).toBeNull();
  });

  it('rejects truncated JSON returned inside the name field', async () => {
    generateTextMock.mockResolvedValue({
      name: '{"name":"fix partial JSON task names"',
    });

    const name = await generateTaskName('fix partial JSON task names');

    expect(name).toBeNull();
  });

  it('rejects JSON object text without a name field', async () => {
    generateTextMock.mockResolvedValue({
      name: '{"title":"fix partial JSON task names"}',
    });

    const name = await generateTaskName('fix partial JSON task names');

    expect(name).toBeNull();
  });

  it('preserves non-JSON names that start with a brace', async () => {
    generateTextMock.mockResolvedValue({
      name: '{api} fix auth route',
    });

    const name = await generateTaskName('fix auth route');

    expect(name).toBe('{api} fix auth route');
  });
});
