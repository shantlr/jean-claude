import type { Part } from '@opencode-ai/sdk/v2';
import { describe, expect, it } from 'vitest';

import { applyDeltaToMessageParts } from './opencode-message-delta';

describe('applyDeltaToMessageParts', () => {
  it('appends a text delta once for a matching part', () => {
    const parts = [
      {
        id: 'text-1',
        messageID: 'msg-1',
        sessionID: 'session-1',
        type: 'text',
        text: 'Hello',
      },
    ] as Part[];

    applyDeltaToMessageParts(parts, {
      partID: 'text-1',
      field: 'text',
      delta: ' world',
    });

    expect(parts[0]).toMatchObject({ text: 'Hello world' });
  });
});
