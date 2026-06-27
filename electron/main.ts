import { join } from 'path';

import { app, BrowserWindow, protocol, shell } from 'electron';
import fixPath from 'fix-path';

import {
  closeIdleOpenCodeSharedServerNow,
  killAllOpenCodeServersSync,
} from './services/agent-backends/opencode/opencode-backend';
import {
  decodeProxyUrl,
  fetchAuthenticatedImageStream,
} from './services/azure-image-proxy-service';
import {
  fetchLocalImage,
  LOCAL_IMAGE_PROTOCOL,
} from './services/local-image-protocol-service';
import { agentService } from './services/agent-service';
import { cleanupOrphanedWorkspaces } from './services/system-project-service';
import { dbg } from './lib/debug';
import { migrateDatabase } from './database';
import { pipelineTrackingService } from './services/pipeline-tracking-service';
import { preferenceMemoryConsolidationService } from './services/preference-memory-service';
import { rawMessageCleanupService } from './services/raw-message-cleanup-service';
import { registerIpcHandlers } from './ipc/handlers';
import { runCommandService } from './services/run-command-service';
import { syncBuiltinSkillSymlinks } from './services/skill-management-service';
import { systemCalendarService } from './services/system-calendar-service';
import { upsertBuiltinSkills } from './services/builtin-skills-service';



// Register custom protocol scheme before app is ready
// This must be done synchronously before the app ready event
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'azure-image-proxy',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: LOCAL_IMAGE_PROTOCOL,
    privileges: {
      secure: true,
    },
  },
]);

dbg.main('Starting Jean-Claude main process');
dbg.main(
  'Node version: %s, Electron version: %s',
  process.versions.node,
  process.versions.electron,
);
dbg.main('Platform: %s, Arch: %s', process.platform, process.arch);

// Prevent multiple instances — a second launch would run recoverStaleTasks()
// and mark currently-running tasks as interrupted.
// Skip when JC_SKIP_INSTANCE_LOCK is set (dev:tmp / dev:tmp:reuse) so we
// can run multiple dev instances side-by-side for testing.
if (process.env.JC_SKIP_INSTANCE_LOCK) {
  dbg.main('JC_SKIP_INSTANCE_LOCK set — skipping single-instance lock');
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    dbg.main(
      'Another instance is already running. Quitting to avoid interrupting active tasks.',
    );
    app.quit();
  }
}

// Fix PATH for packaged macOS apps launched from Finder/Dock
// Only needed when NOT running from terminal (which already has correct PATH)
// Note: fixPath can cause issues with fish shell + jenv/volta configurations
// TODO: Re-enable with PATH cleanup for production Finder launches
if (!process.env.TERM) {
  dbg.main('Fixing PATH for non-terminal launch');
  fixPath();
}

function createWindow() {
  const isDev = !!process.env.ELECTRON_RENDERER_URL;
  dbg.main('Creating main window (isDev: %s)', isDev);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: isDev ? 'Jean-Claude 🚧 Dev' : 'Jean-Claude',
    icon: join(__dirname, '../../resources/icons/512x512.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  // Open external links in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    dbg.main('External link requested: %s', url);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('windowState:fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('windowState:fullscreen-changed', false);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    dbg.main('Loading dev URL: %s', process.env.ELECTRON_RENDERER_URL);
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html');
    dbg.main('Loading production HTML: %s', htmlPath);
    mainWindow.loadFile(htmlPath);
  }
}

