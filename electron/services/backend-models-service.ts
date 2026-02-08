import { exec } from 'child_process';
import { promisify } from 'util';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { dbg } from '../lib/debug';

const execAsync = promisify(exec);

export interface BackendModel {
  id: string;
  label: string;
}

// Claude Code models are static — they're defined by the SDK, not discoverable via CLI.
const CLAUDE_CODE_MODELS: BackendModel[] = [
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
];

// Cache for dynamic model lists (keyed by backend type)
const modelCache = new Map<
  AgentBackendType,
  { models: BackendModel[]; fetchedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    const { stdout } = await execAsync('opencode models', {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    const models: BackendModel[] = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((id) => ({
        id,
        label: formatModelLabel(id),
      }));

    dbg.agent('Discovered %d OpenCode models', models.length);
    modelCache.set('opencode', { models, fetchedAt: Date.now() });
    return models;
  } catch (error) {
    dbg.agent('Failed to fetch OpenCode models: %O', error);
    // Return cached value (even if stale) on error, or empty array
    return cached?.models ?? [];
  }
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
