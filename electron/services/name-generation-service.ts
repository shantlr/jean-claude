import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';

const TASK_NAME_TIMEOUT_MS = 10_000;

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
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, TASK_NAME_TIMEOUT_MS);

  try {
    const generator = query({
      prompt: `Generate a short task name (max 40 characters) that summarizes this task.
Output only the name, nothing else.
Focus on what the user is asking for, not provided data or examples.
the generated task name should be very consive and very expressive.

Task: ${prompt}`,
      options: {
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        model: 'haiku',
        abortController,
        outputFormat: {
          type: 'json_schema',
          schema: TASK_NAME_SCHEMA,
        },
        persistSession: false,
      },
    });

    for await (const message of generator) {
      const msg = message as {
        type: string;
        structured_output?: { name: string };
      };
      if (msg.type === 'result' && msg.structured_output?.name) {
        const name = msg.structured_output.name.slice(0, 40);
        dbg.agent('Generated task name: %s', name);
        return name;
      }
    }

    return null;
  } catch (error) {
    if (abortController.signal.aborted) {
      dbg.agent(
        'Task name generation timed out after %dms',
        TASK_NAME_TIMEOUT_MS,
      );
      return null;
    }

    dbg.agent('Failed to generate task name: %O', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
