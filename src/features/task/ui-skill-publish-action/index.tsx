import { Check, Package } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  isSkillCreationStepMeta,
  type SkillCreationStepMeta,
  type TaskStep,
} from '@shared/types';
import { Button } from '@/common/ui/button';
import { useCompleteTask } from '@/hooks/use-tasks';
import { usePublishSkillFromWorkspace } from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';



export function SkillPublishAction({
  step,
  taskId,
  taskCompleted,
}: {
  step: TaskStep;
  taskId: string;
  taskCompleted: boolean;
}) {
  if (step.type !== 'skill-creation' || !isSkillCreationStepMeta(step.meta)) {
    return null;
  }

  return (
    <SkillPublishActionInner
      step={step}
      meta={step.meta}
      taskId={taskId}
      taskCompleted={taskCompleted}
    />
  );
}

function SkillPublishActionInner({
  step,
  meta,
  taskId,
  taskCompleted,
}: {
  step: TaskStep;
  meta: SkillCreationStepMeta;
  taskId: string;
  taskCompleted: boolean;
}) {
  const publishMutation = usePublishSkillFromWorkspace();
  const completeTask = useCompleteTask();
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
      let taskCompletedByPublish = false;

      try {
        if (!taskCompleted) {
          await completeTask.mutateAsync({ id: taskId });
          taskCompletedByPublish = true;
        }
      } catch (err) {
        addToast({
          type: 'error',
          message: `Skill "${names}" ${meta.mode === 'improve' ? 'updated' : 'published'}, but task completion failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
        return;
      }

      addToast({
        type: 'success',
        message:
          meta.mode === 'improve'
            ? `Skill "${names}" updated successfully${taskCompletedByPublish ? ' and task completed' : ''}`
            : `Skill "${names}" published successfully${taskCompletedByPublish ? ' and task completed' : ''}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish skill',
      });
    }
  }, [
    publishMutation,
    step.id,
    meta,
    taskCompleted,
    addToast,
    completeTask,
    taskId,
  ]);

  return (
    <div className="border-glass-border bg-bg-0 flex items-center gap-2 border-b px-4 py-3">
      {published ? (
        <div className="text-status-done flex items-center gap-2 text-sm">
          <Check className="h-4 w-4" />
          <span>Skill {meta.mode === 'improve' ? 'updated' : 'published'}</span>
        </div>
      ) : (
        <>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={
              !canPublish || publishMutation.isPending || completeTask.isPending
            }
            className="bg-acc text-ink-0 hover:bg-acc flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {meta.mode === 'improve' ? 'Publish Changes' : 'Publish Skill'}
          </Button>
          {step.status === 'completed' && (
            <span className="text-ink-3 text-xs">
              Review the agent&apos;s work above, then publish when ready.
            </span>
          )}
        </>
      )}
    </div>
  );
}
