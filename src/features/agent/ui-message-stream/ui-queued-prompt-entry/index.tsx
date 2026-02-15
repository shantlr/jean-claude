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
    <div className="relative bg-neutral-800/30 pl-6">
      {/* Dot - hollow/outline to indicate "queued/pending" */}
      <div className="absolute top-2.5 -left-1 h-2 w-2 rounded-full border border-neutral-500 bg-transparent" />

      {/* Content */}
      <div className="flex items-start justify-between gap-2 py-1.5 pr-3">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
            Queued
          </span>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {prompt.content}
          </p>
        </div>

        {/* Cancel button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel(prompt.id);
          }}
          className="shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
          title="Cancel queued prompt"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
