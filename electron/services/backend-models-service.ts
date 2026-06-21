import { exec, type ExecOptions } from 'child_process';
import { promisify } from 'util';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ThinkingEffort } from '@shared/types';

import { dbg } from '../lib/debug';

import {
  getOpenCodeFallbackCost,
  type OpenCodeModelCost,
} from './opencode-pricing';
import { getOrCreateCodexAppServer } from './agent-backends/codex/codex-app-server';


const execAsync = promisify(exec) as (
  command: string,
  options?: ExecOptions,
) => Promise<{ stdout: string; stderr: string }>;
const OPENCODE_THINKING_VARIANTS = new Set<ThinkingEffort>([
  'none',
  'low',
  'medium',
  'high',
  'max',
  'xhigh',
]);
const CODEX_THINKING_VARIANTS = new Set<ThinkingEffort>([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

export interface BackendModel {
  id: string;
  label: string;
  contextWindow?: number;
  supportsThinking?: boolean;
  thinkingEfforts?: ThinkingEffort[];
  cost?: OpenCodeModelCost;
}

// Claude Code models are static — they're defined by the SDK, not discoverable via CLI.
const CLAUDE_CODE_MODELS: BackendModel[] = [
  {
    id: 'opus',
    label: 'Opus',
    supportsThinking: true,
    thinkingEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'sonnet',
    label: 'Sonnet',
    supportsThinking: true,
    thinkingEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'haiku',
    label: 'Haiku',
    supportsThinking: true,
    thinkingEfforts: ['low', 'medium', 'high'],
  },
];

// Cache for dynamic model lists (keyed by backend type)
const modelCache = new Map<
  AgentBackendType,
  { models: BackendModel[]; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OPENCODE_MODELS_EXEC_OPTIONS: ExecOptions = {
  encoding: 'utf-8',
  maxBuffer: 2 * 1024 * 1024,
  timeout: 30_000,
};

/**
 * Fetch available models for a given backend.
 * Claude Code models are static. OpenCode models are discovered via `opencode models`.
 */
export async function getBackendModels(
  backend: AgentBackendType,
): Promise<BackendModel[]> {
  if (backend === 'claude-code') {
    return CLAUDE_CODE_MODELS;
  }

  if (backend === 'opencode') {
    return fetchOpenCodeModels();
  }

  if (backend === 'codex') {
    return fetchCodexModels();
  }

  dbg.agent('Unknown backend type for model discovery: %s', backend);
  return [];
}

async function fetchOpenCodeModels(): Promise<BackendModel[]> {
  // Check cache
  const cached = modelCache.get('opencode');
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.models;
  }

  try {
    const { stdout } = await execAsync(
      'opencode models --verbose',
      OPENCODE_MODELS_EXEC_OPTIONS,
    );

    let models = parseOpenCodeModelsVerbose(stdout);
    if (!models.some((model) => model.id.startsWith('openai/'))) {
      try {
        const { stdout: openAIStdout } = await execAsync(
          'opencode models openai --verbose',
          OPENCODE_MODELS_EXEC_OPTIONS,
        );
        models = mergeOpenCodeModelLists(
          models,
          parseOpenCodeModelsVerbose(openAIStdout),
        );
      } catch (error) {
        dbg.agent('Failed to fetch OpenCode OpenAI models: %O', error);
      }
    }

    dbg.agent('Discovered %d OpenCode models', models.length);
    modelCache.set('opencode', { models, fetchedAt: Date.now() });
    return models;
  } catch (error) {
    dbg.agent('Failed to fetch OpenCode models: %O', error);
    // Return cached value (even if stale) on error, or empty array
    return cached?.models ?? [];
  }
}

export function mergeOpenCodeModelLists(
  baseModels: BackendModel[],
  additionalModels: BackendModel[],
): BackendModel[] {
  const seen = new Set(baseModels.map((model) => model.id));
  const merged = [...baseModels];

  for (const model of additionalModels) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    merged.push(model);
  }

  return merged;
}

export function parseOpenCodeModelsVerbose(stdout: string): BackendModel[] {
  const lines = stdout.split('\n');
  const models: BackendModel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const id = lines[i].trim();
    if (!id || id.startsWith('{')) continue;

    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (lines[next]?.trim() !== '{') {
      models.push({ id, label: formatModelLabel(id) });
      continue;
    }

    const jsonLines: string[] = [];
    let depth = 0;
    for (let j = next; j < lines.length; j++) {
      const line = lines[j];
      jsonLines.push(line);
      depth += countJsonDepthDelta(line);

      if (depth === 0 && jsonLines.length > 0) {
        i = j;
        break;
      }
    }

    try {
      const metadata = JSON.parse(jsonLines.join('\n')) as {
        name?: string;
        cost?: OpenCodeModelCost;
        capabilities?: { reasoning?: boolean };
        limit?: { context?: unknown };
        variants?: Record<string, unknown>;
      };
      const thinkingEfforts = Object.keys(metadata.variants ?? {}).filter(
        (variant): variant is ThinkingEffort =>
          OPENCODE_THINKING_VARIANTS.has(variant as ThinkingEffort),
      );
      models.push({
        id,
        label: metadata.name ?? formatModelLabel(id),
        supportsThinking:
          metadata.capabilities?.reasoning === true ||
          thinkingEfforts.length > 0,
        ...(isValidContextWindow(metadata.limit?.context)
          ? { contextWindow: metadata.limit.context }
          : {}),
        ...(thinkingEfforts.length > 0 ? { thinkingEfforts } : {}),
        ...(metadata.cost ? { cost: metadata.cost } : {}),
      });
    } catch (error) {
      dbg.agent(
        'Failed to parse OpenCode model metadata for %s: %O',
        id,
        error,
      );
      models.push({ id, label: formatModelLabel(id) });
    }
  }

  return models;
}

