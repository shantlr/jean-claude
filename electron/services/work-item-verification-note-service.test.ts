import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, resolveAiSkillSlotMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  resolveAiSkillSlotMock: vi.fn(),
}));

vi.mock('./ai-generation-service', () => ({
  generateText: generateTextMock,
}));

vi.mock('./ai-skill-slot-resolver', () => ({
  resolveAiSkillSlot: resolveAiSkillSlotMock,
}));

import { generateWorkItemVerificationNote } from './work-item-verification-note-service';

describe('generateWorkItemVerificationNote', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    resolveAiSkillSlotMock.mockReset();
    resolveAiSkillSlotMock.mockResolvedValue(undefined);
  });

  it('uses an agent to generate a named checkbox note', async () => {
    generateTextMock.mockResolvedValue({
      title: 'Verify profile settings',
      note: '## Behavioral\n- [ ] Profile settings open from menu\n\n## Visual\n- [ ] Layout matches expected settings screen',
    });

    const note = await generateWorkItemVerificationNote({
      backend: 'claude-code',
      model: 'haiku',
      workItems: [
        {
          id: 12,
          title: 'Show profile settings',
          workItemType: 'User Story',
          state: 'Active',
          description: '<p>User can open profile settings.</p>',
        },
      ],
      testCasesByWorkItem: {
        12: [
          {
            id: 99,
            title: 'Open settings',
            steps: [
              {
                action: 'Click profile menu',
                expectedResult: 'Settings entry is visible',
              },
            ],
          },
        ],
      },
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'claude-code',
        model: 'haiku',
        outputSchema: expect.objectContaining({ type: 'object' }),
        prompt: expect.stringContaining(
          'Do not blindly mirror provided test cases',
        ),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('caveman-inspired'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('target 4-12 words'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('### Core flow'),
      }),
    );
    expect(note).toContain('# Verify profile settings');
    expect(note).toContain('## Behavioral');
    expect(note).toContain('## Visual');
  });

  it('returns null when agent output is invalid', async () => {
    generateTextMock.mockResolvedValue({ title: 'Missing note' });

    await expect(
      generateWorkItemVerificationNote({
        backend: 'opencode',
        model: 'default',
        workItems: [
          {
            id: 12,
            title: 'Show profile settings',
            workItemType: 'User Story',
            state: 'Active',
          },
        ],
        testCasesByWorkItem: {},
      }),
    ).resolves.toBeNull();
  });

  it('uses configured verification-note slot when present', async () => {
    resolveAiSkillSlotMock.mockResolvedValue({
      backend: 'opencode',
      model: 'openai/gpt-5.1-codex',
      skillName: 'verification-skill',
    });
    generateTextMock.mockResolvedValue({
      title: 'Verify settings',
      note: '## Behavioral\n- [ ] Works\n\n## Visual\n- [ ] Looks right',
    });

    await generateWorkItemVerificationNote({
      backend: 'claude-code',
      model: 'haiku',
      projectAiSkillSlots: null,
      workItems: [
        {
          id: 12,
          title: 'Show profile settings',
          workItemType: 'User Story',
          state: 'Active',
        },
      ],
      testCasesByWorkItem: {},
    });

    expect(resolveAiSkillSlotMock).toHaveBeenCalledWith(
      'verification-note',
      null,
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'opencode',
        model: 'openai/gpt-5.1-codex',
        skillName: 'verification-skill',
      }),
    );
  });
});
