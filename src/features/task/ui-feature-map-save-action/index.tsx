import { Check, Eye, Save } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';


import {
  type FeatureMapStepMeta,
  isFeatureMapStepMeta,
  type TaskStep,
} from '@shared/types';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { FileDiffContent } from '@/features/common/ui-file-diff';
import { Modal } from '@/common/ui/modal';
import { useToastStore } from '@/stores/toasts';

type FeatureMapDraftDiff = Awaited<
  ReturnType<typeof api.projects.getFeatureMapDraftDiff>
>;

export function FeatureMapSaveAction({ step }: { step: TaskStep }) {
  if (step.type !== 'feature-map' || !isFeatureMapStepMeta(step.meta)) {
    return null;
  }

  return <FeatureMapSaveActionInner step={step} meta={step.meta} />;
}

function FeatureMapSaveActionInner({
  step,
  meta,
}: {
  step: TaskStep;
  meta: FeatureMapStepMeta;
}) {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [draftDiff, setDraftDiff] = useState<FeatureMapDraftDiff | null>(null);
  const [localSaved, setLocalSaved] = useState(false);
  const saved = meta.saved || localSaved;
  const canSave = step.status === 'completed' && !saved;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await api.projects.saveFeatureMapFromTask(step.id);
      setLocalSaved(true);
      await queryClient.invalidateQueries({
        queryKey: ['project-feature-map', meta.projectId],
      });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks', step.taskId] });
      await queryClient.invalidateQueries({
        queryKey: ['worktree-diff', step.taskId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['worktree-file-content', step.taskId],
      });
      addToast({ type: 'success', message: 'Feature map saved.' });
    } catch (err) {
      addToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to save feature map.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [addToast, meta.projectId, queryClient, step.id, step.taskId]);

  const handleReviewDiff = useCallback(async () => {
    setIsDiffOpen(true);
    setIsLoadingDiff(true);
    try {
      setDraftDiff(await api.projects.getFeatureMapDraftDiff(step.id));
    } catch (err) {
      addToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to load feature map diff.',
      });
    } finally {
      setIsLoadingDiff(false);
    }
  }, [addToast, step.id]);

  return (
    <div className="border-glass-border bg-bg-0 flex items-center gap-2 border-b px-4 py-3">
      {saved ? (
        <div className="text-status-done flex items-center gap-2 text-sm">
          <Check className="h-4 w-4" />
          <span>Feature map saved</span>
        </div>
      ) : (
        <>
          <Button
            type="button"
            onClick={handleReviewDiff}
            disabled={step.status !== 'completed' || isLoadingDiff}
            variant="secondary"
            icon={<Eye />}
          >
            Review diff
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="bg-acc text-ink-0 hover:bg-acc flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Feature Map
          </Button>
          {step.status === 'completed' && (
            <span className="text-ink-3 text-xs">
              Review changes, then save when ready.
            </span>
          )}
          <Modal
            isOpen={isDiffOpen}
            onClose={() => setIsDiffOpen(false)}
            title="Feature map diff"
            size="xl"
            contentClassName="flex min-h-0 flex-col overflow-hidden p-0"
          >
            {draftDiff ? (
              <div className="h-[72vh] min-h-0 overflow-hidden">
                <FileDiffContent
                  file={{
                    path: draftDiff.path,
                    status: draftDiff.status,
                  }}
                  oldContent={draftDiff.oldContent}
                  newContent={draftDiff.newContent}
                  isLoading={isLoadingDiff}
                />
              </div>
            ) : (
              <div className="text-ink-2 p-4 text-sm">
                {isLoadingDiff ? 'Loading diff...' : 'No diff loaded.'}
              </div>
            )}
            <div className="border-glass-border flex justify-end gap-2 border-t p-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsDiffOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!canSave || isSaving}
                icon={<Save />}
              >
                Save Feature Map
              </Button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
