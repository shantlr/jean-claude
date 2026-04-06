import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';

const TASK_NAME_TIMEOUT_MS = 10_000;
const TASK_NAME_MAX_PROMPT_LENGTH = 8000;

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

  const truncatedPrompt = prompt.slice(0, TASK_NAME_MAX_PROMPT_LENGTH);

  try {
    const generator = query({
      prompt: `Name this coding task in ≤40 chars. Be specific about WHAT is being done technically. Start with a verb.

The input may be a raw prompt, a work item with XML tags, a bug report, or a feature request. Ignore all boilerplate, metadata, platform tags (e.g. [iOS][Android]), ticket IDs, repro steps, and test configurations. Focus only on the core technical problem or feature being described.

Examples of GOOD names:
- "fix station subtitle not clearing on search" (from a verbose bug report about subtitle persisting when editing search fields, wrapped in "Implement the following work item" boilerplate)
- "add retry logic to webhook delivery" (from a feature request about webhook reliability)
- "refactor auth middleware to use JWT" (from a task about authentication changes)
- "update price display for multi-currency" (from a work item about currency formatting)
- "fix race condition in checkout flow" (from a bug report about double-charging)

Examples of BAD names (never do these):
- "implement work item" (too generic, says nothing)
- "fix the bug" (no specifics)
- "update the app" (meaningless)
- "work item 53147" (just an ID)
- "iOS Android search engine bug" (just tags, no action)

Task:
${truncatedPrompt}`,
      options: {
        allowedTools: [],
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
