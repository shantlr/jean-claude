import { join } from 'path';

import { app, BrowserWindow, shell } from 'electron';
import fixPath from 'fix-path';

import { migrateDatabase } from './database';
import { registerIpcHandlers } from './ipc/handlers';
import { agentService } from './services/agent-service';
import { runCommandService } from './services/run-command-service';

// Fix PATH for packaged macOS apps launched from Finder/Dock
// Only needed when NOT running from terminal (which already has correct PATH)
// Note: fixPath can cause issues with fish shell + jenv/volta configurations
// TODO: Re-enable with PATH cleanup for production Finder launches
if (!process.env.TERM) {
  fixPath();
}

function createWindow() {
  const isDev = !!process.env.ELECTRON_RENDERER_URL;

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
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await migrateDatabase();
  registerIpcHandlers();

  // Recover any tasks that were left in running/waiting state from a previous crash
  await agentService.recoverStaleTasks();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  await runCommandService.stopAllCommands();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
