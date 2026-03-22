import { useNavigate } from '@tanstack/react-router';
import { Bot } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import {
  AGENT_BACKENDS,
  BackendSelector,
} from '@/features/agent/ui-backend-selector';
import { useCreateSkillWithAgent } from '@/hooks/use-managed-skills';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import type { AgentBackendType } from '@shared/agent-backend-types';

export function CreateWithAgentDialog({
  onClose,
  mode = 'create',
  sourceSkillPath,
  sourceSkillName,
}: {
  onClose: () => void;
  mode?: 'create' | 'improve';
  sourceSkillPath?: string;
  sourceSkillName?: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [agentBackend, setAgentBackend] =
    useState<AgentBackendType>('claude-code');

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
    if (!canSubmit) return;

    const jobId = addRunningJob({
      type: 'skill-creation',
      title:
        mode === 'improve'
          ? `Improving skill: ${sourceSkillName ?? 'unknown'}`
          : 'Creating skill with agent',
      details: {
        promptPreview: prompt.slice(0, 100),
      },
    });

    // Fire the shrink animation, then close
    void triggerAnimation();
    onClose();

    try {
      const task = await createMutation.mutateAsync({
        prompt,
        enabledBackends: [...AGENT_BACKENDS],
        mode,
        sourceSkillPath,
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
    prompt,
    mode,
    sourceSkillPath,
    agentBackend,
    addRunningJob,
    markJobSucceeded,
    markJobFailed,
    createMutation,
    navigate,
    onClose,
    sourceSkillName,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex w-[520px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_100px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prompt input */}
        <div className="flex shrink-0 items-start border-b border-neutral-700 px-4 py-3">
          <Bot className="mt-0.5 mr-2 h-5 w-5 shrink-0 text-purple-400" />
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={
              mode === 'improve'
                ? 'Describe what to improve…'
                : 'Describe the skill you want…'
            }
            className="h-24 w-full resize-none bg-transparent text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Footer with backend selector + submit */}
        <div className="flex min-h-[42px] shrink-0 items-center justify-between px-4 py-2">
          <BackendSelector
            value={agentBackend}
            onChange={setAgentBackend}
            shortcut="cmd+j"
            side="top"
          />

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'improve' ? 'Start Improving' : 'Start Creating'}
            <Kbd
              shortcut="cmd+enter"
              className="border-purple-400/40 bg-purple-500/30 text-purple-200"
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
