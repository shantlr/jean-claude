import { ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  KeyboardBindingLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import type { ReviewComment } from '@/stores/review-comments';
import { synthesizeReviewPrompt } from '@/stores/review-comments';
import type { TaskStep } from '@shared/types';

export function ReviewSubmitOverlay(props: {
  comments: ReviewComment[];
  steps?: TaskStep[];
  activeStepId?: string | null;
  onSubmit: (prompt: string, targetStepId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <KeyboardBindingLayer exclusive>
      <ReviewSubmitOverlayContent {...props} />
    </KeyboardBindingLayer>
  );
}

function ReviewSubmitOverlayContent({
  comments,
  steps,
  activeStepId,
  onSubmit,
  onClose,
}: {
  comments: ReviewComment[];
  steps?: TaskStep[];
  activeStepId?: string | null;
  onSubmit: (prompt: string, targetStepId: string | null) => void;
  onClose: () => void;
}) {
  const [globalIntent, setGlobalIntent] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  // null means "New step"
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    activeStepId ?? null,
  );

  // Sync if activeStepId changes while overlay is open
  useEffect(() => {
    setSelectedStepId(activeStepId ?? null);
  }, [activeStepId]);

  const openComments = useMemo(
    () => comments.filter((c) => !c.resolved),
    [comments],
  );

  const synthesized = useMemo(
    () => synthesizeReviewPrompt(openComments, globalIntent),
    [openComments, globalIntent],
  );

  const handleSubmit = useCallback(() => {
    if (synthesized) {
      onSubmit(synthesized, selectedStepId);
    }
  }, [synthesized, selectedStepId, onSubmit]);

  // cmd+enter to submit, escape to close
  useRegisterKeyboardBindings('review-submit-overlay', {
    'cmd+enter': () => {
      if (openComments.length > 0 && synthesized) {
        handleSubmit();
        return true;
      }
      return false;
    },
    escape: () => {
      onClose();
      return true;
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submit review"
      className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'oklch(0.06 0.012 275 / 0.78)' }}
    >
      <div className="bg-bg-1 border-line flex max-h-[92%] w-[720px] flex-col overflow-hidden rounded-lg border shadow-2xl">
        {/* Header */}
        <div className="border-line-soft flex items-center gap-2.5 border-b px-4 py-3.5">
          <Send className="text-acc-ink h-3.5 w-3.5" />
          <div className="flex-1">
            <div className="text-ink-0 text-[13px] font-medium">
              Submit review
            </div>
            <div className="text-ink-3 text-[11.5px]">
              {openComments.length} comment
              {openComments.length !== 1 ? 's' : ''} {'\u2192'} next iteration
            </div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Global intent */}
        <div className="border-line-soft border-b px-4 py-3.5">
          <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium tracking-wider uppercase">
            Overall intent{' '}
            <span className="tracking-normal normal-case">(optional)</span>
          </div>
          <textarea
            value={globalIntent}
            onChange={(e) => setGlobalIntent(e.target.value)}
            placeholder="e.g. 'don't change behaviour, just clean up imports & ordering'"
            rows={2}
            className="border-line bg-bg-0 text-ink-1 placeholder:text-ink-4 focus:border-acc-line w-full resize-none rounded border px-2.5 py-2 text-xs outline-none"
          />
        </div>

        {/* Step selector */}
        {steps && steps.length > 0 && (
          <div className="border-line-soft border-b px-4 py-3.5">
            <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium tracking-wider uppercase">
              Send to step
            </div>
            <select
              value={selectedStepId ?? '__new__'}
              onChange={(e) =>
                setSelectedStepId(
                  e.target.value === '__new__' ? null : e.target.value,
                )
              }
              className="border-line bg-bg-0 text-ink-1 focus:border-acc-line w-full rounded border px-2.5 py-2 text-xs outline-none"
            >
              <option value="__new__">+ New step</option>
              {steps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.name}
                  {step.id === activeStepId ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Comment cards */}
        <div className="flex-1 overflow-y-auto px-4 py-2.5">
          <div className="text-ink-4 mb-2 text-[10.5px] font-medium tracking-wider uppercase">
            Inline comments ({openComments.length})
          </div>
          <div className="flex flex-col gap-2">
            {openComments.map((c, i) => {
              const lineLabel = c.anchor.lineEnd
                ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
                : `L${c.anchor.lineStart}`;
              const anchor = `${c.anchor.filePath}:${lineLabel}`;
              return (
                <div
                  key={c.id}
                  className="border-line-soft bg-bg-0 grid grid-cols-[24px_1fr] gap-2.5 rounded border px-2.5 py-2"
                >
                  <div className="bg-acc-soft text-acc-ink flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[10px] font-semibold">
                    {i + 1}
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className="text-acc-ink font-mono text-[10.5px]">
                        {anchor}
                      </span>
                      {c.presets.map((p) => (
                        <span
                          key={p}
                          className="bg-bg-2 text-ink-2 rounded-full px-1.5 font-mono text-[9.5px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="text-ink-1 text-xs leading-relaxed">
                      {c.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synthesized prompt preview (collapsible) */}
        <div className="border-line-soft bg-bg-0 border-t">
          <button
            onClick={() => setShowPromptPreview((s) => !s)}
            className="text-ink-2 flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11.5px]"
          >
            {showPromptPreview ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-medium">
              Preview the prompt sent to the agent
            </span>
            <span className="text-ink-4 ml-auto text-[10.5px]">
              {showPromptPreview
                ? 'read-only'
                : `${synthesized?.length ?? 0} chars`}
            </span>
          </button>
          {showPromptPreview && synthesized && (
            <div className="px-4 pb-3.5">
              <div className="border-line bg-bg-1 max-h-[200px] overflow-y-auto rounded border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {synthesized}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-line-soft bg-bg-1 flex items-center gap-2 border-t px-4 py-3">
          <span className="text-ink-3 text-[11px]">
            {selectedStepId
              ? `Prompt will be sent to "${steps?.find((s) => s.id === selectedStepId)?.name ?? 'step'}".`
              : 'A new step will be created from this review.'}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="border-line text-ink-2 hover:bg-bg-2 rounded border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={openComments.length === 0}
            className="bg-acc inline-flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Submit review
            <kbd className="ml-1 text-[10px] opacity-70">⌘↵</kbd>
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
