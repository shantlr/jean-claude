import { useQueryClient } from '@tanstack/react-query';
import { Check, Save } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toasts';
import {
  isFeatureMapStepMeta,
  type FeatureMapStepMeta,
  type TaskStep,
} from '@shared/types';

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
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="bg-acc text-ink-0 hover:bg-acc flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Feature Map
          </Button>
          {step.status === 'completed' && (
            <span className="text-ink-3 text-xs">
              Review the generated YAML, then save when ready.
            </span>
          )}
        </>
      )}
    </div>
  );
}
