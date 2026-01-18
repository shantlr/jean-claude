# Main Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the main layout with sidebar (Discord-style project tiles), header (macOS traffic lights), and content area.

**Architecture:** MainSidebar displays project tiles with initials, add button, and settings link. Header provides window dragging and traffic light padding on macOS. Platform info exposed via preload script.

**Tech Stack:** React, TanStack Router, Lucide React icons, Tailwind CSS, Kysely migration

---

## Task 1: Install Lucide React

**Files:**

- Modify: `package.json`

**Step 1: Install lucide-react**

Run: `pnpm add lucide-react`

**Step 2: Verify installation**

Run: `pnpm list lucide-react`
Expected: Shows lucide-react in dependencies

---

## Task 2: Add Color Column Migration

**Files:**

- Create: `electron/database/migrations/002_project_color.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

Create `electron/database/migrations/002_project_color.ts`:

```ts
import { Kysely, sql } from 'kysely';

const PROJECT_COLORS = [
  '#5865F2',
  '#57F287',
  '#FEE75C',
  '#EB459E',
  '#ED4245',
  '#9B59B6',
  '#3498DB',
  '#E67E22',
  '#1ABC9C',
];

function getRandomColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('color', 'text', (col) => col.notNull().defaultTo('#5865F2'))
    .execute();

  // Backfill existing projects with random colors
  const projects = await sql<{ id: string }>`SELECT id FROM projects`.execute(
    db,
  );
  for (const project of projects.rows) {
    await sql`UPDATE projects SET color = ${getRandomColor()} WHERE id = ${project.id}`.execute(
      db,
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('color').execute();
}
```

**Step 2: Update migrator.ts**

Modify `electron/database/migrator.ts` to add the new migration:

```ts
import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';
import * as m002 from './migrations/002_project_color';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
```

**Step 3: Update schema.ts**

Add `color` field to `ProjectTable` in `electron/database/schema.ts`:

```ts
export interface ProjectTable {
  id: Generated<string>;
  name: string;
  path: string;
  type: 'local' | 'git-provider';
  providerId: string | null;
  remoteUrl: string | null;
  color: string;
  createdAt: Generated<string>;
  updatedAt: string;
}
```

**Step 4: Verify migration runs**

Run: `pnpm dev`
Expected: Console shows "Migration \"002_project_color\" executed successfully"

---

## Task 3: Create Color Utility

**Files:**

- Create: `src/lib/colors.ts`

**Step 1: Create the colors utility**

Create `src/lib/colors.ts`:

```ts
export const PROJECT_COLORS = [
  '#5865F2', // blurple
  '#57F287', // green
  '#FEE75C', // yellow
  '#EB459E', // pink
  '#ED4245', // red
  '#9B59B6', // purple
  '#3498DB', // blue
  '#E67E22', // orange
  '#1ABC9C', // teal
] as const;

export function getRandomColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
```

---

## Task 4: Expose Platform Info via Preload

**Files:**

- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Update preload.ts**

Add platform to the exposed API in `electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
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

**Step 2: Update api.ts**

Add platform to the Api interface in `src/lib/api.ts`:

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
  platform: NodeJS.Platform;
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

---

## Task 5: Create Header Component

**Files:**

- Create: `src/components/Header.tsx`

**Step 1: Create Header component**

Create `src/components/Header.tsx`:

```tsx
import { api } from '@/lib/api';

export function Header() {
  const isMac = api.platform === 'darwin';

  return (
    <header
      className="flex h-10 items-center border-b border-neutral-800 bg-neutral-900"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Traffic light padding on macOS */}
      {isMac && <div className="w-[70px]" />}

      <div className="flex-1" />

      {/* Usage placeholder - Phase 4 */}
      <div
        className="px-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Rate limits will go here */}
      </div>
    </header>
  );
}
```

---

## Task 6: Create ProjectTile Component

**Files:**

- Create: `src/components/ProjectTile.tsx`

**Step 1: Create ProjectTile component**

Create `src/components/ProjectTile.tsx`:

```tsx
import { Link } from '@tanstack/react-router';

import { getInitials } from '@/lib/colors';

interface ProjectTileProps {
  id: string;
  name: string;
  color: string;
}

export function ProjectTile({ id, name, color }: ProjectTileProps) {
  const initials = getInitials(name);

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className="group relative flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-all hover:rounded-2xl hover:brightness-110 data-[status=active]:ring-2 data-[status=active]:ring-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </Link>
  );
}
```

---

## Task 7: Create MainSidebar Component

**Files:**

- Create: `src/components/MainSidebar.tsx`

**Step 1: Create MainSidebar component**

Create `src/components/MainSidebar.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import { Plus, Settings } from 'lucide-react';

import { useProjects } from '@/hooks/useProjects';

import { ProjectTile } from './ProjectTile';

export function MainSidebar() {
  const { data: projects } = useProjects();

  return (
    <aside className="flex h-full w-[72px] flex-col border-r border-neutral-800 bg-neutral-900">
      {/* Project tiles */}
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-3 py-3">
        {projects?.map((project) => (
          <ProjectTile
            key={project.id}
            id={project.id}
            name={project.name}
            color={project.color}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center gap-2 border-t border-neutral-800 px-3 py-3">
        {/* Add project button */}
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-neutral-600 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Settings button */}
        <Link
          to="/settings"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white data-[status=active]:bg-neutral-800 data-[status=active]:text-white"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </aside>
  );
}
```

---

## Task 8: Integrate Layout Components

**Files:**

- Modify: `src/routes/__root.tsx`

**Step 1: Update \_\_root.tsx**

Update `src/routes/__root.tsx` to include the sidebar and header:

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Header } from '@/components/Header';
import { MainSidebar } from '@/components/MainSidebar';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <MainSidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

---

## Task 9: Configure Frameless Window for macOS

**Files:**

- Modify: `electron/main.ts`

**Step 1: Read current main.ts**

Read `electron/main.ts` to see current window configuration.

**Step 2: Update BrowserWindow options**

Update the `createWindow` function to use frameless window with traffic lights on macOS:

```ts
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  // ... rest of function
}
```

---

## Task 10: Verify and Fix Lint Issues

**Step 1: Run linting**

Run: `pnpm lint`
Expected: No errors (fix any that appear)

**Step 2: Run formatting**

Run: `pnpm format`
Expected: Files formatted

**Step 3: Run dev server**

Run: `pnpm dev`
Expected:

- App opens with sidebar on left
- Header at top with traffic lights on macOS
- Settings page visible
- Sidebar shows add project button and settings gear
- Traffic lights visible and functional on macOS

---

## Summary

After completing all tasks:

- MainSidebar with Discord-style project tiles (48x48 rounded squares with initials)
- Project tiles use stored color with user-selectable option later
- Add project button with dashed border and plus icon
- Settings button with gear icon, highlights when active
- Header with macOS traffic light padding (70px on darwin)
- Header is draggable for window movement
- Lucide React icons for Plus and Settings
- Database migration adds color column to projects
- Platform info exposed via preload for conditional styling
