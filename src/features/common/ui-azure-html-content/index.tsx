import { useMemo } from 'react';
import TurndownService from 'turndown';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import {
  replaceAzureDevOpsMentions,
  type MentionDisplayNames,
} from '@/lib/azure-devops-mentions';
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
  imageClassName,
  enableImageModal,
}: {
  /** The HTML content from Azure DevOps */
  html: string;
  /** The provider ID for authenticating image requests */
  providerId?: string;
  /** Optional className for the wrapper */
  className?: string;
  /** Optional className for rendered markdown images */
  imageClassName?: string;
  /** Whether rendered images should open in a modal when clicked */
  enableImageModal?: boolean;
}) {
  const markdown = useMemo(() => {
    if (!html) return '';

    // Azure DevOps TCM content uses uppercase tags (<DIV>, <P>, <STRONG>)
    // that Turndown cannot parse — lowercase them first
    const lowered = html.replace(/<\/?[A-Z][A-Z0-9]*\b[^>]*>/g, (tag) =>
      tag.toLowerCase(),
    );

    // Rewrite Azure DevOps image URLs to use the proxy protocol
    const processedHtml = providerId
      ? rewriteAzureImageUrls(lowered, providerId)
      : lowered;

    return turndown.turndown(processedHtml);
  }, [html, providerId]);

  if (!markdown.trim()) {
    return null;
  }

  return (
    <div className={className}>
      <MarkdownContent
        content={markdown}
        imageClassName={imageClassName}
        enableImageModal={enableImageModal}
      />
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
  mentionDisplayNames,
  className,
  imageClassName,
  enableImageModal,
}: {
  /** The Markdown content from Azure DevOps */
  markdown: string;
  /** The provider ID for authenticating image requests */
  providerId?: string;
  /** Azure DevOps identity IDs to display names for @<guid> mention tokens */
  mentionDisplayNames?: MentionDisplayNames;
  /** Optional className for the wrapper */
  className?: string;
  /** Optional className for rendered markdown images */
  imageClassName?: string;
  /** Whether rendered images should open in a modal when clicked */
  enableImageModal?: boolean;
}) {
  const processedMarkdown = useMemo(() => {
    if (!markdown) return '';

    // Rewrite Azure DevOps image URLs to use the proxy protocol
    const withImages = providerId
      ? rewriteAzureImageUrls(markdown, providerId)
      : markdown;

    return replaceAzureDevOpsMentions(withImages, mentionDisplayNames, {
      renderMarkdownLinks: true,
    });
  }, [markdown, providerId, mentionDisplayNames]);

  if (!processedMarkdown.trim()) {
    return null;
  }

  return (
    <div className={className}>
      <MarkdownContent
        content={processedMarkdown}
        imageClassName={imageClassName}
        enableImageModal={enableImageModal}
      />
    </div>
  );
}
