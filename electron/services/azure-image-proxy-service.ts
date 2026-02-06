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
 * Fetches an image from Azure DevOps with PAT authentication and returns
 * a streaming Response. This streams the image data directly without
 * buffering the entire image in memory.
 */
export async function fetchAuthenticatedImageStream(params: {
  providerId: string;
  imageUrl: string;
}): Promise<Response> {
  const { providerId, imageUrl } = params;

  // Validate the URL is an Azure DevOps URL
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    dbg.azureImageProxy('Invalid URL: %s', imageUrl);
    return new Response('Invalid image URL', { status: 400 });
  }

  if (
    !url.hostname.endsWith('dev.azure.com') &&
    !url.hostname.endsWith('visualstudio.com')
  ) {
    dbg.azureImageProxy('Rejected non-Azure DevOps URL: %s', imageUrl);
    return new Response('Only Azure DevOps URLs are allowed', { status: 403 });
  }

  // Get provider and token
  const provider = await ProviderRepository.findById(providerId);
  if (!provider) {
    dbg.azureImageProxy('Provider not found: %s', providerId);
    return new Response('Provider not found', { status: 404 });
  }

  if (!provider.tokenId) {
    dbg.azureImageProxy('Provider has no token: %s', providerId);
    return new Response('Provider has no token', { status: 401 });
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    dbg.azureImageProxy('Token not found for provider: %s', providerId);
    return new Response('Token not found', { status: 401 });
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
      return new Response('Failed to fetch image from Azure DevOps', {
        status: response.status,
      });
    }

    // Stream the response body directly
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new Response(response.body, { headers });
  } catch (error) {
    dbg.azureImageProxy('Error fetching image: %O', error);
    return new Response('Error fetching image', { status: 502 });
  }
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
