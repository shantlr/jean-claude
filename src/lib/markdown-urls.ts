export function sanitizeMarkdownUrl(url: string): string {
  if (url.startsWith('azure-image-proxy://')) {
    return url;
  }

  if (url.startsWith('azure-devops-mention:')) {
    return url;
  }

  if (url.startsWith('data:image/')) {
    return url;
  }

  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];

  try {
    const parsed = new URL(url);
    if (safeProtocols.includes(parsed.protocol)) {
      return url;
    }
  } catch {
    if (!url.includes(':')) {
      return url;
    }
  }

  return '';
}
