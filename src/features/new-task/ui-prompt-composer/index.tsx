import { useMemo } from 'react';
import TurndownService from 'turndown';

import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import type { AzureDevOpsWorkItem } from '@/lib/api';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Strip Azure DevOps attachment images from the markdown output.
// These images are extracted separately and attached as PromptImagePart[].
turndown.addRule('strip-azure-images', {
  filter: (node) => {
    if (node.nodeName !== 'IMG') return false;
    const src = node.getAttribute('src') ?? '';
    return AZURE_ATTACHMENT_URL_TEST.test(src);
  },
  replacement: () => '',
});

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Azure DevOps attachment URL pattern (global, for matchAll extraction).
 */
const AZURE_IMAGE_URL_PATTERN =
  /https:\/\/(?:dev\.azure\.com|[^\s"'<>]+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\/[^"'\s<>]*/gi;

/**
 * Non-global version for Turndown filter (avoids lastIndex issues with .test()).
 */
const AZURE_ATTACHMENT_URL_TEST =
  /https:\/\/(?:dev\.azure\.com|[^\s"'<>]+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\//i;

/** File extensions recognized as images in Azure DevOps attachment URLs. */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?)$/i;

/** Check whether an attachment URL points to an image (by fileName param or path). */
function isImageAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fileName = parsed.searchParams.get('fileName');
    if (fileName) return IMAGE_EXTENSIONS.test(fileName);
    // Fall back to checking the pathname
    return IMAGE_EXTENSIONS.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Extracts unique Azure DevOps image URLs from work item HTML fields.
 * Looks at both description and reproSteps. Filters out non-image attachments.
 */
export function extractWorkItemImageUrls(
  workItems: AzureDevOpsWorkItem[],
): string[] {
  const urls = new Set<string>();

  for (const workItem of workItems) {
    const { description, reproSteps } = workItem.fields;

    for (const html of [description, reproSteps]) {
      if (!html) continue;
      const matches = html.matchAll(AZURE_IMAGE_URL_PATTERN);
      for (const match of matches) {
        if (isImageAttachmentUrl(match[0])) {
          urls.add(match[0]);
        }
      }
    }
  }

  return [...urls];
}

// Generate initial prompt template from selected work items
export function generateInitialTemplate(workItemIds: string[]): string {
  const header =
    workItemIds.length === 1
      ? 'Implement the following work item:'
      : 'Implement the following work items:';

  const placeholders = workItemIds.map((id) => `{#${id}}`).join('\n\n');

  return `${header}\n\n${placeholders}`;
}

// Expand a single work item placeholder to full content
function expandWorkItem(workItem: AzureDevOpsWorkItem): string {
  const { id, fields } = workItem;
  const { title, description, reproSteps } = fields;

  const markdownDescription = description
    ? turndown.turndown(description)
    : null;
  const markdownReproSteps = reproSteps ? turndown.turndown(reproSteps) : null;

  const bodySections: string[] = [`  <title>${escapeXml(title)}</title>`];

  if (markdownDescription) {
    bodySections.push('  <description>');
    bodySections.push(escapeXml(markdownDescription));
    bodySections.push('  </description>');
  }

  if (markdownReproSteps) {
    bodySections.push('  <repro_steps>');
    bodySections.push(escapeXml(markdownReproSteps));
    bodySections.push('  </repro_steps>');
  }

  return [`<work_item id="${id}">`, ...bodySections, '</work_item>'].join('\n');
}

// Expand all placeholders in template to full content
export function expandTemplate(
  template: string,
  workItems: AzureDevOpsWorkItem[],
): string {
  const workItemMap = new Map(workItems.map((wi) => [wi.id.toString(), wi]));

  // Replace each {#id} placeholder with expanded content
  return template.replace(/\{#(\d+)\}/g, (match, id) => {
    const workItem = workItemMap.get(id);
    if (!workItem) {
      return match; // Keep placeholder if work item not found
    }
    return expandWorkItem(workItem);
  });
}

export function PromptComposer({
  template,
  workItems,
  onTemplateChange,
  onBack,
}: {
  template: string;
  workItems: AzureDevOpsWorkItem[];
  onTemplateChange: (template: string) => void;
  onBack: () => void;
}) {
  // Expand template to preview
  const preview = useMemo(
    () => expandTemplate(template, workItems),
    [template, workItems],
  );

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
      {/* Back button at top */}
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="sm" onClick={onBack}>
          &larr; Back to selection
          <Kbd shortcut="escape" />
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: Template editor */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="mb-2">
            <span className="text-ink-2 text-xs font-medium uppercase">
              Prompt Template
            </span>
          </div>
          <textarea
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="text-ink-1 focus:border-glass-border-strong border-glass-border bg-bg-0 flex-1 resize-none rounded border p-3 font-mono text-sm outline-none"
            placeholder="Enter your prompt template..."
          />
          <p className="text-ink-3 mt-2 text-xs">
            Use {'{#id}'} placeholders to include work item details
          </p>
        </div>

        {/* Right: Preview */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="text-ink-2 mb-2 text-xs font-medium uppercase">
            Preview
          </div>
          <div className="bg-bg-0/50 border-glass-border flex-1 overflow-y-auto rounded border p-3">
            <pre className="text-ink-1 font-mono text-sm whitespace-pre-wrap">
              {preview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
