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

const CODEX_ABORTED = Symbol('codex-aborted');
const CODEX_FAILED = Symbol('codex-failed');

type CodexGenerationOutcome =
  | { output: unknown | null; usagePromise?: Promise<void> }
  | typeof CODEX_ABORTED
  | typeof CODEX_FAILED;

export const codexTextGenerationCapability: TextGenerationCapability = {
  async generate(input) {
    const output = await generateWithCodex(input);
    return { output };
  },
};

export const codexStructuredGenerationCapability: StructuredGenerationCapability =
  {
    mode: 'prompt-json',
    async generate(input) {
      const output = await generateWithCodex(input);
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
    text: supported(codexTextGenerationCapability),
    structured: supported(codexStructuredGenerationCapability),
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

async function generateWithCodex({
  model,
  prompt,
  skillName,
  thinkingEffort,
  outputSchema,
  cwd,
  abortController,
  usageContext,
}: Parameters<TextGenerationCapability['generate']>[0] & {
  outputSchema?: Record<string, unknown>;
}): Promise<unknown | null> {
  const { getOrCreateCodexAppServer } = await import(
    './codex/codex-app-server'
  );
  const { client } = await abortableCodexAwait(
    getOrCreateCodexAppServer(),
    abortController.signal,
  );
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;
  const promptWithStructuredFallback = outputSchema
    ? `${effectivePrompt}\n\nRespond with ONLY a valid JSON object matching this schema (no markdown, no code fences):\n${JSON.stringify(outputSchema, null, 2)}`
    : effectivePrompt;

  const threadResult = await abortableCodexAwait(
    client.request('thread/start', {
      cwd: cwd ?? homedir(),
      serviceName: 'jean_claude',
      ...(thinkingEffort && thinkingEffort !== 'default'
        ? { config: { model_reasoning_effort: thinkingEffort } }
        : {}),
    }),
    abortController.signal,
  );
  const threadId = idFromCodexResult(threadResult, 'thread');
  if (!threadId) {
    throw new Error('Codex thread/start did not return a thread id');
  }

  let turnId: string | null = null;
  let abortGeneration: (() => void) | undefined;
  const onAbort = () => {
    if (turnId) {
      client.request('turn/interrupt', { threadId, turnId }).catch(() => {});
    }
    abortGeneration?.();
  };
  abortController.signal.addEventListener('abort', onAbort, { once: true });

  try {
    let text = '';
    let resolveResult:
      | ((result: CodexGenerationOutcome) => void)
      | undefined;
    const resultPromise = new Promise<CodexGenerationOutcome>((resolve) => {
      resolveResult = resolve;
    });
    const unsubscribe = client.onNotification((notification) => {
      if (!codexNotificationMatches(notification, threadId, turnId)) return;

      if (notification.method === 'item/agentMessage/delta') {
        const params = record(notification.params);
        text += typeof params?.delta === 'string' ? params.delta : '';
        return;
      }

      if (notification.method === 'item/completed') {
        text = codexAssistantTextFromCompletedItem(notification) ?? text;
        return;
      }

      if (notification.method === 'turn/completed') {
        const params = record(notification.params);
        const usagePromise = usageContext
          ? recordCodexUsage({ params, usageContext, model }).catch((error) => {
              dbg.agent('Failed to record one-off Codex usage: %O', error);
            })
          : undefined;
        if (codexTurnCompletedIsError(params)) {
          resolveResult?.(CODEX_FAILED);
          return;
        }
        resolveResult?.({
          output: outputSchema ? parseJsonResponse(text) : text.trim() || null,
          usagePromise,
        });
        return;
      }

      if (notification.method === 'thread/status/changed') {
        const params = record(notification.params);
        if (codexThreadStatusIsError(params)) {
          resolveResult?.(CODEX_FAILED);
          return;
        }
        if (turnId !== null && codexThreadStatusIsIdle(params)) {
          resolveResult?.({
            output: outputSchema ? parseJsonResponse(text) : text.trim() || null,
          });
        }
      }
    });
    const unsubscribeError = client.onError((error) => {
      dbg.agent('Codex generation client error: %O', error);
      resolveResult?.(CODEX_FAILED);
    });
    abortGeneration = () => resolveResult?.(CODEX_ABORTED);

    try {
      const turnStartPromise = client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: promptWithStructuredFallback }],
        model: model === 'default' ? undefined : model,
      });
      const turnResult = await abortableCodexAwait(
        turnStartPromise,
        abortController.signal,
      ).catch((error: unknown) => {
        if (abortController.signal.aborted) {
          interruptCodexTurnWhenStarted({
            turnStartPromise,
            client,
            threadId,
          });
        }
        throw error;
      });
      turnId = idFromCodexResult(turnResult, 'turn');
      if (!turnId) {
        throw new Error('Codex turn/start did not return a turn id');
      }
      if (abortController.signal.aborted) {
        onAbort();
        throw new Error('Codex generation aborted');
      }

      const result = await resultPromise;
      if (result === CODEX_ABORTED || abortController.signal.aborted) {
        throw new Error('Codex generation aborted');
      }
      if (result === CODEX_FAILED) {
        throw new Error('Codex generation failed');
      }
      await result.usagePromise;
      return result.output;
    } finally {
      abortGeneration = undefined;
      unsubscribe();
      unsubscribeError();
    }
  } finally {
    abortController.signal.removeEventListener('abort', onAbort);
  }
}

