import { homedir } from 'os';

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AssistantMessage as OcAssistantMessage } from '@opencode-ai/sdk/v2';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AiUsageContext } from '@shared/ai-usage-types';
import type { ThinkingEffort } from '@shared/types';

import { dbg } from '../lib/debug';

import { getOrCreateServer } from './agent-backends/opencode/opencode-backend';
import { aiUsageTrackingService } from './ai-usage-tracking-service';
import { calculateTheoreticalOpenCodeCost } from './backend-models-service';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin abstraction for simple text generation across agent backends.
 * No tools, no session persistence — just prompt in, structured output out.
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  throwOnError = false,
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
  timeoutMs?: number;
  throwOnError?: boolean;
  usageContext?: AiUsageContext;
}): Promise<unknown | null> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    switch (backend) {
      case 'claude-code':
        return await generateWithClaudeCode({
          model,
          prompt,
          skillName,
          thinkingEffort,
          outputSchema,
          cwd,
          allowedTools,
          abortController,
          usageContext,
        });

      case 'opencode':
        return await generateWithOpenCode({
          model,
          prompt,
          skillName,
          thinkingEffort,
          outputSchema,
          cwd,
          abortController,
          usageContext,
        });

      case 'codex':
        dbg.agent('Codex text generation is not implemented yet');
        return null;

      default: {
        const _exhaustive: never = backend;
        dbg.agent('Unknown backend: %s', _exhaustive);
        return null;
      }
    }
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

async function generateWithClaudeCode({
  model,
  prompt,
  skillName,
  thinkingEffort,
  outputSchema,
  cwd,
  allowedTools,
  abortController,
  usageContext,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  outputSchema?: Record<string, unknown>;
  cwd?: string;
  allowedTools?: string[];
  abortController: AbortController;
  usageContext?: AiUsageContext;
}): Promise<unknown | null> {
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;

  const generator = query({
    prompt: effectivePrompt,
    options: {
      allowedTools: allowedTools ?? [],
      model: model !== 'default' ? model : undefined,
      abortController,
      ...(thinkingEffort === 'low' ||
      thinkingEffort === 'medium' ||
      thinkingEffort === 'high' ||
      thinkingEffort === 'max'
        ? { effort: thinkingEffort }
        : {}),
      ...(cwd ? { cwd } : {}),
      ...(outputSchema && {
        outputFormat: {
          type: 'json_schema' as const,
          schema: outputSchema,
        },
      }),
      persistSession: false,
    },
  });

  for await (const message of generator) {
    if (typeof message !== 'object' || message === null || !('type' in message))
      continue;
    const msg = message as {
      type: string;
      structured_output?: unknown;
      result?: string;
      modelUsage?: Record<string, unknown>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };

    if (msg.type === 'result') {
      if (usageContext) {
        const actualModel = msg.modelUsage
          ? (Object.keys(msg.modelUsage)[0] ?? model)
          : model;
        dbg.agent(
          'Recording one-off Claude usage feature=%s project=%s task=%s hasUsage=%s',
          usageContext.feature,
          usageContext.projectId ?? '(none)',
          usageContext.taskId ?? '(none)',
          !!msg.usage,
        );
        aiUsageTrackingService.recordUsageSafe({
          context: usageContext,
          backend: 'claude-code',
          model: actualModel,
          usage: {
            inputTokens: msg.usage?.input_tokens,
            outputTokens: msg.usage?.output_tokens,
            cacheReadTokens: msg.usage?.cache_read_input_tokens,
            cacheCreationTokens: msg.usage?.cache_creation_input_tokens,
          },
          allowEmptyUsage: true,
        });
      }
      if (outputSchema && msg.structured_output) {
        return msg.structured_output;
      }
      return msg.result ?? null;
    }
  }

  return null;
}

