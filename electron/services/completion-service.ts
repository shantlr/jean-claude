import { Mistral } from '@mistralai/mistralai';

import { SettingsRepository } from '../database/repositories';
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
}: {
  prompt: string;
  suffix?: string;
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

    const apiKey = encryptionService.decrypt(settings.apiKey);
    const client = getClient(apiKey, settings.serverUrl);

    dbg.completion(
      'Requesting FIM completion (model=%s, promptLen=%d)',
      settings.model,
      prompt.length,
    );

    const result = await client.fim.complete({
      model: settings.model,
      prompt,
      suffix: suffix || undefined,
      maxTokens: 64,
      temperature: 0,
      stop: ['\n\n'],
    });

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

/** Invalidate the cached Mistral client (call when settings change). */
export function resetClient(): void {
  cachedClient = null;
  cachedSettingsKey = '';
}
