import type { PromptFilePart } from '@shared/agent-backend-types';

export const MAX_FILES = 10;
export const MAX_FILE_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

/** Escape a string for safe use inside an XML attribute value. */
function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Build an `<attached_files>` XML block from file parts.
 * Returns empty string if no files.
 */
export function buildAttachedFilesXml(files: PromptFilePart[]): string {
  if (files.length === 0) return '';
  const entries = files
    .map(
      (f) =>
        `  <file name="${escapeXmlAttr(f.filename)}" path="${escapeXmlAttr(f.filePath)}" />`,
    )
    .join('\n');
  return `\n\n<attached_files>\n${entries}\n</attached_files>`;
}

/**
 * Process a dropped/picked file by copying it to .jean-claude/tmp/ via IPC.
 */
export async function processAttachmentFile(
  file: File,
  projectPath: string,
  onAttach: (file: PromptFilePart) => void,
  onError?: (message: string) => void,
): Promise<void> {
  if (file.size > MAX_FILE_ATTACHMENT_SIZE) {
    onError?.(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_ATTACHMENT_SIZE / 1024 / 1024} MB)`,
    );
    return;
  }

  // Electron File objects from file picker and drag/drop have a .path property
  // with the absolute filesystem path. This is always preferred as it uses
  // fs.copyFile (binary-safe) instead of file.text() (UTF-8 only).
  const electronPath = (file as File & { path?: string }).path;
  if (electronPath && electronPath.length > 0) {
    try {
      const result = await window.api.fs.copyAttachmentFile(
        projectPath,
        electronPath,
      );
      onAttach({
        type: 'file',
        filePath: result.filePath,
        filename: result.filename,
      });
    } catch (err) {
      onError?.(`Failed to copy file: ${file.name}`);
      console.error('Failed to copy attachment file:', err);
    }
    return;
  }

  // Fallback: read file as binary (base64) and write via IPC.
  // This handles cases where File.path is not available (shouldn't happen
  // in Electron, but kept as a safety net).
  try {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const filePath = await window.api.fs.writeAttachmentFile(
      projectPath,
      file.name,
      base64,
      'base64',
    );
    onAttach({
      type: 'file',
      filePath,
      filename: file.name,
    });
  } catch (err) {
    onError?.(`Failed to process file: ${file.name}`);
    console.error('Failed to process attachment file:', err);
  }
}
