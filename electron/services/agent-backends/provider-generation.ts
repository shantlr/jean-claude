import { homedir } from 'os';

import type {
  AgentBackendCapabilities,
  Capability,
  StructuredGenerationCapability,
  TextGenerationCapability,
} from '@shared/agent-backend-provider-types';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AssistantMessage as OcAssistantMessage } from '@opencode-ai/sdk/v2';

import { dbg } from '../../lib/debug';

function supported<Implementation>(
  implementation: Implementation,
): Capability<Implementation> {
  return { supported: true, implementation };
}

function unsupported<Implementation>(
  reason: string,
): Capability<Implementation> {
  return { supported: false, reason };
}

export const claudeCodeTextGenerationCapability: TextGenerationCapability = {
  async generate(input) {
    const output = await generateWithClaudeCode(input);
    return { output };
  },
};

export const claudeCodeStructuredGenerationCapability: StructuredGenerationCapability =
  {
    mode: 'native-schema',
    async generate(input) {
      const output = await generateWithClaudeCode(input);
      return { output };
    },
  };

export const openCodeTextGenerationCapability: TextGenerationCapability = {
  async generate(input) {
    const output = await generateWithOpenCode(input);
    return { output };
  },
};

export const openCodeStructuredGenerationCapability: StructuredGenerationCapability =
  {
    mode: 'native-schema',
    async generate(input) {
      const output = await generateWithOpenCode(input);
      return { output };
    },
  };

export function createGenerationCapabilities(
  backend: AgentBackendType,
): AgentBackendCapabilities['generation'] {
  if (backend === 'claude-code') {
    return {
      text: supported(claudeCodeTextGenerationCapability),
      structured: supported(claudeCodeStructuredGenerationCapability),
    };
  }

  if (backend === 'opencode') {
    return {
      text: supported(openCodeTextGenerationCapability),
      structured: supported(openCodeStructuredGenerationCapability),
    };
  }

  return {
    text: unsupported<TextGenerationCapability>(
      'text generation is not implemented for this backend yet',
    ),
    structured: unsupported<StructuredGenerationCapability>(
      'structured generation is not implemented for this backend yet',
    ),
  };
}

async function generateWithClaudeCode({
  model,
  prompt,
  skillName,
  thinkingEffort,
  outputSchema,
  cwd,
  allowedTools,
  allowedToolPatterns,
  abortController,
  usageContext,
}: Parameters<TextGenerationCapability['generate']>[0] & {
  outputSchema?: Record<string, unknown>;
}): Promise<unknown | null> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;

  const generator = query({
    prompt: effectivePrompt,
    options: {
      allowedTools: buildClaudeCodeAllowedTools(
        allowedTools,
        allowedToolPatterns,
      ),
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
        const { aiUsageTrackingService } = await import(
          '../ai-usage-tracking-service'
        );
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
      if (outputSchema && msg.structured_output !== undefined) {
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
  allowedTools,
  allowedToolPatterns,
  abortController,
  usageContext,
}: Parameters<TextGenerationCapability['generate']>[0] & {
  outputSchema?: Record<string, unknown>;
}): Promise<unknown | null> {
  const { getOrCreateServer } = await import(
    './opencode/opencode-backend'
  );
  const { client } = await getOrCreateServer();
  const parsedModel = parseOpenCodeModel(model);

  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;
  const promptWithStructuredFallback = outputSchema
    ? `${effectivePrompt}\n\nRespond with ONLY a valid JSON object matching this schema (no markdown, no code fences):\n${JSON.stringify(outputSchema, null, 2)}`
    : effectivePrompt;

  const directory = cwd ?? homedir();
  const permission = buildOpenCodePermissions(
    allowedTools,
    allowedToolPatterns,
    skillName,
  );
  const session = await client.session.create({
    directory,
    ...(permission.length > 0 ? { body: { permission } } : {}),
  });
  const sessionId = session.data?.id;

  if (!sessionId) {
    throw new Error('OpenCode session.create() did not return a session ID');
  }

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
      const { aiUsageTrackingService } = await import(
        '../ai-usage-tracking-service'
      );
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
          ? (
              await import('../backend-models-service')
            ).calculateTheoreticalOpenCodeCost({
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

function buildOpenCodePermissions(
  allowedTools?: string[],
  allowedToolPatterns?: Record<string, string[]>,
  skillName?: string | null,
): Array<{ permission: string; pattern: string; action: 'allow' | 'deny' }> {
  if (!allowedTools) return [];

  const toolNameMap: Record<string, string> = {
    Read: 'read',
    Edit: 'edit',
    Write: 'write',
    Glob: 'glob',
    Grep: 'grep',
    WebFetch: 'webfetch',
    WebSearch: 'websearch',
    Task: 'task',
    TodoWrite: 'todowrite',
    Skill: 'skill',
  };

  const permissions: Array<{
    permission: string;
    pattern: string;
    action: 'allow' | 'deny';
  }> = [{ permission: '*', pattern: '*', action: 'deny' }];

  for (const tool of allowedTools) {
    const permission = toolNameMap[tool] ?? tool.toLowerCase();
    const patterns = allowedToolPatterns?.[tool] ?? ['*'];
    for (const pattern of patterns) {
      if (
        permissions.some(
          (entry) =>
            entry.permission === permission &&
            entry.pattern === pattern &&
            entry.action === 'allow',
        )
      ) {
        continue;
      }
      permissions.push({ permission, pattern, action: 'allow' });
    }
  }

  if (skillName) {
    permissions.push({ permission: 'skill', pattern: skillName, action: 'allow' });
  }

  return permissions;
}

function buildClaudeCodeAllowedTools(
  allowedTools?: string[],
  allowedToolPatterns?: Record<string, string[]>,
): string[] {
  if (!allowedTools) return [];

  return allowedTools.flatMap((tool) => {
    const patterns = allowedToolPatterns?.[tool];
    if (!patterns?.length) return [tool];
    return patterns.map((pattern) => `${tool}(${pattern})`);
  });
}

function parseJsonResponse(text: string): unknown | null {
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
