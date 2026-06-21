import type { PromptImagePart, PromptPart } from '@shared/agent-backend-types';

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

function decodeXmlAttr(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attachedFilesPlaceholder(content: string): string {
  const placeholders = [...content.matchAll(/<file\b[^>]*>/g)].map(([tag]) => {
    const filename = tag.match(/\bname="([^"]*)"/)?.[1];
    return filename ? `[file: ${decodeXmlAttr(filename)}]` : '[file]';
  });

  return placeholders.length > 0 ? placeholders.join('\n') : '[file]';
}

export function sanitizeAttachedFilesXml(text: string): string {
  return text
    .replace(
      /<attached_files>\s*([\s\S]*?)\s*<\/attached_files>/g,
      (_, content: string) => attachedFilesPlaceholder(content),
    )
    .replace(/<attached_files>\s*([\s\S]*)$/g, (_, content: string) =>
      attachedFilesPlaceholder(content),
    );
}

export function buildPromptActivityText(parts: PromptPart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'text') {
        return sanitizeAttachedFilesXml(part.text);
      }

      if (part.type === 'image') {
        return part.filename ? `[image: ${part.filename}]` : '[image]';
      }

      return part.filename ? `[file: ${part.filename}]` : '[file]';
    })
    .join('\n')
    .trim();
}

export function buildTaskCreationActivityText({
  prompt,
  images,
}: {
  prompt: string;
  images?: PromptImagePart[] | null;
}): string {
  return buildPromptActivityText([
    { type: 'text', text: prompt },
    ...(images ?? []),
  ]);
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

/** Build markdown from the exact prompt data sent to agent backends. */
export function buildAgentPromptMarkdown(parts: PromptPart[]): string {
  const sections: string[] = [];

  const text = getPromptText(parts);
  if (text) sections.push(text);

  for (const img of getPromptImages(parts)) {
    const filename = (img.filename || 'image').replace(/[[\]()\\]/g, '_');
    sections.push(`![${filename}](data:${img.mimeType};base64,${img.data})`);
  }

  return sections.join('\n\n');
}
