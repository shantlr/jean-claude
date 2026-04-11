import createDebug from 'debug';
import { BrowserWindow } from 'electron';

import type { DebugLogEntry } from '@shared/debug-log-types';

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

let logIdCounter = 0;
let pendingBatch: DebugLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 1_000;

/**
 * Flush pending log entries to all renderer windows in a single IPC call.
 */
function flushLogs() {
  flushTimer = null;
  if (pendingBatch.length === 0) return;
  const batch = pendingBatch;
  pendingBatch = [];
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('debug:log-batch', batch);
    }
  }
}

/**
 * Queue a debug log entry for batched broadcast to the renderer.
 */
function broadcastLog(
  namespace: string,
  level: DebugLogEntry['level'],
  message: string,
) {
  pendingBatch.push({
    id: ++logIdCounter,
    timestamp: new Date().toISOString(),
    namespace,
    message,
    level,
  });
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, FLUSH_INTERVAL_MS);
  }
}

/**
 * Create a namespaced debug instance that also broadcasts to the renderer.
 */
function createLogger(
  name: string,
  level: DebugLogEntry['level'] = 'info',
): createDebug.Debugger {
  const instance = createDebug(`${BASE}:${name}`);
  const original = instance.log || console.debug;
  instance.log = (fmt: string, ...args: unknown[]) => {
    original(fmt, ...args);
    const formatted =
      args.length > 0 ? `${fmt} ${args.join(' ')}` : String(fmt);
    broadcastLog(instance.namespace, level, formatted);
  };
  return instance;
}

// Create namespaced debug instances
export const dbg = {
  // Main process
  main: createLogger('main'),

  // Database
  db: createLogger('db'),
  dbMigration: createLogger('db:migration'),

  // IPC
  ipc: createLogger('ipc'),

  // Agent service
  agent: createLogger('agent'),
  agentSession: createLogger('agent:session'),
  agentMessage: createLogger('agent:message'),
  agentPermission: createLogger('agent:permission'),

  // Other services
  worktree: createLogger('worktree'),
  notification: createLogger('notification'),
  azure: createLogger('azure'),
  azureImageProxy: createLogger('azure:image-proxy'),
  usage: createLogger('usage'),
  encryption: createLogger('encryption'),
  runCommand: createLogger('run-command'),
  skill: createLogger('skill'),
  mcp: createLogger('mcp'),
  completion: createLogger('completion'),
  feed: createLogger('feed'),
};

// Re-export for custom namespace creation
export { createDebug };
