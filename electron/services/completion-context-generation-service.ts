import { query } from '@anthropic-ai/claude-agent-sdk';

import { db } from '../database';
import { dbg } from '../lib/debug';

const CONTEXT_SCHEMA = {
  type: 'object',
  properties: {
    context: { type: 'string' },
  },
  required: ['context'],
} as const;

/**
 * Generates a completion context for a project by analyzing its task history.
 * Uses Claude Haiku to produce a project description and example prompts
 * that help the FIM model understand the project domain and writing style.
 */
export async function generateCompletionContext({
  projectId,
}: {
  projectId: string;
}): Promise<string | null> {
  try {
    // Fetch the last 30 task prompts for this project
    const tasks = await db
      .selectFrom('tasks')
      .select(['prompt'])
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .execute();

    if (tasks.length === 0) {
      return null;
    }

    const promptList = tasks
      .map((t) => t.prompt.trim())
      .filter((p) => p.length > 0)
      .map((p) => `- ${p}`)
      .join('\n');

    if (!promptList) {
      return null;
    }

    const generator = query({
      prompt: `You are analyzing a software project's task history to create a completion context.
Given these recent task prompts from a project, generate a concise context block that will help an autocomplete model complete future prompts.

The context should include:
1. A short description of what this project is about (1-2 sentences, focus on purpose/domain, not technical stack)
2. A curated list of 5-10 representative example prompts that capture the user's writing style and common task patterns

Task prompts:
${promptList}

Output a single text block formatted exactly like this:
Project: <description>

Example prompts:
- <prompt 1>
- <prompt 2>
...

Keep it concise. The total should be under 500 characters.`,
      options: {
        allowedTools: [],
        model: 'haiku',
        outputFormat: {
          type: 'json_schema',
          schema: CONTEXT_SCHEMA,
        },
        persistSession: false,
      },
    });

    for await (const message of generator) {
      const msg = message as {
        type: string;
        structured_output?: { context: string };
      };
      if (msg.type === 'result' && msg.structured_output?.context) {
        return msg.structured_output.context;
      }
    }

    return null;
  } catch (error) {
    dbg.agent('Failed to generate completion context: %O', error);
    return null;
  }
}
