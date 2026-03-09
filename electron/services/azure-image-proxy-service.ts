/**
 * Azure Image Proxy Service
 *
 * Fetches images from Azure DevOps with PAT authentication.
 * Used by the azure-image-proxy:// protocol handler to proxy
 * authenticated requests for images in work item descriptions.
 */

import { ProviderRepository, TokenRepository } from '../database/repositories';
import { dbg } from '../lib/debug';

import { createAuthHeader } from './azure-devops-service';

/**
 * Validates URL and resolves provider credentials for an Azure DevOps image fetch.
 * Returns the authenticated Response on success, or an error string on failure.
 */
async function fetchAuthenticated(params: {
  providerId: string;
  imageUrl: string;
}): Promise<
  { response: Response; mimeType: string } | { error: string; status: number }
> {
  const { providerId, imageUrl } = params;

  // Validate the URL is an Azure DevOps URL
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    dbg.azureImageProxy('Invalid URL: %s', imageUrl);
    return { error: 'Invalid image URL', status: 400 };
  }

  if (
    !url.hostname.endsWith('dev.azure.com') &&
    !url.hostname.endsWith('visualstudio.com')
  ) {
    dbg.azureImageProxy('Rejected non-Azure DevOps URL: %s', imageUrl);
    return { error: 'Only Azure DevOps URLs are allowed', status: 403 };
  }

  // Get provider and token
  const provider = await ProviderRepository.findById(providerId);
  if (!provider?.tokenId) {
    dbg.azureImageProxy('Provider or token not found: %s', providerId);
    return { error: 'Provider or token not found', status: 401 };
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    dbg.azureImageProxy('Token not found for provider: %s', providerId);
    return { error: 'Token not found', status: 401 };
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: createAuthHeader(token),
      },
    });

    if (!response.ok) {
      dbg.azureImageProxy(
        'Failed to fetch image: %d %s',
        response.status,
        response.statusText,
      );
      return {
        error: 'Failed to fetch image from Azure DevOps',
        status: response.status,
      };
    }

    const mimeType =
      response.headers.get('content-type') || 'application/octet-stream';

    return { response, mimeType };
  } catch (error) {
    dbg.azureImageProxy('Error fetching image: %O', error);
    return { error: 'Error fetching image', status: 502 };
  }
}

/**
 * Fetches an image from Azure DevOps with PAT authentication and returns
 * a streaming Response. This streams the image data directly without
 * buffering the entire image in memory.
 */
export async function fetchAuthenticatedImageStream(params: {
  providerId: string;
  imageUrl: string;
}): Promise<Response> {
  const result = await fetchAuthenticated(params);

  if ('error' in result) {
    return new Response(result.error, { status: result.status });
  }

  const { response, mimeType } = result;
  const contentLength = response.headers.get('content-length');

  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Cache-Control': 'private, max-age=3600',
  };

  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  return new Response(response.body, { headers });
}

/**
 * Fetches an image from Azure DevOps with PAT authentication and returns
 * it as a base64-encoded string with its MIME type.
 */
export async function fetchImageAsBase64(params: {
  providerId: string;
  imageUrl: string;
}): Promise<{ data: string; mimeType: string } | null> {
  const result = await fetchAuthenticated(params);

  if ('error' in result) {
    return null;
  }

  const { response, mimeType } = result;
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString('base64');

  return { data, mimeType };
}

/**
 * Encodes an image URL for use with the azure-image-proxy protocol.
 */
export function encodeProxyUrl(providerId: string, imageUrl: string): string {
  const encodedUrl = Buffer.from(imageUrl).toString('base64url');
  return `azure-image-proxy://${providerId}/${encodedUrl}`;
}

/**
 * Decodes a proxy URL back to providerId and original image URL.
 */
export function decodeProxyUrl(
  proxyUrl: string,
): { providerId: string; imageUrl: string } | null {
  try {
    const url = new URL(proxyUrl);
    if (url.protocol !== 'azure-image-proxy:') {
      return null;
    }

    const providerId = url.hostname;
    // pathname starts with /, so we slice it off
    const encodedUrl = url.pathname.slice(1);
    const imageUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');

    return { providerId, imageUrl };
  } catch {
    return null;
  }
}
