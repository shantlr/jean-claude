/**
 * Mapping of image file extensions to MIME types.
 * Used for detecting and rendering image files in diff views and file explorer.
 */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};

/**
 * Set of image file extensions for quick lookups.
 */
export const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));

/**
 * Returns the MIME type for an image file path, or null if not an image.
 */
export function getImageMimeType(filePath: string): string | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = filePath.slice(lastDot).toLowerCase();
  return IMAGE_MIME_TYPES[ext] ?? null;
}

/**
 * Returns true if the file path has an image extension.
 */
export function isImagePath(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = filePath.slice(lastDot).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
