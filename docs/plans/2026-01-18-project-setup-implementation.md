# Project Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the Idling Electron app with React, TypeScript, TailwindCSS, SQLite persistence, and core tooling.

**Architecture:** Electron main process handles database (SQLite via Kysely) and exposes repository methods via IPC. Renderer uses React with TanStack Router for navigation, React Query for data fetching, and Zustand for UI state.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, TailwindCSS 4, TanStack Router, TanStack React Query, Zustand, Kysely, better-sqlite3, ESLint, Prettier

---

## Task 1: Initialize electron-vite Project

**Files:**

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `index.html`

**Step 1: Create package.json**

```json
{
  "name": "idling",
  "version": "0.0.1",
  "description": "Personal productivity GUI to manage coding agents across multiple projects",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.7"
  }
}
```

**Step 2: Create electron.vite.config.ts**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src'),
      },
    },
    plugins: [react()],
  },
});
```

**Step 3: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

**Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "outDir": "./out",
    "rootDir": "."
  },
  "include": ["electron/**/*", "electron.vite.config.ts"]
}
```

**Step 5: Create tsconfig.web.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "composite": true,
    "outDir": "./out",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

**Step 6: Create electron/main.ts**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
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
```

**Step 7: Create electron/preload.ts**

```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // IPC methods will be added here
});
```

**Step 8: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Idling</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 9: Create src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 10: Create src/App.tsx**

```tsx
export default function App() {
  return <div>Idling</div>;
}
```

**Step 11: Install dependencies and verify**

Run: `pnpm install`
Run: `pnpm dev`
Expected: Electron window opens showing "Idling"

---

## Task 2: Add TailwindCSS

**Files:**

- Modify: `package.json`
- Create: `src/index.css`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

**Step 1: Install TailwindCSS**

Run: `pnpm add -D tailwindcss @tailwindcss/vite`

**Step 2: Update electron.vite.config.ts**

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
```

**Step 3: Create src/index.css**

```css
@import 'tailwindcss';
```

**Step 4: Update src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 5: Update src/App.tsx to verify Tailwind**

```tsx
export default function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">
      <h1 className="text-2xl font-bold">Idling</h1>
    </div>
  );
}
```

**Step 6: Verify**

Run: `pnpm dev`
Expected: Dark background with centered white "Idling" text

---

## Task 3: Add ESLint and Prettier

**Files:**

- Modify: `package.json`
- Create: `eslint.config.js`
- Create: `.prettierrc`

**Step 1: Install ESLint dependencies**

Run: `pnpm add -D eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-import eslint-import-resolver-typescript globals`

**Step 2: Install Prettier**

Run: `pnpm add -D prettier`

**Step 3: Create eslint.config.js**

```js
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      react,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': { typescript: true },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },
  {
    ignores: ['out/**', 'node_modules/**'],
  },
];
```

**Step 4: Create .prettierrc**

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

**Step 5: Verify lint and format**

Run: `pnpm lint`
Run: `pnpm format`
Expected: No errors

---

## Task 4: Add SQLite with Kysely

**Files:**

- Modify: `package.json`
- Create: `electron/database/index.ts`
- Create: `electron/database/schema.ts`
- Create: `electron/database/migrations/001_initial.ts`
- Create: `electron/database/migrator.ts`
- Modify: `electron/main.ts`

**Step 1: Install database dependencies**

Run: `pnpm add kysely better-sqlite3`
Run: `pnpm add -D @types/better-sqlite3`

**Step 2: Create electron/database/schema.ts**

```ts
import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
}

export interface ProviderTable {
  id: Generated<string>;
  type: 'azure-devops' | 'github' | 'gitlab';
  label: string;
  baseUrl: string;
  token: string;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProjectTable {
  id: Generated<string>;
  name: string;
  path: string;
  type: 'local' | 'git-provider';
  providerId: string | null;
  remoteUrl: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  prompt: string;
  status: 'running' | 'waiting' | 'completed' | 'errored';
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export type Provider = Selectable<ProviderTable>;
export type NewProvider = Insertable<ProviderTable>;
export type UpdateProvider = Updateable<ProviderTable>;

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type UpdateProject = Updateable<ProjectTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type UpdateTask = Updateable<TaskTable>;
```

