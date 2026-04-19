import type { AiSkillSlotsSetting } from '@shared/types';

import { dbg } from '../lib/debug';

import { generateText } from './ai-generation-service';
import { resolveAiSkillSlot } from './ai-skill-slot-resolver';
import { getBuiltinSkillPath } from './builtin-skills-service';
import { getSkillContent } from './skill-management-service';

const TASK_NAME_TIMEOUT_MS = 10 * 60 * 1000;
const TASK_NAME_MAX_PROMPT_LENGTH = 8000;

const TASK_NAME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
} as const;

/**
 * Generates a task name from a prompt using an AI skill slot.
 *
 * Resolution order:
 * 1. Project-level slot override (via projectSlots)
 * 2. Global slot setting
 * 3. Fallback: claude-code backend + haiku model + builtin skill content
 *
 * @param prompt - The task prompt to generate a name from
 * @param projectSlots - Optional project-level AI skill slot overrides
 * @returns The generated name, or null if generation fails
 */
export async function generateTaskName(
  prompt: string,
  projectSlots?: AiSkillSlotsSetting | null,
): Promise<string | null> {
  const truncatedPrompt = prompt.slice(0, TASK_NAME_MAX_PROMPT_LENGTH);

  try {
    const slotConfig = await resolveAiSkillSlot('task-name', projectSlots);

    let backend: 'claude-code' | 'opencode';
    let model: string;
    let effectivePrompt: string;
    let skillName: string | undefined;

    if (!slotConfig) {
      // Unconfigured: fall back to claude-code + haiku + builtin skill content
      backend = 'claude-code';
      model = 'haiku';
      const builtinContent = await getBuiltinSkillPrompt();
      effectivePrompt = `${builtinContent}\n\nTask to name:\n${truncatedPrompt}`;
    } else if (slotConfig.skillName === null) {
      // Slot configured but using builtin default prompt
      backend = slotConfig.backend;
      model = slotConfig.model;
      const builtinContent = await getBuiltinSkillPrompt();
      effectivePrompt = `${builtinContent}\n\nTask to name:\n${truncatedPrompt}`;
    } else {
      // Slot configured with a custom skill name
      backend = slotConfig.backend;
      model = slotConfig.model;
      skillName = slotConfig.skillName;
      effectivePrompt = `Task to name:\n${truncatedPrompt}`;
    }

    const result = await generateText({
      backend,
      model,
      prompt: effectivePrompt,
      skillName,
      outputSchema: TASK_NAME_SCHEMA,
      timeoutMs: TASK_NAME_TIMEOUT_MS,
    });

    if (
      result &&
      typeof result === 'object' &&
      'name' in result &&
      typeof (result as { name: unknown }).name === 'string'
    ) {
      const name = (result as { name: string }).name.slice(0, 40);
      dbg.agent('Generated task name: %s', name);
      return name;
    }

    return null;
  } catch (error) {
    dbg.agent('Failed to generate task name: %O', error);
    return null;
  }
}

/** Cached builtin skill content — read once, reused for the app's lifetime. */
let cachedBuiltinPrompt: string | null = null;

async function getBuiltinSkillPrompt(): Promise<string> {
  if (cachedBuiltinPrompt !== null) {
    return cachedBuiltinPrompt;
  }
  const skillPath = getBuiltinSkillPath('task-name-generation');
  const skill = await getSkillContent({ skillPath });
  cachedBuiltinPrompt = skill.content;
  return cachedBuiltinPrompt;
}
