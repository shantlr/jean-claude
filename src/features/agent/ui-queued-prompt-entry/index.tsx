import { X } from 'lucide-react';

import type { QueuedPrompt } from '../../../../shared/agent-types';

interface QueuedPromptEntryProps {
  prompt: QueuedPrompt;
  onCancel: (promptId: string) => void;
}

export function QueuedPromptEntry({
  prompt,
  onCancel,
}: QueuedPromptEntryProps) {
  return (
    <div className="relative pl-6 bg-neutral-800/30">
      {/* Dot - hollow/outline to indicate "queued/pending" */}
      <div className="absolute -left-1 top-2.5 h-2 w-2 rounded-full border border-neutral-500 bg-transparent" />

      {/* Content */}
      <div className="py-1.5 pr-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            Queued
          </span>
          <p className="text-xs text-neutral-400 truncate mt-0.5">
            {prompt.content}
          </p>
        </div>

        {/* Cancel button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel(prompt.id);
          }}
          className="shrink-0 p-1 rounded hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Cancel queued prompt"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