**Step 3: Create electron/database/migrations/001_initial.ts**

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('providers')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('baseUrl', 'text', (col) => col.notNull())
    .addColumn('token', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  await db.schema
    .createTable('projects')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('local'))
    .addColumn('providerId', 'text', (col) =>
      col.references('providers.id').onDelete('set null'),
    )
    .addColumn('remoteUrl', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  await db.schema
    .createTable('tasks')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('prompt', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('running'))
    .addColumn('sessionId', 'text')
    .addColumn('worktreePath', 'text')
    .addColumn('startCommitHash', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tasks').execute();
  await db.schema.dropTable('projects').execute();
  await db.schema.dropTable('providers').execute();
}
```

**Step 4: Create electron/database/migrator.ts**

```ts
import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
```

**Step 5: Create electron/database/index.ts**

```ts
import Database from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect } from 'kysely';
import { app } from 'electron';
import { join } from 'path';

import { Database as DatabaseSchema } from './schema';
import { migrationProvider } from './migrator';

const dbPath = join(app.getPath('userData'), 'idling.db');

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: new Database(dbPath),
  }),
});

export async function migrateDatabase() {
  const migrator = new Migrator({
    db,
    provider: migrationProvider,
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`Migration "${result.migrationName}" executed successfully`);
    } else if (result.status === 'Error') {
      console.error(`Migration "${result.migrationName}" failed`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}
```

**Step 6: Update electron/main.ts to run migrations**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

import { migrateDatabase } from './database';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
```

**Step 7: Verify**

Run: `pnpm dev`
Expected: App starts, console shows migration success message

---

## Task 5: Add Repositories

**Files:**

- Create: `electron/database/repositories/projects.ts`
- Create: `electron/database/repositories/tasks.ts`
- Create: `electron/database/repositories/providers.ts`
- Create: `electron/database/repositories/index.ts`

**Step 1: Create electron/database/repositories/projects.ts**

```ts
import { db } from '../index';
import { NewProject, UpdateProject } from '../schema';

export const ProjectRepository = {
  findAll: () => db.selectFrom('projects').selectAll().execute(),

  findById: (id: string) =>
    db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst(),

  create: (data: NewProject) =>
    db
      .insertInto('projects')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateProject) =>
    db
      .updateTable('projects')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) =>
    db.deleteFrom('projects').where('id', '=', id).execute(),
};
```

**Step 2: Create electron/database/repositories/tasks.ts**

```ts
import { db } from '../index';
import { NewTask, UpdateTask } from '../schema';

export const TaskRepository = {
  findAll: () => db.selectFrom('tasks').selectAll().execute(),

  findByProjectId: (projectId: string) =>
    db
      .selectFrom('tasks')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .execute(),

  findById: (id: string) =>
    db.selectFrom('tasks').selectAll().where('id', '=', id).executeTakeFirst(),

  create: (data: NewTask) =>
    db
      .insertInto('tasks')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateTask) =>
    db
      .updateTable('tasks')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) => db.deleteFrom('tasks').where('id', '=', id).execute(),
};
```

**Step 3: Create electron/database/repositories/providers.ts**

```ts
import { safeStorage } from 'electron';

import { db } from '../index';
import { NewProvider, Provider, UpdateProvider } from '../schema';

function decryptToken(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

function encryptToken(token: string): string {
  return safeStorage.encryptString(token).toString('base64');
}

function decryptProvider(provider: Provider): Provider {
  return {
    ...provider,
    token: decryptToken(provider.token),
  };
}

export const ProviderRepository = {
  findAll: async () => {
    const providers = await db.selectFrom('providers').selectAll().execute();
    return providers.map(decryptProvider);
  },

  findById: async (id: string) => {
    const provider = await db
      .selectFrom('providers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return provider ? decryptProvider(provider) : undefined;
  },

  create: (data: NewProvider) =>
    db
      .insertInto('providers')
      .values({ ...data, token: encryptToken(data.token) })
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateProvider) => {
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    if (data.token) {
      updateData.token = encryptToken(data.token);
    }
    return db
      .updateTable('providers')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: (id: string) =>
    db.deleteFrom('providers').where('id', '=', id).execute(),
};
```

**Step 4: Create electron/database/repositories/index.ts**

```ts
export { ProjectRepository } from './projects';
export { TaskRepository } from './tasks';
export { ProviderRepository } from './providers';
```

---

## Task 6: Add IPC Layer

**Files:**

- Create: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Create: `src/lib/api.ts`
- Modify: `electron/main.ts`

**Step 1: Create electron/ipc/handlers.ts**

```ts
import { ipcMain } from 'electron';

import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
} from '../database/repositories';
import {
  NewProject,
  NewTask,
  NewProvider,
  UpdateProject,
  UpdateTask,
  UpdateProvider,
} from '../database/schema';

export function registerIpcHandlers() {
  // Projects
  ipcMain.handle('projects:findAll', () => ProjectRepository.findAll());
  ipcMain.handle('projects:findById', (_, id: string) =>
    ProjectRepository.findById(id),
  );
  ipcMain.handle('projects:create', (_, data: NewProject) =>
    ProjectRepository.create(data),
  );
  ipcMain.handle('projects:update', (_, id: string, data: UpdateProject) =>
    ProjectRepository.update(id, data),
  );
  ipcMain.handle('projects:delete', (_, id: string) =>
    ProjectRepository.delete(id),
  );

  // Tasks
  ipcMain.handle('tasks:findAll', () => TaskRepository.findAll());
  ipcMain.handle('tasks:findByProjectId', (_, projectId: string) =>
    TaskRepository.findByProjectId(projectId),
  );
  ipcMain.handle('tasks:findById', (_, id: string) =>
    TaskRepository.findById(id),
  );
  ipcMain.handle('tasks:create', (_, data: NewTask) =>
    TaskRepository.create(data),
  );
  ipcMain.handle('tasks:update', (_, id: string, data: UpdateTask) =>
    TaskRepository.update(id, data),
  );
  ipcMain.handle('tasks:delete', (_, id: string) => TaskRepository.delete(id));

  // Providers
  ipcMain.handle('providers:findAll', () => ProviderRepository.findAll());
  ipcMain.handle('providers:findById', (_, id: string) =>
    ProviderRepository.findById(id),
  );
  ipcMain.handle('providers:create', (_, data: NewProvider) =>
    ProviderRepository.create(data),
  );
  ipcMain.handle('providers:update', (_, id: string, data: UpdateProvider) =>
    ProviderRepository.update(id, data),
  );
  ipcMain.handle('providers:delete', (_, id: string) =>
    ProviderRepository.delete(id),
  );
}
```

**Step 2: Update electron/preload.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  projects: {
    findAll: () => ipcRenderer.invoke('projects:findAll'),
    findById: (id: string) => ipcRenderer.invoke('projects:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
  },
  tasks: {
    findAll: () => ipcRenderer.invoke('tasks:findAll'),
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('tasks:findByProjectId', projectId),
    findById: (id: string) => ipcRenderer.invoke('tasks:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  },
  providers: {
    findAll: () => ipcRenderer.invoke('providers:findAll'),
    findById: (id: string) => ipcRenderer.invoke('providers:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('providers:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('providers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
  },
});
```

**Step 3: Create src/lib/api.ts**

```ts
import {
  Project,
  NewProject,
  UpdateProject,
  Task,
  NewTask,
  UpdateTask,
  Provider,
  NewProvider,
  UpdateProvider,
} from '../../electron/database/schema';

export interface Api {
  projects: {
    findAll: () => Promise<Project[]>;
    findById: (id: string) => Promise<Project | undefined>;
    create: (data: NewProject) => Promise<Project>;
    update: (id: string, data: UpdateProject) => Promise<Project>;
    delete: (id: string) => Promise<void>;
  };
  tasks: {
    findAll: () => Promise<Task[]>;
    findByProjectId: (projectId: string) => Promise<Task[]>;
    findById: (id: string) => Promise<Task | undefined>;
    create: (data: NewTask) => Promise<Task>;
    update: (id: string, data: UpdateTask) => Promise<Task>;
    delete: (id: string) => Promise<void>;
  };
  providers: {
    findAll: () => Promise<Provider[]>;
    findById: (id: string) => Promise<Provider | undefined>;
    create: (data: NewProvider) => Promise<Provider>;
    update: (id: string, data: UpdateProvider) => Promise<Provider>;
    delete: (id: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

export const api = window.api;
```

**Step 4: Update electron/main.ts to register handlers**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

import { migrateDatabase } from './database';
import { registerIpcHandlers } from './ipc/handlers';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
```

---

## Task 7: Add React Query

**Files:**

- Modify: `package.json`
- Modify: `src/App.tsx`
- Create: `src/hooks/useProjects.ts`
- Create: `src/hooks/useTasks.ts`
- Create: `src/hooks/useProviders.ts`

**Step 1: Install React Query**

Run: `pnpm add @tanstack/react-query`

**Step 2: Update src/App.tsx**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">
        <h1 className="text-2xl font-bold">Idling</h1>
      </div>
    </QueryClientProvider>
  );
}
```

**Step 3: Create src/hooks/useProjects.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { NewProject, UpdateProject } from '../../electron/database/schema';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.findAll,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.findById(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProject) => api.projects.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProject }) =>
      api.projects.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
```

**Step 4: Create src/hooks/useTasks.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { NewTask, UpdateTask } from '../../electron/database/schema';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks.findAll,
  });
}

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', { projectId }],
    queryFn: () => api.tasks.findByProjectId(projectId),
    enabled: !!projectId,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.tasks.findById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTask) => api.tasks.create(data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTask }) =>
      api.tasks.update(id, data),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
```

**Step 5: Create src/hooks/useProviders.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { NewProvider, UpdateProvider } from '../../electron/database/schema';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: api.providers.findAll,
  });
}

export function useProvider(id: string) {
  return useQuery({
    queryKey: ['providers', id],
    queryFn: () => api.providers.findById(id),
    enabled: !!id,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProvider) => api.providers.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProvider }) =>
      api.providers.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers', id] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.providers.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });
}
```

---

## Task 8: Add Zustand Stores

**Files:**

- Modify: `package.json`
- Create: `src/stores/ui.ts`
- Create: `src/stores/lastVisited.ts`

**Step 1: Install Zustand**

Run: `pnpm add zustand`

**Step 2: Create src/stores/ui.ts**

```ts
import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
```

**Step 3: Create src/stores/lastVisited.ts**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LastVisitedState {
  projectId: string | null;
  setProjectId: (id: string) => void;
}

export const useLastVisitedStore = create<LastVisitedState>()(
  persist(
    (set) => ({
      projectId: null,
      setProjectId: (id) => set({ projectId: id }),
    }),
    { name: 'last-visited' },
  ),
);
```

---

## Task 9: Add TanStack Router

**Files:**

- Modify: `package.json`
- Modify: `electron.vite.config.ts`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/settings.tsx`
- Create: `src/routes/projects/$projectId.tsx`
- Create: `src/routeTree.gen.ts` (auto-generated)
- Modify: `src/App.tsx`

**Step 1: Install TanStack Router**

Run: `pnpm add @tanstack/react-router`
Run: `pnpm add -D @tanstack/router-plugin`

**Step 2: Update electron.vite.config.ts**

```ts
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src'),
      },
    },
    plugins: [
      TanStackRouterVite({
        routesDirectory: 'src/routes',
        generatedRouteTree: 'src/routeTree.gen.ts',
      }),
      react(),
      tailwindcss(),
    ],
  },
});
```

**Step 3: Create src/routes/\_\_root.tsx**

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      {/* Main Sidebar will go here */}
      <div className="flex flex-1 flex-col">
        {/* Header will go here */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

**Step 4: Create src/routes/index.tsx**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // TODO: Redirect to last visited project
    throw redirect({ to: '/settings' });
  },
});
```

**Step 5: Create src/routes/settings.tsx**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
    </div>
  );
}
```

