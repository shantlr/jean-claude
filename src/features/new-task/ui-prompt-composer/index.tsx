import { useMemo } from 'react';
import TurndownService from 'turndown';

import { Kbd } from '@/common/ui/kbd';
import type { AzureDevOpsWorkItem } from '@/lib/api';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

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
  const { title, description } = fields;

  // Convert HTML description to markdown
  const markdownDescription = description
    ? turndown.turndown(description)
    : null;

  let content = `## Work Item #${id} "${title}"`;
  if (markdownDescription) {
    content += `\n\n${markdownDescription}`;
  }
  content += '\n\n---';

  return content;
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
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200"
        >
          &larr; Back to selection
          <Kbd shortcut="escape" />
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: Template editor */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="mb-2">
            <span className="text-xs font-medium text-neutral-400 uppercase">
              Prompt Template
            </span>
          </div>
          <textarea
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="flex-1 resize-none rounded border border-neutral-700 bg-neutral-900 p-3 font-mono text-sm text-neutral-200 outline-none focus:border-neutral-500"
            placeholder="Enter your prompt template..."
          />
          <p className="mt-2 text-xs text-neutral-500">
            Use {'{#id}'} placeholders to include work item details
          </p>
        </div>

        {/* Right: Preview */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="mb-2 text-xs font-medium text-neutral-400 uppercase">
            Preview
          </div>
          <div className="flex-1 overflow-y-auto rounded border border-neutral-700 bg-neutral-900/50 p-3">
            <pre className="font-mono text-sm whitespace-pre-wrap text-neutral-300">
              {preview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
