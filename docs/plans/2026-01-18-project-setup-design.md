# Project Setup Design

Electron app with React, TypeScript, TailwindCSS, and SQLite persistence.

## Stack

- **Runtime:** Electron + electron-vite
- **Frontend:** React 19, TanStack Router, TanStack React Query, Zustand, TailwindCSS
- **Database:** SQLite via better-sqlite3 + Kysely
- **Tooling:** TypeScript, ESLint (flat config + import plugin), Prettier
- **Package manager:** pnpm
- **Agent SDK:** @anthropic-ai/claude-code

## Project Structure

```
idling/
├── electron/
│   ├── main.ts                 # Main process entry
│   ├── preload.ts              # Preload script (IPC bridge)
│   ├── ipc/
│   │   └── handlers.ts         # IPC handler registration
│   └── database/
│       ├── index.ts            # Database initialization
│       ├── schema.ts           # Type definitions
│       ├── migrations/
│       │   └── 001_initial.ts
│       └── repositories/
│           ├── index.ts
│           ├── projects.ts     # ProjectRepository
│           ├── tasks.ts        # TaskRepository
│           └── providers.ts    # ProviderRepository
├── src/
│   ├── main.tsx                # Renderer entry
│   ├── App.tsx                 # Root component with router
│   ├── routes/                 # TanStack Router file-based routes
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── settings.tsx
│   │   └── projects/
│   │       └── $projectId.tsx
│   │           └── tasks/
│   │               └── $taskId.tsx
│   ├── components/             # Shared UI components
│   ├── hooks/                  # React Query hooks
│   ├── stores/                 # Zustand stores
│   └── lib/
│       └── api.ts              # Typed IPC client
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── eslint.config.js
└── .prettierrc
```

## Data Model

```ts
// electron/database/schema.ts
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
  token: string; // Encrypted via safeStorage
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProjectTable {
  id: Generated<string>;
  name: string;
  path: string;
  type: 'local' | 'git-provider';
  providerId: string | null; // FK to providers
  remoteUrl: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string; // FK to projects
  name: string;
  prompt: string;
  status: 'running' | 'waiting' | 'completed' | 'errored';
  sessionId: string | null; // Agent SDK session ID
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

## Repository Pattern

Plain objects that import the db instance directly:

```ts
// electron/database/repositories/projects.ts
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
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) =>
    db.deleteFrom('projects').where('id', '=', id).execute(),
};
```

Same pattern for `TaskRepository`. `ProviderRepository` uses `safeStorage` for token encryption:

```ts
// electron/database/repositories/providers.ts
import { safeStorage } from 'electron';
import { db } from '../index';
import { NewProvider, UpdateProvider } from '../schema';

export const ProviderRepository = {
  findAll: async () => {
    const providers = await db.selectFrom('providers').selectAll().execute();
    return providers.map((p) => ({
      ...p,
      token: safeStorage.decryptString(Buffer.from(p.token, 'base64')),
    }));
  },

  create: (data: NewProvider) => {
    const encrypted = safeStorage.encryptString(data.token).toString('base64');
    return db
      .insertInto('providers')
      .values({ ...data, token: encrypted })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  // update, delete follow same encryption pattern
};
```

## IPC Layer

**Main process handlers:**

```ts
// electron/ipc/handlers.ts
import { ipcMain } from 'electron';
import { ProjectRepository } from '../database/repositories/projects';
import { TaskRepository } from '../database/repositories/tasks';

export function registerIpcHandlers() {
  ipcMain.handle('projects:findAll', () => ProjectRepository.findAll());
  ipcMain.handle('projects:findById', (_, id: string) =>
    ProjectRepository.findById(id),
  );
  ipcMain.handle('projects:create', (_, data) =>
    ProjectRepository.create(data),
  );
  // ... same pattern for tasks, providers
}
```

**Preload bridge:**

```ts
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  projects: {
    findAll: () => ipcRenderer.invoke('projects:findAll'),
    findById: (id: string) => ipcRenderer.invoke('projects:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('projects:create', data),
    // ...
  },
  tasks: {
    /* ... */
  },
  providers: {
    /* ... */
  },
});
```

**Renderer typed client:**

```ts
// src/lib/api.ts
export const api = window.api as {
  projects: {
    findAll: () => Promise<Project[]>;
    findById: (id: string) => Promise<Project | undefined>;
    create: (data: NewProject) => Promise<Project>;
    update: (id: string, data: UpdateProject) => Promise<Project>;
    delete: (id: string) => Promise<void>;
  };
  tasks: {
    /* ... */
  };
  providers: {
    /* ... */
  };
};
```

## React Query Hooks

```ts
// src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: api.projects.findAll });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.findById(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.projects.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
```

Same pattern for tasks and providers.

## Zustand Stores

UI state only (data fetching handled by React Query):

```ts
// src/stores/ui.ts
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

```ts
// src/stores/lastVisited.ts
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

## Initial Migration

```ts
// electron/database/migrations/001_initial.ts
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

## TypeScript Paths

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## ESLint Config

```ts
// eslint.config.js
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': typescript,
      react,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    languageOptions: { parser: tsParser },
    settings: {
      'import/resolver': { typescript: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
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
];
```

## Prettier Config

```json
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

## Dependencies

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.x",
    "@tanstack/react-query": "^5.x",
    "zustand": "^5.x",
    "kysely": "^0.27.x",
    "better-sqlite3": "^11.x"
  },
  "devDependencies": {
    "electron": "^33.x",
    "electron-vite": "^2.x",
    "@anthropic-ai/claude-code": "^1.x",
    "typescript": "^5.x",
    "tailwindcss": "^4.x",
    "@vitejs/plugin-react": "^4.x",
    "@tanstack/router-plugin": "^1.x",
    "eslint": "^9.x",
    "@typescript-eslint/eslint-plugin": "^8.x",
    "@typescript-eslint/parser": "^8.x",
    "eslint-plugin-react": "^7.x",
    "eslint-plugin-react-hooks": "^5.x",
    "eslint-plugin-import": "^2.x",
    "eslint-import-resolver-typescript": "^3.x",
    "prettier": "^3.x"
  }
}
```
