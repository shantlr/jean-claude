import { useNavigate } from '@tanstack/react-router';
import { Bot } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';

import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import {
  AGENT_BACKENDS,
  BackendSelector,
} from '@/features/agent/ui-backend-selector';
import { useCreateSkillWithAgent } from '@/hooks/use-managed-skills';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useCreateSkillDraftStore } from '@/stores/create-skill-draft';

export function CreateWithAgentDialog({ onClose }: { onClose: () => void }) {
  const draft = useCreateSkillDraftStore((s) => s.draft);
  const updateDraft = useCreateSkillDraftStore((s) => s.update);
  const discardDraft = useCreateSkillDraftStore((s) => s.discard);

  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createMutation = useCreateSkillWithAgent();
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const navigate = useNavigate();

  const { triggerAnimation } = useShrinkToTarget({
    panelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  const mode = draft?.mode ?? 'create';
  const prompt = draft?.prompt ?? '';
  const agentBackend = draft?.agentBackend ?? 'claude-code';
  const canSubmit = prompt.trim().length > 0;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !draft) return;

    const jobId = addRunningJob({
      type: 'skill-creation',
      title:
        mode === 'improve'
          ? `Improving skill: ${draft.sourceSkillName ?? 'unknown'}`
          : 'Creating skill with agent',
      details: {
        promptPreview: prompt.slice(0, 100),
      },
    });

    // Fire the shrink animation, then close and discard draft
    void triggerAnimation();
    discardDraft();
    onClose();

    try {
      const task = await createMutation.mutateAsync({
        prompt,
        enabledBackends: [...AGENT_BACKENDS],
        mode,
        sourceSkillPath: draft.sourceSkillPath,
        agentBackend,
      });

      markJobSucceeded(jobId, {
        taskId: task.id,
        projectId: task.projectId,
      });

      // Navigate to the task
      navigate({
        to: '/all/$taskId',
        params: { taskId: task.id },
      });
    } catch (err) {
      markJobFailed(
        jobId,
        err instanceof Error ? err.message : 'Failed to create skill task',
      );
    }
  }, [
    canSubmit,
    draft,
    prompt,
    mode,
    agentBackend,
    addRunningJob,
    markJobSucceeded,
    markJobFailed,
    createMutation,
    navigate,
    onClose,
    discardDraft,
    triggerAnimation,
  ]);

  // Cmd+Enter to submit from textarea
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!draft) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="border-glass-border bg-bg-1 flex w-[520px] flex-col overflow-hidden rounded-lg border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_100px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prompt input */}
        <div className="border-glass-border flex shrink-0 items-start border-b px-4 py-3">
          <Bot className="text-acc-ink mt-0.5 mr-2 h-5 w-5 shrink-0" />
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => updateDraft({ prompt: e.target.value })}
            onKeyDown={handleTextareaKeyDown}
            placeholder={
              mode === 'improve'
                ? 'Describe what to improve…'
                : 'Describe the skill you want…'
            }
            className="text-ink-1 placeholder-ink-4 h-24 w-full resize-none bg-transparent text-sm focus:outline-none"
            autoFocus
          />
        </div>

        {/* Footer with backend selector + submit */}
        <div className="flex min-h-[42px] shrink-0 items-center justify-between px-4 py-2">
          <BackendSelector
            value={agentBackend}
            onChange={(v) => updateDraft({ agentBackend: v })}
            shortcut="cmd+j"
            side="top"
          />

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="text-ink-0 bg-acc hover:bg-acc flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'improve' ? 'Start Improving' : 'Start Creating'}
            <Kbd
              shortcut="cmd+enter"
              className="bg-acc/30 border-acc/40 text-acc-ink"
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