**Step 6: Create src/routes/projects/$projectId.tsx**

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="flex h-full">
      {/* Project Sidebar will go here */}
      <div className="w-64 border-r border-neutral-700 p-4">
        <h2 className="font-semibold">Project: {projectId}</h2>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
```

**Step 7: Update src/App.tsx**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

**Step 8: Generate route tree and verify**

Run: `pnpm dev`
Expected: App starts, redirects to /settings, shows "Settings" page

---

## Task 10: Final Verification

**Step 1: Run linting**

Run: `pnpm lint`
Expected: No errors

**Step 2: Run formatting**

Run: `pnpm format`
Expected: Files formatted

**Step 3: Run dev server**

Run: `pnpm dev`
Expected: Electron app opens, shows settings page, no console errors

**Step 4: Verify database**

Check that `~/Library/Application Support/idling/idling.db` exists and contains the three tables.

---

## Summary

After completing all tasks, the project will have:

- Electron + electron-vite setup with hot reload
- React 19 with TailwindCSS 4
- TanStack Router with file-based routing
- TanStack React Query for data fetching
- Zustand for UI state
- SQLite database with Kysely and migrations
- Repository pattern for data access
- IPC layer connecting renderer to main process
- ESLint + Prettier configured
- TypeScript with path aliases (@/)
