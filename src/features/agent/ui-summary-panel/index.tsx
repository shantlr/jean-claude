import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import type { TaskSummaryContent } from '@/lib/api';

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
      <div className="border-glass-border bg-bg-1/50 border-b px-4 py-3">
        <button
          onClick={onGenerate}
          disabled={!onGenerate}
          className="border-glass-border bg-glass-medium text-ink-1 hover:border-glass-border-strong hover:bg-bg-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="border-glass-border bg-bg-1/50 border-b px-4 py-3">
        <div className="text-ink-2 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Generating summary...
        </div>
      </div>
    );
  }

  // Summary content state
  return (
    <div className="border-glass-border bg-bg-1/50 border-b">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="hover:bg-glass-medium/30 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
        )}
        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <span className="text-ink-1 text-sm font-medium">Summary</span>
      </button>

      {/* Expandable content */}
      {isExpanded && summary && (
        <div className="space-y-4 px-4 pb-4">
          {/* What I Did section */}
          {summary.whatIDid && (
            <div>
              <h3 className="text-ink-1 mb-2 text-sm font-semibold">
                What I Did
              </h3>
              <div className="bg-bg-0/50 text-ink-1 rounded-md p-3 text-sm">
                <MarkdownContent content={summary.whatIDid} />
              </div>
            </div>
          )}

          {/* Key Decisions section */}
          {summary.keyDecisions && (
            <div>
              <h3 className="text-ink-1 mb-2 text-sm font-semibold">
                Key Decisions
              </h3>
              <div className="bg-bg-0/50 text-ink-1 rounded-md p-3 text-sm">
                <MarkdownContent content={summary.keyDecisions} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
