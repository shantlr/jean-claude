import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';

import type { QueuedPrompt } from '@shared/agent-types';
import { Textarea } from '@/common/ui/textarea';


export function QueuedPromptEntry({
  prompt,
  onCancel,
  onUpdate,
}: {
  prompt: QueuedPrompt;
  onCancel: (promptId: string) => void;
  onUpdate: (promptId: string, content: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(prompt.content);

  const save = () => {
    const nextContent = draft.trim();
    if (!nextContent) return;
    onUpdate(prompt.id, nextContent);
    setIsEditing(false);
  };

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
          {isEditing ? (
            <Textarea
              size="xs"
              value={draft}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  save();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft(prompt.content);
                  setIsEditing(false);
                }
              }}
              className="mt-1 text-xs"
              autoFocus
            />
          ) : (
            <p className="text-ink-2 mt-0.5 truncate text-xs">
              {prompt.content}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isEditing ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                save();
              }}
              className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
              title="Save queued prompt"
            >
              <Check className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDraft(prompt.content);
                setIsEditing(true);
              }}
              className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
              title="Edit queued prompt"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel(prompt.id);
            }}
            className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
            title="Cancel queued prompt"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
