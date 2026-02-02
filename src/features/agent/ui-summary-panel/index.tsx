import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { TaskSummaryContent } from '@/lib/api';
import { formatKeyForDisplay } from '@/lib/keyboard-bindings';

import { MarkdownContent } from '../ui-markdown-content';

/**
 * Displays the AI-generated summary for a task with "What I Did" and "Key Decisions" sections.
 * Supports three states: no summary (generate button), loading, and summary content.
 */
export function SummaryPanel({
  summary,
  isLoading = false,
  onGenerate,
}: {
  summary: TaskSummaryContent | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(summary !== null);

  // No summary state - show generate button
  if (!summary && !isLoading) {
    return (
      <div className="border-b border-neutral-700 bg-neutral-800/50 px-4 py-3">
        <button
          onClick={onGenerate}
          disabled={!onGenerate}
          className="flex items-center gap-2 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
          title={`Generate Summary (${formatKeyForDisplay('cmd+shift+s')})`}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Generate Summary
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="border-b border-neutral-700 bg-neutral-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Generating summary...
        </div>
      </div>
    );
  }

  // Summary content state
  return (
    <div className="border-b border-neutral-700 bg-neutral-800/50">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-700/30"
      >
        {isExpanded ? (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-neutral-500"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-neutral-500"
            aria-hidden
          />
        )}
        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <span className="text-sm font-medium text-neutral-200">Summary</span>
      </button>

      {/* Expandable content */}
      {isExpanded && summary && (
        <div className="space-y-4 px-4 pb-4">
          {/* What I Did section */}
          {summary.whatIDid && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                What I Did
              </h3>
              <div className="rounded-md bg-neutral-900/50 p-3 text-sm text-neutral-300">
                <MarkdownContent content={summary.whatIDid} />
              </div>
            </div>
          )}

          {/* Key Decisions section */}
          {summary.keyDecisions && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                Key Decisions
              </h3>
              <div className="rounded-md bg-neutral-900/50 p-3 text-sm text-neutral-300">
                <MarkdownContent content={summary.keyDecisions} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
