import type { Part as OcPart } from '@opencode-ai/sdk/v2';

export function applyDeltaToMessageParts(
  parts: OcPart[] | undefined,
  delta: {
    partID: string;
    field: string;
    delta: unknown;
  },
): void {
  if (!parts || delta.field !== 'text' || typeof delta.delta !== 'string') {
    return;
  }

  const part = parts.find((candidate) => candidate.id === delta.partID);
  if (!part) return;

  if (
    (part.type === 'text' || part.type === 'reasoning') &&
    'text' in part &&
    typeof part.text === 'string'
  ) {
    part.text += delta.delta;
  }
}
