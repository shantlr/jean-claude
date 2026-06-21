import type {
  AssistantMessage as OcAssistantMessage,
  Event as OcEvent,
  Message as OcMessage,
  Part as OcPart,
} from '@opencode-ai/sdk/v2';

import { applyDeltaToMessageParts } from './opencode-message-delta';
import type { OpenCodeNormalizationContext } from './normalize-opencode-message-v2';


/**
 * Replay OpenCode context updates for an SSE event.
 * Mirrors pre-normalizer updates in opencode-backend.ts.
 */
export function replayOpenCodeContextUpdate(
  event: OcEvent,
  ctx: OpenCodeNormalizationContext,
): void {
  switch (event.type) {
    case 'message.updated': {
      const props = event.properties as { info: OcMessage };
      ctx.rawMessages.set(props.info.id, props.info);
      if (props.info.role === 'assistant') {
        ctx.totalCost += (props.info as OcAssistantMessage).cost ?? 0;
      }
      break;
    }
    case 'message.part.updated': {
      const props = event.properties as { part: OcPart };
      const part = props.part;
      const existing = ctx.rawParts.get(part.messageID) ?? [];
      const idx = existing.findIndex((p) => p.id === part.id);
      if (idx >= 0) {
        existing[idx] = part;
      } else {
        existing.push(part);
      }
      ctx.rawParts.set(part.messageID, existing);
      break;
    }
    case 'message.part.delta': {
      const props = event.properties as {
        messageID: string;
        partID: string;
        field: string;
        delta: unknown;
      };
      applyDeltaToMessageParts(ctx.rawParts.get(props.messageID), props);
      break;
    }
    case 'message.removed': {
      const props = event.properties as { messageID: string };
      const prefix = `${props.messageID}:`;
      for (const entryId of ctx.emittedEntryIds) {
        if (entryId.startsWith(prefix)) {
          ctx.emittedEntryIds.delete(entryId);
        }
      }
      ctx.rawMessages.delete(props.messageID);
      ctx.rawParts.delete(props.messageID);
      break;
    }
    case 'message.part.removed': {
      const props = event.properties as {
        messageID: string;
        partID: string;
      };
      const parts = ctx.rawParts.get(props.messageID);
      if (parts) {
        const idx = parts.findIndex((p) => p.id === props.partID);
        if (idx >= 0) parts.splice(idx, 1);
      }
      break;
    }
    default:
      break;
  }
}
