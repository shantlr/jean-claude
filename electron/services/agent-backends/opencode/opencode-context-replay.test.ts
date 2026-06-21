import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@opencode-ai/sdk/v2';


import type { OpenCodeNormalizationContext } from './normalize-opencode-message-v2';
import { replayOpenCodeContextUpdate } from './opencode-context-replay';

function createContext(): OpenCodeNormalizationContext {
  return {
    emittedEntryIds: new Set(),
    rawMessages: new Map(),
    rawParts: new Map(),
    sessionStartTime: 0,
    totalCost: 0,
  };
}

describe('replayOpenCodeContextUpdate', () => {
  it('applies message.part.delta to accumulated raw parts', () => {
    const ctx = createContext();
    const message = {
      id: 'msg-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: 1_717_000_000_000, completed: 1_717_000_000_500 },
    } as Message;
    const part = {
      id: 'part-1',
      messageID: 'msg-1',
      sessionID: 'session-1',
      type: 'text',
      text: 'Hello',
    } as Part;

    ctx.rawMessages.set(message.id, message);
    ctx.rawParts.set(message.id, [part]);

    replayOpenCodeContextUpdate(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'session-1',
          messageID: 'msg-1',
          partID: 'part-1',
          field: 'text',
          delta: ' world',
        },
      } as never,
      ctx,
    );

    expect(ctx.rawParts.get(message.id)).toMatchObject([
      {
        id: 'part-1',
        text: 'Hello world',
      },
    ]);
  });
});
