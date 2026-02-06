import createDebug from 'debug';

/**
 * Debug logging namespace for Jean-Claude.
 *
 * Usage:
 *   import { dbg } from '../lib/debug';
 *   dbg.agent('Starting session %s', sessionId);
 *
 * By default, all jc:* logs are enabled.
 * To customize, set DEBUG env var:
 *   DEBUG=jc:agent:* pnpm dev:quiet     # Agent logs only
 *   DEBUG=jc:*,-jc:agent:message pnpm dev:quiet  # All except agent messages
 *   DEBUG= pnpm dev:quiet               # Disable all logs
 */

const BASE = 'jc';

// Enable all jc:* logs by default if DEBUG is not set
if (!process.env.DEBUG) {
  createDebug.enable(`${BASE}:*`);
}

// Create namespaced debug instances
export const dbg = {
  // Main process
  main: createDebug(`${BASE}:main`),

  // Database
  db: createDebug(`${BASE}:db`),
  dbMigration: createDebug(`${BASE}:db:migration`),

  // IPC
  ipc: createDebug(`${BASE}:ipc`),

  // Agent service
  agent: createDebug(`${BASE}:agent`),
  agentSession: createDebug(`${BASE}:agent:session`),
  agentMessage: createDebug(`${BASE}:agent:message`),
  agentPermission: createDebug(`${BASE}:agent:permission`),

  // Other services
  worktree: createDebug(`${BASE}:worktree`),
  notification: createDebug(`${BASE}:notification`),
  azure: createDebug(`${BASE}:azure`),
  azureImageProxy: createDebug(`${BASE}:azure:image-proxy`),
  usage: createDebug(`${BASE}:usage`),
  encryption: createDebug(`${BASE}:encryption`),
  runCommand: createDebug(`${BASE}:run-command`),
  skill: createDebug(`${BASE}:skill`),
  mcp: createDebug(`${BASE}:mcp`),
};

// Re-export for custom namespace creation
export { createDebug };
