import { join } from 'path';

import { app, BrowserWindow, shell } from 'electron';
import fixPath from 'fix-path';

import { migrateDatabase } from './database';
import { registerIpcHandlers } from './ipc/handlers';
import { dbg } from './lib/debug';
import { agentService } from './services/agent-service';
import { runCommandService } from './services/run-command-service';

dbg.main('Starting Jean-Claude main process');
dbg.main(
  'Node version: %s, Electron version: %s',
  process.versions.node,
  process.versions.electron,
);
dbg.main('Platform: %s, Arch: %s', process.platform, process.arch);

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

  if (process.env.ELECTRON_RENDERER_URL) {
    dbg.main('Loading dev URL: %s', process.env.ELECTRON_RENDERER_URL);
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html');
    dbg.main('Loading production HTML: %s', htmlPath);
    mainWindow.loadFile(htmlPath);
  }
}

app.whenReady().then(async () => {
  dbg.main('App ready, initializing...');

  dbg.main('Running database migrations...');
  await migrateDatabase();
  dbg.main('Database migrations complete');

  dbg.main('Registering IPC handlers...');
  registerIpcHandlers();
  dbg.main('IPC handlers registered');

  // Recover any tasks that were left in running/waiting state from a previous crash
  dbg.main('Recovering stale tasks...');
  await agentService.recoverStaleTasks();

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

app.on('before-quit', async () => {
  dbg.main('App quitting, stopping all commands...');
  await runCommandService.stopAllCommands();
  dbg.main('All commands stopped');
});

app.on('window-all-closed', () => {
  dbg.main('All windows closed');
  if (process.platform !== 'darwin') {
    dbg.main('Non-macOS platform, quitting app');
    app.quit();
  }
});
