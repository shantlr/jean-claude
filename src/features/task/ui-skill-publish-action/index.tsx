import { Check, Package } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import { usePublishSkillFromWorkspace } from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import {
  type SkillCreationStepMeta,
  type TaskStep,
  isSkillCreationStepMeta,
} from '@shared/types';

export function SkillPublishAction({ step }: { step: TaskStep }) {
  if (step.type !== 'skill-creation' || !isSkillCreationStepMeta(step.meta)) {
    return null;
  }

  return <SkillPublishActionInner step={step} meta={step.meta} />;
}

function SkillPublishActionInner({
  step,
  meta,
}: {
  step: TaskStep;
  meta: SkillCreationStepMeta;
}) {
  const publishMutation = usePublishSkillFromWorkspace();
  const addToast = useToastStore((s) => s.addToast);
  const [localPublished, setLocalPublished] = useState(false);

  // Sync with meta.published from server or local optimistic state
  const published = meta.published || localPublished;
  const canPublish = step.status === 'completed' && !published;

  const handlePublish = useCallback(async () => {
    try {
      const skills = await publishMutation.mutateAsync({
        stepId: step.id,
        workspacePath: meta.workspacePath,
        enabledBackends: meta.enabledBackends,
        mode: meta.mode,
        sourceSkillPath: meta.sourceSkillPath,
      });

      setLocalPublished(true);

      const names = skills.map((s) => s.name).join(', ');
      addToast({
        type: 'success',
        message:
          meta.mode === 'improve'
            ? `Skill "${names}" updated successfully`
            : `Skill "${names}" published successfully`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish skill',
      });
    }
  }, [publishMutation, step.id, meta, addToast]);

  return (
    <div className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-900 px-4 py-3">
      {published ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Check className="h-4 w-4" />
          <span>Skill {meta.mode === 'improve' ? 'updated' : 'published'}</span>
        </div>
      ) : (
        <>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {meta.mode === 'improve' ? 'Publish Changes' : 'Publish Skill'}
          </Button>
          {step.status === 'completed' && (
            <span className="text-xs text-neutral-500">
              Review the agent&apos;s work above, then publish when ready.
            </span>
          )}
        </>
      )}
    </div>
  );
}
