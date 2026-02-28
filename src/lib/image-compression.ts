/**
 * Client-side image compression using Canvas API.
 *
 * Two compression targets:
 * - WebP for agent backends (sent to the LLM)
 * - AVIF for storage (inlined in agent_messages, smaller)
 */

function stripDataUriPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

async function loadAndResize(
  source: File | Blob,
  maxDim: number,
): Promise<HTMLCanvasElement> {
  const img = new Image();
  const objectUrl = URL.createObjectURL(source);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

/** Compress an image for both agent and storage using a single canvas load. */
export async function compressImage(
  source: File | Blob,
  maxDim = 1920,
): Promise<{
  agent: { data: string; mimeType: string };
  storage: { data: string; mimeType: string };
}> {
  const canvas = await loadAndResize(source, maxDim);

  // Agent: WebP
  const webpUrl = canvas.toDataURL('image/webp', 0.75);
  const agent = { data: stripDataUriPrefix(webpUrl), mimeType: 'image/webp' };

  // Storage: AVIF with WebP fallback
  const avifUrl = canvas.toDataURL('image/avif', 0.65);
  const storage = avifUrl.startsWith('data:image/avif')
    ? { data: stripDataUriPrefix(avifUrl), mimeType: 'image/avif' }
    : { data: agent.data, mimeType: 'image/webp' };

  return { agent, storage };
}
