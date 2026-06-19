import type { PromptFilePart } from '@shared/agent-backend-types';

export const MAX_FILES = 10;
export const MAX_FILE_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Attachment reader returned a non-string result'));
        return;
      }

      const commaIndex = reader.result.indexOf(',');
      resolve(
        commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result,
      );
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read attachment file'));
    };

    reader.readAsDataURL(file);
  });
}

/** Escape a string for safe use inside an XML attribute value. */
function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getPathBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
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
  const electronPath =
    window.api.fs.getPathForFile(file) ??
    (file as File & { path?: string }).path;

  if (file.size > MAX_FILE_ATTACHMENT_SIZE) {
    if (electronPath && electronPath.length > 0) {
      onAttach({
        type: 'file',
        filePath: electronPath,
        filename: file.name,
      });
      return;
    }

    onError?.(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_ATTACHMENT_SIZE / 1024 / 1024} MB)`,
    );
    return;
  }

  // Prefer path-backed copy because it uses fs.copyFile (binary-safe) instead
  // of FileReader fallback.
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

  // Fallback: read the file as base64 and write via IPC.
  // This handles cases where File.path is not available.
  try {
    const base64 = await readFileAsBase64(file);
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

export async function processAttachmentPath(
  sourcePath: string,
  projectPath: string,
  onAttach: (file: PromptFilePart) => void,
  onError?: (message: string) => void,
): Promise<void> {
  const size = await window.api.fs.getFileSize(sourcePath);
  if (typeof size === 'number' && size > MAX_FILE_ATTACHMENT_SIZE) {
    onAttach({
      type: 'file',
      filePath: sourcePath,
      filename: getPathBasename(sourcePath),
    });
    return;
  }

  try {
    const result = await window.api.fs.copyAttachmentFile(
      projectPath,
      sourcePath,
    );
    onAttach({
      type: 'file',
      filePath: result.filePath,
      filename: result.filename,
    });
  } catch (err) {
    onError?.(`Failed to copy file: ${sourcePath}`);
    console.error('Failed to copy attachment file:', err);
  }
}
