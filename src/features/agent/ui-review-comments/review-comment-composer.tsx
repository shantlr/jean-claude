import clsx from 'clsx';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { REVIEW_PRESETS, type ReviewPresetId } from '@/stores/review-comments';

export function ReviewCommentComposer({
  lineStart,
  lineEnd,
  onSubmit,
  onCancel,
}: {
  lineStart: number;
  lineEnd?: number;
  onSubmit: (body: string, presets: ReviewPresetId[]) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<ReviewPresetId[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const togglePreset = useCallback((id: ReviewPresetId) => {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed && selectedPresets.length === 0) return;
    onSubmit(trimmed, selectedPresets);
  }, [body, selectedPresets, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  const isMultiLine = lineEnd !== undefined && lineEnd !== lineStart;
  const lineLabel = isMultiLine
    ? `lines ${lineStart}\u2013${lineEnd}`
    : `line ${lineStart}`;

  return (
    <div className="border-acc/50 border-l-2">
      <div className="bg-bg-1/90 px-3 py-2.5">
        {isMultiLine && (
          <div className="text-ink-3 mb-2 font-mono text-[10.5px]">
            commenting on {lineLabel}
          </div>
        )}

        {/* Preset chips */}
        <div className="mb-2 flex flex-wrap gap-1">
          {REVIEW_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePreset(p.id)}
              className={clsx(
                'rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors',
                selectedPresets.includes(p.id)
                  ? 'border-acc-line bg-acc-soft text-acc-ink'
                  : 'border-line bg-bg-1 text-ink-2 hover:bg-bg-2',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leave an instruction for this line..."
          rows={2}
          className="border-line bg-bg-0 text-ink-1 placeholder:text-ink-4 focus:border-acc-line w-full resize-y rounded border px-2.5 py-2 text-xs outline-none"
        />

        {/* Actions */}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={!body.trim() && selectedPresets.length === 0}
            className="bg-acc inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11.5px] font-medium text-white disabled:opacity-40"
          >
            Add comment{' '}
            <kbd className="rounded bg-white/20 px-1 py-px font-mono text-[9px]">
              {'\u2318\u21B5'}
            </kbd>
          </button>
          <button
            onClick={onCancel}
            className="border-line text-ink-2 hover:bg-bg-2 rounded border px-2.5 py-1 text-[11.5px]"
          >
            Cancel
          </button>
          <span className="text-ink-4 ml-auto text-[10.5px]">
            {"Won't be sent until you submit the review."}
          </span>
        </div>
      </div>
    </div>
  );
}
