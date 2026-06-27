import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AiUsageContext } from '@shared/ai-usage-types';
import { requireCapability } from '@shared/agent-backend-provider-types';
import type { ThinkingEffort } from '@shared/types';

import { dbg } from '../lib/debug';

import { getAgentBackendProvider } from './agent-backends/providers';
import { rateLimitSwapService } from './rate-limit-swap-service';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin abstraction for simple text generation across agent backends.
 * No tools, no session persistence - just prompt in, structured output out.
 */
export async function generateText({
  backend,
  model,
  prompt,
  skillName,
  thinkingEffort,
  outputSchema,
  cwd,
  allowedTools,
  allowedToolPatterns,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  throwOnError = false,
  allowRateLimitSwap = true,
  usageContext,
}: {
  backend: AgentBackendType;
  model: string;
  prompt: string;
  skillName?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  outputSchema?: Record<string, unknown>;
  cwd?: string;
  allowedTools?: string[];
  allowedToolPatterns?: Record<string, string[]>;
  timeoutMs?: number;
  throwOnError?: boolean;
  allowRateLimitSwap?: boolean;
  usageContext?: AiUsageContext;
}): Promise<unknown | null> {
  const swapResult = allowRateLimitSwap
    ? await rateLimitSwapService.resolveBackend(backend)
    : { backend, swapped: false, model: undefined, thinkingEffort: undefined };
  const resolvedBackend = swapResult.backend;
  const backendChanged = resolvedBackend !== backend;
  const resolvedModel =
    swapResult.model ?? (backendChanged ? 'default' : model);
  const resolvedThinkingEffort =
    swapResult.thinkingEffort ?? (backendChanged ? undefined : thinkingEffort);
  if (swapResult.swapped) {
    console.log(
      `[rate-limit-swap] AI gen${skillName ? ` (${skillName})` : ''}: swapped ${backend} -> ${resolvedBackend} (model: ${resolvedModel})`,
    );
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const provider = getAgentBackendProvider(resolvedBackend);

    if (outputSchema) {
      const capability = requireCapability(
        provider.id,
        'generation.structured',
        provider.capabilities.generation.structured,
      );
      const result = await capability.generate({
        model: resolvedModel,
        prompt,
        skillName,
        thinkingEffort: resolvedThinkingEffort,
        outputSchema,
        cwd,
        allowedTools,
        allowedToolPatterns,
        abortController,
        usageContext,
      });
      return result.output;
    }

    const capability = requireCapability(
      provider.id,
      'generation.text',
      provider.capabilities.generation.text,
    );
    const result = await capability.generate({
      model: resolvedModel,
      prompt,
      skillName,
      thinkingEffort: resolvedThinkingEffort,
      cwd,
      allowedTools,
      allowedToolPatterns,
      abortController,
      usageContext,
    });
    return result.output;
  } catch (error) {
    if (abortController.signal.aborted) {
      dbg.agent(
        'generateText timed out after %dms (backend=%s model=%s skill=%s structured=%s)',
        timeoutMs,
        backend,
        model,
        skillName ?? '(none)',
        outputSchema ? 'yes' : 'no',
      );
      if (throwOnError) {
        throw new Error(
          `AI generation timed out after ${timeoutMs}ms (backend=${backend}, model=${model})`,
        );
      }
      return null;
    }
    dbg.agent(
      'generateText failed (backend=%s model=%s skill=%s structured=%s): %O',
      backend,
      model,
      skillName ?? '(none)',
      outputSchema ? 'yes' : 'no',
      error,
    );
    if (throwOnError) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AI generation failed: ${message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
