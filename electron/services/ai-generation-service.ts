import { homedir } from 'os';

import { query } from '@anthropic-ai/claude-agent-sdk';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { dbg } from '../lib/debug';

import { getOrCreateServer } from './agent-backends/opencode/opencode-backend';

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
  outputSchema,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  backend: AgentBackendType;
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
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
          outputSchema,
          abortController,
        });

      case 'opencode':
        return await generateWithOpenCode({
          model,
          prompt,
          skillName,
          outputSchema,
          abortController,
        });

      default: {
        const _exhaustive: never = backend;
        dbg.agent('Unknown backend: %s', _exhaustive);
        return null;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      dbg.agent('generateText timed out after %dms', timeoutMs);
      return null;
    }
    dbg.agent('generateText failed: %O', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithClaudeCode({
  model,
  prompt,
  skillName,
  outputSchema,
  abortController,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  abortController: AbortController;
}): Promise<unknown | null> {
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;

  const generator = query({
    prompt: effectivePrompt,
    options: {
      allowedTools: [],
      model,
      abortController,
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
    };

    if (msg.type === 'result') {
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
  outputSchema,
  abortController,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  abortController: AbortController;
}): Promise<unknown | null> {
  const { client } = await getOrCreateServer();

  let effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;

  // OpenCode doesn't support native JSON schema output, so we ask for JSON
  // in the prompt and parse it manually.
  if (outputSchema) {
    effectivePrompt += `\n\nRespond with ONLY a valid JSON object matching this schema (no markdown, no code fences):\n${JSON.stringify(outputSchema, null, 2)}`;
  }

  // Create a temporary session for this one-off generation
  const cwd = homedir();
  const session = await client.session.create({ directory: cwd });
  const sessionId = session.data?.id;

  if (!sessionId) {
    throw new Error('OpenCode session.create() did not return a session ID');
  }

  // Abort handling: abort the session on signal
  const onAbort = () => {
    client.session
      .abort({ sessionID: sessionId, directory: cwd })
      .catch(() => {});
  };
  abortController.signal.addEventListener('abort', onAbort, { once: true });

  try {
    const parsedModel = parseOpenCodeModel(model);
    const response = await client.session.prompt({
      sessionID: sessionId,
      directory: cwd,
      parts: [{ type: 'text', text: effectivePrompt }],
      ...(parsedModel ? { model: parsedModel } : {}),
    });

    const textParts = (response.data?.parts ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => (part as { text?: string }).text?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!textParts) {
      return null;
    }

    // If we requested structured output, parse the JSON response
    if (outputSchema) {
      return parseJsonResponse(textParts);
    }

    return textParts;
  } finally {
    abortController.signal.removeEventListener('abort', onAbort);

    // Clean up the temporary session (independent of parent abort)
    client.session
      .delete({ sessionID: sessionId, directory: cwd })
      .catch((error) => {
        dbg.agent(
          'Failed to delete temporary generation session %s: %O',
          sessionId,
          error,
        );
      });
  }
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
  } catch {
    dbg.agent('Failed to parse JSON from response: %s', jsonStr);
    return null;
  }
}
