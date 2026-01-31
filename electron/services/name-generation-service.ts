import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';

const TASK_NAME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
} as const;

/**
 * Generates a task name from a prompt using Claude Haiku.
 * This is a synchronous (blocking) operation used when we need the name
 * before creating a worktree, so the worktree directory can use the generated name.
 *
 * @param prompt - The task prompt to generate a name from
 * @returns The generated name, or null if generation fails
 */
export async function generateTaskName(prompt: string): Promise<string | null> {
  try {
    const generator = query({
      prompt: `Generate a short task name (max 40 characters) that summarizes this task. Output only the name, nothing else.\n\nTask: ${prompt}`,
      options: {
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        model: 'haiku',
        outputFormat: {
          type: 'json_schema',
          schema: TASK_NAME_SCHEMA,
        },
      },
    });

    for await (const message of generator) {
      const msg = message as {
        type: string;
        structured_output?: { name: string };
      };
      if (msg.type === 'result' && msg.structured_output?.name) {
        return msg.structured_output.name.slice(0, 40);
      }
    }

    return null;
  } catch (error) {
    dbg.agent('Failed to generate task name: %O', error);
    return null;
  }
}
