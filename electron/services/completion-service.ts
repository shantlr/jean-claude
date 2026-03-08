import { Mistral } from '@mistralai/mistralai';

import {
  CompletionUsageRepository,
  ProjectRepository,
  SettingsRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';

import { encryptionService } from './encryption-service';

let cachedClient: Mistral | null = null;
let cachedSettingsKey = '';

function getClient(apiKey: string, serverUrl: string | undefined): Mistral {
  // Treat empty string as undefined so the SDK uses its default base URL
  const effectiveUrl = serverUrl || undefined;
  const key = `${apiKey}:${effectiveUrl}`;
  if (cachedClient && cachedSettingsKey === key) {
    return cachedClient;
  }

  cachedClient = new Mistral({
    apiKey,
    serverURL: effectiveUrl,
  });
  cachedSettingsKey = key;
  return cachedClient;
}

export async function complete({
  prompt,
  suffix,
  projectId,
  contextBeforePrompt,
}: {
  prompt: string;
  suffix?: string;
  projectId?: string;
  contextBeforePrompt?: string;
}): Promise<string | null> {
  try {
    const settings = await SettingsRepository.get('completion');

    if (!settings.enabled || !settings.apiKey || !settings.model) {
      dbg.completion(
        'Completion skipped: not configured (enabled=%s, hasKey=%s, model=%s)',
        settings.enabled,
        !!settings.apiKey,
        settings.model,
      );
      return null;
    }

    let projectCompletionContext = '';
    if (projectId) {
      const project = await ProjectRepository.findById(projectId);
      if (project?.completionContext) {
        projectCompletionContext = project.completionContext;
      }
    }

    const trimmedConversationContext = contextBeforePrompt?.trim();
    const contextParts = [
      projectCompletionContext
        ? `<project_context>\n${projectCompletionContext}\n</project_context>`
        : '',
      trimmedConversationContext
        ? `<assistant_message>\n${trimmedConversationContext}\n</assistant_message>`
        : '',
    ].filter((value) => value.length > 0);
    const effectivePrompt =
      contextParts.length > 0
        ? `${contextParts.join('\n\n')}\n\nFollow-up prompt:\n${prompt}`
        : prompt;

    const apiKey = encryptionService.decrypt(settings.apiKey);
    const client = getClient(apiKey, settings.serverUrl);

    dbg.completion(
      'Requesting FIM completion (model=%s, promptLen=%d, withContext=%s)',
      settings.model,
      effectivePrompt.length,
      effectivePrompt !== prompt,
    );

    const result = await client.fim.complete({
      model: settings.model,
      prompt: effectivePrompt,
      suffix: suffix || undefined,
      maxTokens: 64,
      temperature: 0,
      stop: ['\n\n'],
    });

    // Record token usage for daily cost tracking
    if (result.usage && !process.env.JC_DISABLE_USAGE_TRACKING) {
      const today = new Date().toISOString().slice(0, 10);
      CompletionUsageRepository.recordUsage({
        date: today,
        promptTokens: result.usage.promptTokens ?? 0,
        completionTokens: result.usage.completionTokens ?? 0,
      }).catch((err) => {
        dbg.completion('Failed to record usage: %O', err);
      });
    }

    const content = result.choices?.[0]?.message?.content ?? null;
    if (content === null) {
      dbg.completion('FIM returned no content');
      return null;
    }

    // SDK returns string | ContentChunk[] — extract text
    const text = typeof content === 'string' ? content : null;
    dbg.completion('FIM result: %s', text?.slice(0, 80));

    return text?.trim() || null;
  } catch (error) {
    dbg.completion('FIM completion error: %O', error);
    return null;
  }
}

export async function testCompletion(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const settings = await SettingsRepository.get('completion');

    if (!settings.enabled || !settings.apiKey || !settings.model) {
      return { success: false, error: 'Autocomplete is not configured' };
    }

    const apiKey = encryptionService.decrypt(settings.apiKey);
    const client = getClient(apiKey, settings.serverUrl);

    await client.fim.complete({
      model: settings.model,
      prompt: 'function hello() {',
      maxTokens: 8,
      temperature: 0,
    });

    return { success: true };
  } catch (error: unknown) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 401) {
      return {
        success: false,
        error: 'Invalid API key. Please check your Codestral API key.',
      };
    }
    if (statusCode === 403) {
      return {
        success: false,
        error:
          'Access denied. Your API key may not have access to the Codestral model.',
      };
    }
    if (statusCode === 429) {
      return {
        success: false,
        error: 'Rate limited. Please wait a moment and try again.',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Codestral pricing per million tokens
const CODESTRAL_INPUT_COST_PER_M = 0.3;
const CODESTRAL_OUTPUT_COST_PER_M = 0.9;

export async function getDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await CompletionUsageRepository.getDailyUsage(today);

  const costUsd =
    (usage.promptTokens * CODESTRAL_INPUT_COST_PER_M +
      usage.completionTokens * CODESTRAL_OUTPUT_COST_PER_M) /
    1_000_000;

  const inputCostUsd =
    (usage.promptTokens * CODESTRAL_INPUT_COST_PER_M) / 1_000_000;
  const outputCostUsd =
    (usage.completionTokens * CODESTRAL_OUTPUT_COST_PER_M) / 1_000_000;

  return { ...usage, costUsd, inputCostUsd, outputCostUsd };
}

/** Invalidate the cached Mistral client (call when settings change). */
export function resetClient(): void {
  cachedClient = null;
  cachedSettingsKey = '';
}
