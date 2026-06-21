import { useCallback, useState } from 'react';
import clsx from 'clsx';


import {
  COMMENT_ACCENT,
  InlineCommentComposer,
} from '@/features/common/ui-inline-comments';
import { REVIEW_PRESETS, type ReviewPresetId } from '@/stores/review-comments';
import type { PromptImagePart } from '@shared/agent-backend-types';



function PresetChips({
  selectedPresets,
  onToggle,
}: {
  selectedPresets: ReviewPresetId[];
  onToggle: (id: ReviewPresetId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {REVIEW_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => onToggle(p.id)}
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
  );
}

export function ReviewCommentComposer({
  lineStart,
  lineEnd,
  onSubmit,
  onCancel,
  initialBody,
  onBodyChange,
}: {
  lineStart: number;
  lineEnd?: number;
  onSubmit: (
    body: string,
    presets: ReviewPresetId[],
    images: PromptImagePart[],
  ) => void;
  onCancel: () => void;
  initialBody?: string;
  onBodyChange?: (body: string) => void;
}) {
  const [selectedPresets, setSelectedPresets] = useState<ReviewPresetId[]>([]);

  const togglePreset = useCallback((id: ReviewPresetId) => {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(
    (body: string, images: PromptImagePart[]) => {
      onSubmit(body, selectedPresets, images);
    },
    [onSubmit, selectedPresets],
  );

  return (
    <div
      style={{
        background: COMMENT_ACCENT.bgLight,
        borderTop: `1px solid ${COMMENT_ACCENT.borderStrong}`,
        borderBottom: `1px solid ${COMMENT_ACCENT.borderStrong}`,
      }}
    >
      <div className="px-3 py-2.5">
        <InlineCommentComposer
          lineStart={lineStart}
          lineEnd={lineEnd}
          onSubmit={handleSubmit}
          onCancel={onCancel}
          initialBody={initialBody}
          onBodyChange={onBodyChange}
          canSubmitEmpty={selectedPresets.length > 0}
          placeholder="Leave an instruction for this line..."
          renderBeforeTextarea={
            <PresetChips
              selectedPresets={selectedPresets}
              onToggle={togglePreset}
            />
          }
          renderAfterActions={
            <span className="text-ink-4 ml-auto text-[10.5px]">
              {"Won't be sent until you submit the review."}
            </span>
          }
        />
      </div>
    </div>
  );
}
