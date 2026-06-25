import { getJcMcpServerPath } from './jc-mcp-server-path';

/**
 * Build the runtime MCP servers config for the Jean-Claude Agent Tools server.
 * Bridge values are passed directly as environment variables. We use
 * /usr/bin/env because OpenCode runtime MCP server config does not support a
 * separate env object.
 */
export function buildJcMcpServersConfigForCwd({
  cwd,
  questionBridge,
  enableReviewTool = false,
  environmentMode = 'env',
}: {
  cwd: string;
  questionBridge: {
    serverUrl: string;
    sessionId?: string;
    stepId?: string;
    registrationId?: string;
    token: string;
  };
  enableReviewTool?: boolean;
  environmentMode?: 'env' | 'argv';
}): Record<
  string,
  { command: string; args: string[]; env?: Record<string, string> }
> {
  const serverPath = getJcMcpServerPath();
  const env = {
    JC_MCP_BRIDGE_URL: questionBridge.serverUrl,
    ...(questionBridge.sessionId
      ? { JC_MCP_SESSION_ID: questionBridge.sessionId }
      : {}),
    ...(questionBridge.stepId ? { JC_MCP_STEP_ID: questionBridge.stepId } : {}),
    ...(questionBridge.registrationId
      ? { JC_MCP_REGISTRATION_ID: questionBridge.registrationId }
      : {}),
    JC_MCP_AUTH_TOKEN: questionBridge.token,
    ...(enableReviewTool ? { JC_MCP_ENABLE_REVIEW_TOOL: '1' } : {}),
  };

  if (environmentMode === 'env') {
    return {
      'jean-claude-mcp': {
        command: 'node',
        args: [serverPath, '--workdir', cwd],
        env,
      },
    };
  }

  return {
    'jean-claude-mcp': {
      command: '/usr/bin/env',
      args: [
        ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
        'node',
        serverPath,
        '--workdir',
        cwd,
      ],
    },
  };
}
