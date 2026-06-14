import { describe, expect, it } from 'vitest';

import { buildAgentPromptMarkdown } from './prompt-utils';

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
