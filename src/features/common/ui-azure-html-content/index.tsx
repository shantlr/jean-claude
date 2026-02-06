import { useMemo } from 'react';
import TurndownService from 'turndown';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { rewriteAzureImageUrls } from '@/lib/azure-image-proxy';

// Shared Turndown instance for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Renders Azure DevOps HTML content (e.g., work item descriptions)
 * with authenticated image proxy support.
 *
 * Converts HTML to Markdown and rewrites Azure DevOps image URLs to use
 * the azure-image-proxy:// protocol for authenticated fetching.
 */
export function AzureHtmlContent({
  html,
  providerId,
  className,
}: {
  /** The HTML content from Azure DevOps */
  html: string;
  /** The provider ID for authenticating image requests */
  providerId?: string;
  /** Optional className for the wrapper */
  className?: string;
}) {
  const markdown = useMemo(() => {
    if (!html) return '';

    // Rewrite Azure DevOps image URLs to use the proxy protocol
    const processedHtml = providerId
      ? rewriteAzureImageUrls(html, providerId)
      : html;

    return turndown.turndown(processedHtml);
  }, [html, providerId]);

  if (!markdown.trim()) {
    return null;
  }

  return (
    <div className={className}>
      <MarkdownContent content={markdown} />
    </div>
  );
}

/**
 * Renders Azure DevOps Markdown content (e.g., PR descriptions)
 * with authenticated image proxy support.
 *
 * Rewrites Azure DevOps image URLs to use the azure-image-proxy:// protocol
 * for authenticated fetching.
 */
export function AzureMarkdownContent({
  markdown,
  providerId,
  className,
}: {
  /** The Markdown content from Azure DevOps */
  markdown: string;
  /** The provider ID for authenticating image requests */
  providerId?: string;
  /** Optional className for the wrapper */
  className?: string;
}) {
  const processedMarkdown = useMemo(() => {
    if (!markdown) return '';

    // Rewrite Azure DevOps image URLs to use the proxy protocol
    return providerId ? rewriteAzureImageUrls(markdown, providerId) : markdown;
  }, [markdown, providerId]);

  if (!processedMarkdown.trim()) {
    return null;
  }

  return (
    <div className={className}>
      <MarkdownContent content={processedMarkdown} />
    </div>
  );
}
