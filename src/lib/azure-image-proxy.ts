/**
 * Azure Image Proxy - Renderer utilities
 *
 * Rewrites Azure DevOps image URLs to use the azure-image-proxy:// protocol
 * for authenticated image fetching via the main process.
 */

/**
 * Encodes an image URL for use with the azure-image-proxy protocol.
 * Uses base64url encoding to safely encode the URL.
 */
export function encodeProxyUrl(providerId: string, imageUrl: string): string {
  // Use btoa with URL-safe base64 encoding
  const encodedUrl = btoa(imageUrl)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `azure-image-proxy://${providerId}/${encodedUrl}`;
}

/**
 * Pattern to match Azure DevOps attachment URLs in HTML content.
 * Matches URLs like:
 *   https://dev.azure.com/Org/ProjectGuid/_apis/wit/attachments/AttachmentGuid?fileName=image.png
 *   https://org.visualstudio.com/Project/_apis/wit/attachments/...
 */
const AZURE_IMAGE_URL_PATTERN =
  /https:\/\/(?:dev\.azure\.com|[^/\s"']+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\/[^"'\s<>]*/gi;

/**
 * Rewrites Azure DevOps image URLs in HTML content to use the proxy protocol.
 * This allows images in work item descriptions to be fetched with PAT authentication.
 *
 * @param html - The HTML content containing image URLs
 * @param providerId - The provider ID to use for authentication
 * @returns The HTML with rewritten image URLs
 */
export function rewriteAzureImageUrls(
  html: string,
  providerId: string,
): string {
  return html.replace(AZURE_IMAGE_URL_PATTERN, (url) => {
    return encodeProxyUrl(providerId, url);
  });
}
