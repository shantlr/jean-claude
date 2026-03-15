/**
 * Jean-Claude MCP Server
 *
 * A standalone MCP server that exposes tools for spawning sub-agent sessions
 * via Claude Code or OpenCode backends. Runs as a separate Node.js process using stdio
 * transport, intended to be registered via `claude mcp add`.
 *
 * Recursion is guarded by the JC_MCP_DEPTH environment variable (max depth 3).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createOpencode } from '@opencode-ai/sdk/v2';
import { z } from 'zod';

import type { AgentBackendType } from '@shared/agent-backend-types';

const MAX_DEPTH = 3;
const BACKEND_ENUM = z.enum(['claude-code', 'opencode']);

function getMcpWorkingDirectory(): string {
  const configured = process.env.JC_MCP_WORKDIR?.trim();
  if (configured) return configured;
  return process.cwd();
}

/**
 * Get the current recursion depth from the JC_MCP_DEPTH environment variable.
 */
function getCurrentDepth(): number {
  const raw = process.env.JC_MCP_DEPTH;
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Build an environment object for the sub-agent with an incremented depth counter.
 * Strips NODE_ENV to avoid interfering with tools like vitest.
 */
function buildSubAgentEnv(currentDepth: number): Record<string, string> {
  const { NODE_ENV: _nodeEnv, ...rest } = process.env;
  return {
    ...(rest as Record<string, string>),
    JC_MCP_DEPTH: String(currentDepth + 1),
  };
}

/**
 * Run a query() call and collect the final text output from the assistant.
 *
 * The SDK generator yields messages of various types. We collect text content
 * blocks from assistant messages and return the last one, which represents
 * the agent's final output.
 */
async function collectQueryResult(
  generator: ReturnType<typeof query>,
): Promise<string> {
  let lastText = '';

  for await (const message of generator) {
    const msg = message as {
      type: string;
      content?: Array<{ type: string; text?: string }>;
      result?: string | Record<string, unknown>;
    };

    // Collect text from assistant messages
    if (msg.type === 'assistant' && msg.content) {
      const textBlocks = msg.content.filter(
        (block) => block.type === 'text' && block.text,
      );
      if (textBlocks.length > 0) {
        lastText = textBlocks.map((block) => block.text).join('\n');
      }
    }

    // Result messages contain the final output
    if (msg.type === 'result') {
      if (typeof msg.result === 'string') {
        lastText = msg.result;
      } else if (msg.result) {
        lastText = JSON.stringify(msg.result);
      }
    }
  }

  return lastText || 'No output produced.';
}

function parseOpenCodeModel(
  model?: string,
): { providerID: string; modelID: string } | undefined {
  if (!model || model === 'default') return undefined;
  if (!model.includes('/')) return undefined;
  const [providerID, ...rest] = model.split('/');
  if (!providerID || rest.length === 0) return undefined;
  return { providerID, modelID: rest.join('/') };
}

function extractOpenCodeText(response: {
  data?: {
    parts?: Array<{ type?: string; text?: string }>;
  };
}): string {
  const text = (response.data?.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n\n')
    .trim();
  return text || 'No output produced.';
}

async function runClaudeSubAgent({
  prompt,
  model,
  currentDepth,
  readOnly,
}: {
  prompt: string;
  model?: string;
  currentDepth: number;
  readOnly: boolean;
}): Promise<string> {
  const cwd = getMcpWorkingDirectory();

  const options: NonNullable<Parameters<typeof query>[0]['options']> = {
    cwd,
    settingSources: ['user', 'project'],
    env: buildSubAgentEnv(currentDepth),
    persistSession: false,
  };

  if (model) {
    options.model = model;
  }

  if (readOnly) {
    options.allowedTools = ['Read', 'Glob', 'Grep', 'Bash'];
  } else {
    options.permissionMode = 'acceptEdits';
  }

  const generator = query({ prompt, options });
  return collectQueryResult(generator);
}

async function runOpenCodeSubAgent({
  prompt,
  model,
  readOnly,
}: {
  prompt: string;
  model?: string;
  readOnly: boolean;
}): Promise<string> {
  const cwd = getMcpWorkingDirectory();
  const { client, server } = await createOpencode({
    hostname: '127.0.0.1',
    port: 0,
    timeout: 30_000,
  });

  try {
    const created = await client.session.create({
      directory: cwd,
    });
    const sessionId = created.data?.id;
    if (!sessionId) {
      throw new Error('Failed to create OpenCode sub-agent session');
    }

    const enhancedPrompt = readOnly
      ? `${prompt}\n\nUse only Read/Glob/Grep style tools. Do not fetch web content.`
      : prompt;

    const modelConfig = parseOpenCodeModel(model);
    const response = await client.session.prompt({
      sessionID: sessionId,
      directory: cwd,
      parts: [{ type: 'text', text: enhancedPrompt }],
      agent: 'plan',
      ...(modelConfig ? { model: modelConfig } : {}),
    });

    await client.session.delete({
      sessionID: sessionId,
      directory: cwd,
    });

    return extractOpenCodeText(response);
  } finally {
    server.close();
  }
}

async function runSubAgent({
  backend,
  prompt,
  model,
  currentDepth,
  readOnly,
}: {
  backend: AgentBackendType;
  prompt: string;
  model?: string;
  currentDepth: number;
  readOnly: boolean;
}): Promise<string> {
  if (backend === 'opencode') {
    return runOpenCodeSubAgent({ prompt, model, readOnly });
  }
  return runClaudeSubAgent({
    prompt,
    model,
    currentDepth,
    readOnly,
  });
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'jean-claude-agent',
    version: '1.0.0',
  });

  // --- Tool: run_agent ---
  server.tool(
    'run_agent',
    'Run a full agent session to complete a task. The agent can use tools (bash, read, write, etc.) to accomplish the task.',
    {
      prompt: z.string().describe('The task prompt for the agent'),
      backend: BACKEND_ENUM.optional().describe(
        'Backend to run the sub-agent with',
      ),
      model: z
        .string()
        .optional()
        .describe("Model to use (e.g., 'sonnet', 'opus', 'haiku')"),
    },
    async ({ prompt, backend, model }) => {
      const currentDepth = getCurrentDepth();

      if (currentDepth >= MAX_DEPTH) {
        console.error(
          `[jean-claude-mcp] Recursion depth ${currentDepth} exceeds max ${MAX_DEPTH}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Maximum agent nesting depth (${MAX_DEPTH}) reached. Cannot spawn another sub-agent.`,
            },
          ],
          isError: true,
        };
      }

      try {
        console.error(
          `[jean-claude-mcp] run_agent: depth=${currentDepth}, backend=${backend ?? 'claude-code'}, model=${model ?? 'default'}, prompt="${prompt.slice(0, 100)}..."`,
        );

        const result = await runSubAgent({
          backend: backend ?? 'claude-code',
          prompt,
          model,
          currentDepth,
          readOnly: false,
        });

        console.error(
          `[jean-claude-mcp] run_agent completed: ${result.length} chars`,
        );

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[jean-claude-mcp] run_agent error: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Error running agent: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // --- Tool: run_review ---
  server.tool(
    'run_review',
    'Run a read-only code review. The agent can only read files and produce text output, it cannot modify anything.',
    {
      prompt: z.string().describe('What to review and what to focus on'),
      backend: BACKEND_ENUM.optional().describe(
        'Backend to run the review with',
      ),
      model: z
        .string()
        .optional()
        .describe('Model to use for the review (e.g. opus, sonnet, haiku)'),
    },
    async ({ prompt, backend, model }) => {
      const currentDepth = getCurrentDepth();

      if (currentDepth >= MAX_DEPTH) {
        console.error(
          `[jean-claude-mcp] Recursion depth ${currentDepth} exceeds max ${MAX_DEPTH}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Maximum agent nesting depth (${MAX_DEPTH}) reached. Cannot spawn another sub-agent.`,
            },
          ],
          isError: true,
        };
      }

      try {
        console.error(
          `[jean-claude-mcp] run_review: depth=${currentDepth}, backend=${backend ?? 'claude-code'}, model=${model ?? 'default'}, prompt="${prompt.slice(0, 100)}..."`,
        );

        const result = await runSubAgent({
          backend: backend ?? 'claude-code',
          prompt,
          model,
          currentDepth,
          readOnly: true,
        });

        console.error(
          `[jean-claude-mcp] run_review completed: ${result.length} chars`,
        );

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[jean-claude-mcp] run_review error: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Error running review: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[jean-claude-mcp] Server started on stdio transport');
}

main().catch((error) => {
  console.error('[jean-claude-mcp] Fatal error:', error);
  process.exit(1);
});