async function generateWithOpenCode({
  model,
  prompt,
  skillName,
  thinkingEffort,
  outputSchema,
  cwd,
  abortController,
  usageContext,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  outputSchema?: Record<string, unknown>;
  cwd?: string;
  abortController: AbortController;
  usageContext?: AiUsageContext;
}): Promise<unknown | null> {
  const { client } = await getOrCreateServer();
  const parsedModel = parseOpenCodeModel(model);

  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;
  const promptWithStructuredFallback = outputSchema
    ? `${effectivePrompt}\n\nRespond with ONLY a valid JSON object matching this schema (no markdown, no code fences):\n${JSON.stringify(outputSchema, null, 2)}`
    : effectivePrompt;

  // Create a temporary session for this one-off generation
  const directory = cwd ?? homedir();
  const session = await client.session.create({ directory });
  const sessionId = session.data?.id;

  if (!sessionId) {
    throw new Error('OpenCode session.create() did not return a session ID');
  }

  // Abort handling: abort the session on signal
  const onAbort = () => {
    client.session.abort({ sessionID: sessionId, directory }).catch(() => {});
  };
  abortController.signal.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await client.session.prompt({
      sessionID: sessionId,
      directory,
      parts: [{ type: 'text', text: promptWithStructuredFallback }],
      ...(outputSchema && {
        format: {
          type: 'json_schema' as const,
          schema: outputSchema,
          retryCount: 1,
        },
      }),
      ...(thinkingEffort && thinkingEffort !== 'default'
        ? { variant: thinkingEffort }
        : {}),
      ...(parsedModel ? { model: parsedModel } : {}),
    });

    const info = response.data?.info as OcAssistantMessage | undefined;
    if (usageContext) {
      const actualModel =
        info?.providerID && info.modelID
          ? `${info.providerID}/${info.modelID}`
          : model;
      dbg.agent(
        'Recording one-off OpenCode usage feature=%s project=%s task=%s hasInfo=%s hasTokens=%s session=%s message=%s',
        usageContext.feature,
        usageContext.projectId ?? '(none)',
        usageContext.taskId ?? '(none)',
        !!info,
        !!info?.tokens,
        sessionId,
        info?.id ?? '(none)',
      );
      const apiCostUsd =
        info?.tokens && info.cost === 0
          ? calculateTheoreticalOpenCodeCost({
              providerID: info.providerID,
              modelID: info.modelID,
              inputTokens: info.tokens.input,
              outputTokens: info.tokens.output,
              cacheReadTokens: info.tokens.cache.read,
              cacheCreationTokens: info.tokens.cache.write,
            })
          : undefined;
      aiUsageTrackingService.recordUsageSafe({
        context: usageContext,
        backend: 'opencode',
        model: actualModel,
        usage: {
          inputTokens: info?.tokens?.input,
          outputTokens: info?.tokens?.output,
          cacheReadTokens: info?.tokens?.cache.read,
          cacheCreationTokens: info?.tokens?.cache.write,
        },
        cost: {
          costUsd: info?.cost,
          apiCostUsd,
        },
        allowEmptyUsage: true,
        sourceId: info?.id
          ? `opencode-generation:${sessionId}:${info.id}`
          : null,
      });
    }

    return extractOpenCodeResponseOutput({
      response,
      outputSchema,
      sessionId,
      model,
      skillName,
    });
  } catch (error) {
    dbg.agent(
      'OpenCode generation failed (session=%s model=%s resolvedModel=%O skill=%s structured=%s): %O',
      sessionId,
      model,
      parsedModel ?? null,
      skillName ?? '(none)',
      outputSchema ? 'yes' : 'no',
      error,
    );
    throw error;
  } finally {
    abortController.signal.removeEventListener('abort', onAbort);

    // Clean up the temporary session (independent of parent abort)
    client.session
      .delete({ sessionID: sessionId, directory })
      .catch((error) => {
        dbg.agent(
          'Failed to delete temporary generation session %s: %O',
          sessionId,
          error,
        );
      });
  }
}

function extractOpenCodeResponseOutput({
  response,
  outputSchema,
  sessionId,
  model,
  skillName,
}: {
  response: {
    data?: {
      info?: { structured?: unknown };
      parts?: Array<{ type?: string; text?: string }>;
    };
  };
  outputSchema?: Record<string, unknown>;
  sessionId: string;
  model: string;
  skillName?: string | null;
}): unknown | null {
  if (outputSchema && response.data?.info?.structured !== undefined) {
    return response.data.info.structured;
  }

  const textParts = (response.data?.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!textParts) {
    dbg.agent(
      'OpenCode generation returned no usable output (session=%s model=%s skill=%s structured=%s parts=%d)',
      sessionId,
      model,
      skillName ?? '(none)',
      outputSchema ? 'yes' : 'no',
      response.data?.parts?.length ?? 0,
    );
    return null;
  }

  if (outputSchema) {
    dbg.agent(
      'OpenCode structured output missing; falling back to JSON text parsing (session=%s model=%s skill=%s preview=%s)',
      sessionId,
      model,
      skillName ?? '(none)',
      summarizeForDebug(textParts),
    );
    return parseJsonResponse(textParts);
  }

  return textParts;
}

function summarizeForDebug(text: string, maxLength = 240): string {
  return text.replace(/\s+/g, ' ').slice(0, maxLength);
}

/**
 * Parse a model string into the OpenCode SDK's { providerID, modelID } format.
 * Returns undefined if the model is unset, "default", or not provider-qualified.
 */
function parseOpenCodeModel(
  model?: string,
): { providerID: string; modelID: string } | undefined {
  if (!model || model === 'default') return undefined;
  if (model.includes('/')) {
    const [providerID, ...rest] = model.split('/');
    return { providerID, modelID: rest.join('/') };
  }
  return undefined;
}

/** Parse JSON from LLM text output, stripping markdown code fences if present. */
function parseJsonResponse(text: string): unknown | null {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    dbg.agent(
      'Failed to parse JSON from response (length=%d preview=%s): %O',
      jsonStr.length,
      summarizeForDebug(jsonStr),
      error,
    );
    return null;
  }
}
