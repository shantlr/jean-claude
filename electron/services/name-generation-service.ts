import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';

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
      prompt: `You are a task naming assistant. Given a coding task description, produce a short name (≤40 characters) that captures the essence of the task.

Rules:
- MUST be ≤40 characters. This is a hard limit.
- Start with a lowercase verb (add, fix, refactor, update, implement, etc.)
- Be specific about WHAT is being done, but concise
- NEVER copy the input verbatim. Always summarize and compress.
- Ignore boilerplate, metadata, platform tags, ticket IDs, repro steps
- Focus on the single core action being described

Examples:
Input: "once a PR is associated to a task, in the task details diff view, we should have a button beside 'See PR' to be able to push new changes"
Output: "add push changes button to PR diff view"

Input: "The station subtitle is not clearing when the user searches for a new station in the search field, it persists from the previous selection"
Output: "fix subtitle not clearing on search"

Input: "We need to add retry logic to the webhook delivery system so that failed webhooks are retried up to 3 times with exponential backoff"
Output: "add retry logic to webhook delivery"

Input: "refactor the authentication middleware to use JWT tokens instead of session-based authentication"
Output: "refactor auth middleware to use JWT"

Input: "fix race condition in checkout flow where users are sometimes double-charged"
Output: "fix race condition in checkout flow"

Task to name:
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