function loadMigrationWindowContent({
  window,
  errorMessage,
}: {
  window: BrowserWindow;
  errorMessage?: string;
}) {
  const isError = Boolean(errorMessage);
  const safeErrorMessage = (errorMessage ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #111827;
        color: #f9fafb;
      }
      main {
        width: 320px;
        padding: 28px;
        text-align: center;
      }
      .spinner {
        width: 34px;
        height: 34px;
        margin: 0 auto 18px;
        border: 3px solid rgba(249, 250, 251, 0.22);
        border-top-color: #f9fafb;
        border-radius: 999px;
        animation: spin 900ms linear infinite;
      }
      .error-icon {
        width: 34px;
        height: 34px;
        margin: 0 auto 18px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: #7f1d1d;
        color: #fecaca;
        font-size: 22px;
        font-weight: 700;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 17px;
        font-weight: 650;
      }
      p {
        margin: 0;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.5;
      }
      pre {
        max-height: 120px;
        margin: 16px 0 0;
        padding: 12px;
        overflow: auto;
        white-space: pre-wrap;
        text-align: left;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.9);
        color: #fecaca;
        font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      ${
        isError
          ? `<div class="error-icon">!</div><h1>Migration failed</h1><p>Jean-Claude could not finish database migration.</p><pre>${safeErrorMessage}</pre>`
          : '<div class="spinner"></div><h1>Updating Jean-Claude</h1><p>Preparing your database. This can take a moment.</p>'
      }
    </main>
  </body>
</html>`;

  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createMigrationWindow() {
  const migrationWindow = new BrowserWindow({
    width: 420,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    autoHideMenuBar: true,
    title: 'Jean-Claude Update',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  loadMigrationWindowContent({ window: migrationWindow });
  migrationWindow.once('ready-to-show', () => migrationWindow.show());

  return migrationWindow;
}

// When a second instance is launched, focus the existing window instead
app.on('second-instance', () => {
  const mainWindow = BrowserWindow.getAllWindows().find(
    (w) => !w.isDestroyed(),
  );
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  dbg.main('App ready, initializing...');

  // Register azure-image-proxy protocol handler
  dbg.main('Registering azure-image-proxy protocol handler...');
  protocol.handle('azure-image-proxy', async (request) => {
    const decoded = decodeProxyUrl(request.url);
    if (!decoded) {
      dbg.main('Failed to decode proxy URL: %s', request.url);
      return new Response('Invalid proxy URL', { status: 400 });
    }

    const { providerId, imageUrl } = decoded;
    dbg.main(
      'Proxying image request: providerId=%s, url=%s',
      providerId,
      imageUrl,
    );

    // Stream the response directly from Azure DevOps
    return fetchAuthenticatedImageStream({ providerId, imageUrl });
  });
  dbg.main('azure-image-proxy protocol handler registered');

  dbg.main('Registering local image protocol handler...');
  protocol.handle(LOCAL_IMAGE_PROTOCOL, (request) =>
    fetchLocalImage(request.url),
  );
  dbg.main('local image protocol handler registered');

  dbg.main('Running database migrations...');
  let shouldQuitOnMigrationWindowClose = false;
  const migrationWindowRef: { current: BrowserWindow | null } = {
    current: null,
  };
  const migrationWindowTimer = setTimeout(() => {
    migrationWindowRef.current = createMigrationWindow();
    migrationWindowRef.current.on('closed', () => {
      migrationWindowRef.current = null;
      if (shouldQuitOnMigrationWindowClose) {
        app.quit();
      }
    });
  }, 500);

  try {
    await migrateDatabase();
  } catch (error) {
    clearTimeout(migrationWindowTimer);
    const errorMessage =
      error instanceof Error ? error.stack || error.message : String(error);

    shouldQuitOnMigrationWindowClose = true;
    if (!migrationWindowRef.current) {
      migrationWindowRef.current = createMigrationWindow();
      migrationWindowRef.current.on('closed', () => {
        migrationWindowRef.current = null;
        app.quit();
      });
    }
    loadMigrationWindowContent({
      window: migrationWindowRef.current,
      errorMessage,
    });
    migrationWindowRef.current.setClosable(true);
    migrationWindowRef.current.show();
    return;
  }

  clearTimeout(migrationWindowTimer);
  migrationWindowRef.current?.close();
  dbg.main('Database migrations complete');

  const isDev = !!process.env.ELECTRON_RENDERER_URL;
  dbg.main('Upserting builtin skills...');
  await upsertBuiltinSkills({ preserveExisting: isDev });
  await syncBuiltinSkillSymlinks();
  dbg.main('Builtin skills upserted');

  systemCalendarService.start();
  pipelineTrackingService.start();
  rawMessageCleanupService.start();
  preferenceMemoryConsolidationService.start();

  dbg.main('Registering IPC handlers...');
  registerIpcHandlers();
  dbg.main('IPC handlers registered');

  // Recover any tasks that were left in running/waiting state from a previous crash
  dbg.main('Recovering stale tasks...');
  await agentService.recoverStaleTasks();

  // Clean up orphaned skill workspaces from previous sessions
  cleanupOrphanedWorkspaces().catch((err) => {
    dbg.main('Failed to cleanup orphaned workspaces: %O', err);
  });

  createWindow();
  dbg.main('Main window created, app ready');

  app.on('activate', () => {
    dbg.main('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      dbg.main('No windows open, creating new window');
      createWindow();
    }
  });
});

let isQuittingAfterCleanup = false;
const QUIT_CLEANUP_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Quit cleanup timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

app.on('before-quit', (event) => {
  if (isQuittingAfterCleanup) return;

  event.preventDefault();
  isQuittingAfterCleanup = true;

  void (async () => {
    try {
      await withTimeout(
        (async () => {
          dbg.main('App quitting, stopping agents and commands...');
          await agentService.stopAll({ reason: 'shutdown' });
          dbg.main('All agents stopped');
          await closeIdleOpenCodeSharedServerNow();
          dbg.main('Idle shared OpenCode server stopped');
          await runCommandService.stopAllCommands();
          dbg.main('All commands stopped');
        })(),
        QUIT_CLEANUP_TIMEOUT_MS,
      );
    } catch (error) {
      dbg.main('Error during quit cleanup: %O', error);
      runCommandService.killAllProcessGroupsSync();
      killAllOpenCodeServersSync();
    } finally {
      app.quit();
    }
  })();

  systemCalendarService.stop();
  pipelineTrackingService.stop();
  rawMessageCleanupService.stop();
  preferenceMemoryConsolidationService.stop();
});

// Synchronous last-resort cleanup: kill all process groups when the Node.js
// process exits (covers SIGINT, SIGTERM, uncaught exceptions — not kill -9).
process.on('exit', () => {
  runCommandService.killAllProcessGroupsSync();
  killAllOpenCodeServersSync();
});

app.on('window-all-closed', () => {
  dbg.main('All windows closed');
  if (process.platform !== 'darwin') {
    dbg.main('Non-macOS platform, quitting app');
    app.quit();
  }
});
