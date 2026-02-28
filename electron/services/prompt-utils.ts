import type { PromptPart, PromptImagePart } from '@shared/agent-backend-types';

/** Wrap a plain text string as a single-element PromptPart array. */
export function textPrompt(text: string): PromptPart[] {
  return [{ type: 'text', text }];
}

/** Extract concatenated text from a PromptPart array. */
export function getPromptText(parts: PromptPart[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Extract image parts from a PromptPart array. */
export function getPromptImages(parts: PromptPart[]): PromptImagePart[] {
  return parts.filter((p): p is PromptImagePart => p.type === 'image');
}

/**
 * Build a markdown string with images inlined as base64 data URIs.
 * Uses storageData/storageMimeType (AVIF) when available, otherwise falls back
 * to the agent-facing data/mimeType.
 */
export function buildPromptMarkdown(parts: PromptPart[]): string {
  const sections: string[] = [];

  const text = getPromptText(parts);
  if (text) sections.push(text);

  for (const img of getPromptImages(parts)) {
    const data = img.storageData ?? img.data;
    const mime = img.storageMimeType ?? img.mimeType;
    // Sanitize filename to prevent markdown injection via crafted filenames
    const filename = (img.filename || 'image').replace(/[[\]()\\]/g, '_');
    sections.push(`![${filename}](data:${mime};base64,${data})`);
  }

  return sections.join('\n\n');
}