async function recordCodexUsage({
  params,
  usageContext,
  model,
}: {
  params: Record<string, unknown> | undefined;
  usageContext: NonNullable<
    Parameters<TextGenerationCapability['generate']>[0]['usageContext']
  >;
  model: string;
}) {
  const { aiUsageTrackingService } = await import(
    '../ai-usage-tracking-service'
  );
  const usage = record(params?.usage);
  aiUsageTrackingService.recordUsageSafe({
    context: usageContext,
    backend: 'codex',
    model: typeof params?.model === 'string' ? params.model : model,
    usage: {
      inputTokens:
        num(usage?.input_tokens) ??
        num(usage?.inputTokens) ??
        num(params?.input_tokens) ??
        num(params?.inputTokens),
      outputTokens:
        num(usage?.output_tokens) ??
        num(usage?.outputTokens) ??
        num(params?.output_tokens) ??
        num(params?.outputTokens),
      cacheReadTokens:
        num(usage?.cache_read_input_tokens) ??
        num(usage?.cacheReadTokens) ??
        num(params?.cache_read_input_tokens) ??
        num(params?.cacheReadTokens),
      cacheCreationTokens:
        num(usage?.cache_creation_input_tokens) ??
        num(usage?.cacheCreationTokens) ??
        num(params?.cache_creation_input_tokens) ??
        num(params?.cacheCreationTokens),
    },
    allowEmptyUsage: true,
  });
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

function idFromCodexResult(
  result: unknown,
  key: 'thread' | 'turn',
): string | null {
  const obj = record(result);
  const nested = record(obj?.[key]);
  return (
    str(nested?.id) ??
    str(obj?.[`${key}Id`]) ??
    str(obj?.[`${key}_id`]) ??
    str(obj?.id) ??
    null
  );
}

function abortableCodexAwait<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(new Error('Codex generation aborted'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      promise.catch(() => {});
      reject(new Error('Codex generation aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function codexNotificationMatches(
  notification: { method: string; params?: unknown },
  threadId: string,
  turnId: string | null,
): boolean {
  const notificationThreadId = threadIdFromCodexNotification(notification);
  const notificationTurnId = turnIdFromCodexNotification(notification);
  let hasScope = false;

  if (notificationThreadId !== null) {
    if (notificationThreadId !== threadId) return false;
    hasScope = true;
  }

  if (notificationTurnId !== null) {
    if (turnId === null && notificationThreadId === null) return false;
    if (turnId !== null && notificationTurnId !== turnId) return false;
    hasScope = true;
  }

  return (
    hasScope || !codexNotificationRequiresSessionScope(notification.method)
  );
}

function codexAssistantTextFromCompletedItem(notification: {
  params?: unknown;
}): string | undefined {
  const params = record(notification.params);
  const item = record(params?.item);
  if (!item) return undefined;

  const type = str(item.type);
  const role = str(item.role);
  if (type !== 'agentMessage' && role !== 'assistant' && role !== 'agent') {
    return undefined;
  }

  return (
    str(item.text) ??
    str(item.content) ??
    str(item.value) ??
    textFromParts(item.content)
  );
}

function codexTurnCompletedIsError(
  params: Record<string, unknown> | undefined,
): boolean {
  return isCodexErrorValue(params?.isError) || isCodexErrorValue(params?.error);
}

function codexThreadStatusIsIdle(
  params: Record<string, unknown> | undefined,
): boolean {
  return str(record(params?.status)?.type) === 'idle';
}

function codexThreadStatusIsError(
  params: Record<string, unknown> | undefined,
): boolean {
  const status = record(params?.status);
  return isCodexErrorValue(status?.error) || isCodexErrorValue(params?.error);
}

function interruptCodexTurnWhenStarted({
  turnStartPromise,
  client,
  threadId,
}: {
  turnStartPromise: Promise<unknown>;
  client: {
    request(method: string, params?: unknown): Promise<unknown>;
  };
  threadId: string;
}) {
  turnStartPromise
    .then((turnResult) => {
      const lateTurnId = idFromCodexResult(turnResult, 'turn');
      if (lateTurnId) {
        return client.request('turn/interrupt', {
          threadId,
          turnId: lateTurnId,
        });
      }
      return undefined;
    })
    .catch(() => {});
}

function isCodexErrorValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().length > 0;
  if (value && typeof value === 'object') return true;
  return false;
}

function textFromParts(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;

  const parts = value
    .map((part) => {
      if (typeof part === 'string') return part;
      const partRecord = record(part);
      return partRecord === undefined ? undefined : str(partRecord.text);
    })
    .filter((part): part is string => part !== undefined);

  return parts.length === 0 ? undefined : parts.join('');
}

function threadIdFromCodexNotification(notification: {
  params?: unknown;
}): string | null {
  const params = record(notification.params);
  const thread = record(params?.thread);
  return str(params?.threadId) ?? str(params?.thread_id) ?? str(thread?.id) ?? null;
}

function turnIdFromCodexNotification(notification: {
  params?: unknown;
}): string | null {
  const params = record(notification.params);
  const turn = record(params?.turn);
  return str(params?.turnId) ?? str(params?.turn_id) ?? str(turn?.id) ?? null;
}

function codexNotificationRequiresSessionScope(method: string): boolean {
  return (
    method.startsWith('item/') ||
    method === 'turn/completed' ||
    method === 'thread/status/changed'
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
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
