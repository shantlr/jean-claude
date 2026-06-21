import { describe, expect, it } from 'vitest';

import {
  buildAgentPromptMarkdown,
  buildPromptActivityText,
  buildTaskCreationActivityText,
  sanitizeAttachedFilesXml,
} from './prompt-utils';

describe('buildAgentPromptMarkdown', () => {
  it('serializes text and agent-facing image data as markdown', () => {
    const markdown = buildAgentPromptMarkdown([
      { type: 'text', text: 'Inspect this' },
      {
        type: 'image',
        data: 'webp-data',
        mimeType: 'image/webp',
        filename: 'screen[1].png',
        storageData: 'avif-data',
        storageMimeType: 'image/avif',
      },
    ]);

    expect(markdown).toBe(
      'Inspect this\n\n![screen_1_.png](data:image/webp;base64,webp-data)',
    );
  });

  it('keeps image-only prompts visible', () => {
    const markdown = buildAgentPromptMarkdown([
      {
        type: 'image',
        data: 'image-data',
        mimeType: 'image/png',
      },
    ]);

    expect(markdown).toBe('![image](data:image/png;base64,image-data)');
  });
});

describe('buildPromptActivityText', () => {
  it('keeps text and uses placeholders for non-text prompt parts', () => {
    expect(
      buildPromptActivityText([
        { type: 'text', text: 'Inspect this' },
        { type: 'image', data: 'image-data', mimeType: 'image/png' },
        { type: 'file', filePath: '/tmp/spec.md', filename: 'spec.md' },
      ]),
    ).toBe('Inspect this\n[image]\n[file: spec.md]');
  });

  it('sanitizes attached file XML blocks in text parts', () => {
    expect(
      buildPromptActivityText([
        {
          type: 'text',
          text: 'Review this\n\n<attached_files>\n  <file name="spec.md" path="/private/tmp/project/.jean-claude/tmp/spec.md" />\n  <file name="plan &amp; notes.txt" path="/private/tmp/project/.jean-claude/tmp/plan.txt" />\n</attached_files>',
        },
      ]),
    ).toBe('Review this\n\n[file: spec.md]\n[file: plan & notes.txt]');
  });

  it('sanitizes incomplete attached file XML fragments', () => {
    const sanitized = sanitizeAttachedFilesXml(
      'Review this\n<attached_files>\n  <file name="fixture.json" path="/var/folders/tmp/fixture.json"',
    );

    expect(sanitized).toContain('[file');
    expect(sanitized).not.toContain('/var/folders/tmp');
  });
});

describe('buildTaskCreationActivityText', () => {
  it('appends image placeholders to task creation prompt text', () => {
    expect(
      buildTaskCreationActivityText({
        prompt: 'Build this',
        images: [
          { type: 'image', data: 'image-data', mimeType: 'image/png' },
          {
            type: 'image',
            data: 'screen-data',
            mimeType: 'image/png',
            filename: 'screen.png',
          },
        ],
      }),
    ).toBe('Build this\n[image]\n[image: screen.png]');
  });

  it('sanitizes attached file XML blocks in task creation prompts', () => {
    expect(
      buildTaskCreationActivityText({
        prompt:
          'Build this\n\n<attached_files>\n  <file name="fixture.json" path="/var/folders/tmp/fixture.json" />\n</attached_files>',
      }),
    ).toBe('Build this\n\n[file: fixture.json]');
  });
});
