import type { DebugMessageWithRawData } from '@/lib/api';

export function downloadMessageMapping(
  messages: DebugMessageWithRawData[],
  taskId: string,
) {
  const mapping = messages.map((msg) => ({
    messageIndex: msg.messageIndex,
    rawFormat: msg.rawFormat,
    backendSessionId: msg.backendSessionId,
    createdAt: msg.createdAt,
    rawData: msg.rawData ?? null,
    normalizedData: msg.normalizedData ?? null,
  }));

  const blob = new Blob([JSON.stringify(mapping, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `message-mapping-${taskId.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
