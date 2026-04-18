import { X } from 'lucide-react';

import type { QueuedPrompt } from '@shared/agent-types';

export function QueuedPromptEntry({
  prompt,
  onCancel,
}: {
  prompt: QueuedPrompt;
  onCancel: (promptId: string) => void;
}) {
  return (
    <div className="bg-bg-1/30 relative pl-6">
      {/* Dot - hollow/outline to indicate "queued/pending" */}
      <div className="border-glass-border-strong absolute top-2.5 -left-1 h-2 w-2 rounded-full border bg-transparent" />

      {/* Content */}
      <div className="flex items-start justify-between gap-2 py-1.5 pr-3">
        <div className="min-w-0 flex-1">
          <span className="text-ink-3 text-[10px] font-medium tracking-wide uppercase">
            Queued
          </span>
          <p className="text-ink-2 mt-0.5 truncate text-xs">{prompt.content}</p>
        </div>

        {/* Cancel button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel(prompt.id);
          }}
          className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 shrink-0 rounded p-1 transition-colors"
          title="Cancel queued prompt"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
