export function getSelectedTextForRange(
  content: string | null,
  lineStart: number,
  lineEnd?: number,
): string | undefined {
  if (!content) return undefined;

  const lines = content.split('\n');
  const startIndex = Math.max(0, lineStart - 1);
  const endIndex = Math.min(lines.length - 1, (lineEnd ?? lineStart) - 1);

  if (startIndex >= lines.length || endIndex < startIndex) {
    return undefined;
  }

  return lines.slice(startIndex, endIndex + 1).join('\n');
}

export function escapePromptTagContent(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function formatPromptLineRange(
  lineStart: number,
  lineEnd?: number,
): string {
  return lineEnd ? `L${lineStart}-${lineEnd}` : `L${lineStart}`;
}
