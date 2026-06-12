import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOrCreateServerMock, recordUsageSafeMock } = vi.hoisted(() => ({
  getOrCreateServerMock: vi.fn(),
  recordUsageSafeMock: vi.fn(),
}));

vi.mock('./agent-backends/opencode/opencode-backend', () => ({
  getOrCreateServer: getOrCreateServerMock,
}));

vi.mock('./ai-usage-tracking-service', () => ({
  aiUsageTrackingService: {
    recordUsageSafe: recordUsageSafeMock,
  },
}));

import { generateText } from './ai-generation-service';

function createMockClient(response: unknown) {
  return {
    session: {
      create: vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
      prompt: vi.fn().mockResolvedValue(response),
      delete: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('generateText opencode structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns native structured output when OpenCode provides it', async () => {
    const structured = {
      title: 'fix: generate squash merge messages',
      body: '',
    };
    const client = createMockClient({
      data: {
        info: { structured },
        parts: [{ type: 'text', text: 'ignored text fallback' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
    };

    const result = await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate message',
      outputSchema: schema,
    });

    expect(result).toEqual(structured);
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        format: {
          type: 'json_schema',
          schema,
          retryCount: 1,
        },
      }),
    );
  });

  it('falls back to parsing text JSON when structured output is absent', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [
          {
            type: 'text',
            text: '{"title":"fix: recover opencode output","body":"- Use text fallback"}',
          },
        ],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    const result = await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate message',
      outputSchema: { type: 'object' },
    });

    expect(result).toEqual({
      title: 'fix: recover opencode output',
      body: '- Use text fallback',
    });
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            text: expect.stringContaining(
              'Respond with ONLY a valid JSON object matching this schema',
            ),
          }),
        ],
      }),
    );
  });

  it('records one-off OpenCode requests even when token usage is absent', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [{ type: 'text', text: '{"name":"fix task tracking"}' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object' },
      usageContext: {
        feature: 'task-name',
        projectId: 'project-1',
        taskId: null,
        stepId: null,
      },
    });

    expect(recordUsageSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'opencode',
        model: 'default',
        allowEmptyUsage: true,
        context: expect.objectContaining({ feature: 'task-name' }),
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          cacheReadTokens: undefined,
          cacheCreationTokens: undefined,
        },
      }),
    );
  });
});
