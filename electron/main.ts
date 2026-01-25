import { join } from 'path';

import { app, BrowserWindow } from 'electron';

import { migrateDatabase } from './database';
import { registerIpcHandlers } from './ipc/handlers';
import { agentService } from './services/agent-service';

function createWindow() {
  const isDev = !!process.env.ELECTRON_RENDERER_URL;

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: isDev ? 'Idling 🚧 Dev' : 'Idling',
    icon: join(__dirname, '../../resources/icons/512x512.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