function isValidContextWindow(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function fetchCodexModels(): Promise<BackendModel[]> {
  const cached = modelCache.get('codex');
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.models;
  }

  try {
    const { client } = await getOrCreateCodexAppServer();
    const models: BackendModel[] = [];
    let cursor: string | undefined;

    do {
      const result = (await client.request('model/list', {
        ...(cursor ? { after: cursor } : {}),
      })) as {
        data?: unknown[];
        hasMore?: boolean;
        nextCursor?: string | null;
      };

      for (const item of result.data ?? []) {
        const model = parseCodexModel(item);
        if (model) models.push(model);
      }

      cursor = result.hasMore ? (result.nextCursor ?? undefined) : undefined;
    } while (cursor);

    dbg.agent('Discovered %d Codex models', models.length);
    modelCache.set('codex', { models, fetchedAt: Date.now() });
    return models;
  } catch (error) {
    dbg.agent('Failed to fetch Codex models: %O', error);
    return cached?.models ?? [];
  }
}

export function parseCodexModel(item: unknown): BackendModel | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const model = item as {
    id?: unknown;
    displayName?: unknown;
    hidden?: unknown;
    supportedReasoningEfforts?: unknown;
  };

  if (
    model.hidden === true ||
    typeof model.id !== 'string' ||
    !model.id.trim()
  ) {
    return null;
  }

  const thinkingEfforts = Array.isArray(model.supportedReasoningEfforts)
    ? model.supportedReasoningEfforts
        .map((effort) =>
          effort && typeof effort === 'object' && !Array.isArray(effort)
            ? (effort as { reasoningEffort?: unknown }).reasoningEffort
            : undefined,
        )
        .filter(
          (effort): effort is ThinkingEffort =>
            typeof effort === 'string' &&
            CODEX_THINKING_VARIANTS.has(effort as ThinkingEffort),
        )
    : [];

  return {
    id: model.id,
    label:
      typeof model.displayName === 'string' && model.displayName.trim()
        ? model.displayName
        : formatModelLabel(model.id),
    supportsThinking: thinkingEfforts.length > 0,
    ...(thinkingEfforts.length > 0 ? { thinkingEfforts } : {}),
  };
}

export function calculateTheoreticalOpenCodeCost({
  providerID,
  modelID,
  inputTokens,
  outputTokens,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
}: {
  providerID?: string;
  modelID?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}): number {
  const cost = getOpenCodeCost(providerID, modelID);
  if (!cost) return 0;

  return (
    (inputTokens * cost.input +
      outputTokens * cost.output +
      cacheReadTokens * (cost.cache?.read ?? cost.input) +
      cacheCreationTokens * (cost.cache?.write ?? cost.input)) /
    1_000_000
  );
}

function getOpenCodeCost(
  providerID?: string,
  modelID?: string,
): OpenCodeModelCost | undefined {
  if (!modelID) return undefined;

  const fullId = providerID ? `${providerID}/${modelID}` : modelID;
  const cached = modelCache
    .get('opencode')
    ?.models.find(
      (model) =>
        model.id === fullId ||
        (!providerID && model.id.endsWith(`/${modelID}`)),
    )?.cost;
  if (cached && (cached.input > 0 || cached.output > 0)) return cached;

  return getOpenCodeFallbackCost(providerID, modelID);
}

function countJsonDepthDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let escaped = false;

  for (const char of line) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (char === '{') delta++;
    if (char === '}') delta--;
  }

  return delta;
}

/** Convert a model id like 'openai/gpt-5.1-codex' to a human-readable label like 'GPT-5.1 Codex' */
function formatModelLabel(id: string): string {
  // Strip provider prefix (e.g. 'openai/' or 'opencode/')
  const name = id.includes('/') ? id.split('/').slice(1).join('/') : id;

  return name
    .split('-')
    .map((part) => {
      // Keep version numbers as-is
      if (/^\d/.test(part)) return part;
      // Uppercase known acronyms
      if (['gpt', 'glm'].includes(part.toLowerCase()))
        return part.toUpperCase();
      // Title-case everything else
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}
