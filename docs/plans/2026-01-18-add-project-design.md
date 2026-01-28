# Add Project Feature Design

## Overview

Allow users to add local folder projects through a dedicated page with native folder picker and editable form.

## User Flow

1. Click "+" button in sidebar → Navigate to `/projects/new`
2. Page shows source type cards (starting with "Local Folder")
3. Click "Local Folder" card → Native OS folder picker opens
4. Select folder → Form appears with pre-filled values:
   - **Name**: Inferred from `package.json` name field, or folder name as fallback (editable)
   - **Path**: Selected folder path (read-only display)
   - **Color**: Random color (shown as colored preview)
5. User reviews/edits name → Clicks "Add Project" button
6. Project created → Redirect to `/projects/$projectId`

## Page States

### State 1: Source Selection

- Centered layout with cards for each project source type
- For MVP: single "Local Folder" card with folder icon
- Extensible for ADO/GitHub/GitLab cards later

### State 2: Form (after folder selected)

- Back button to return to source selection
- Form fields:
  - Name (text input, required, pre-filled)
  - Path (read-only display of selected path)
  - Color preview (auto-assigned)
- "Add Project" submit button

## Implementation

### Files to Create

**`src/routes/projects.new.tsx`**

- Add project page with two states (source selection, form)
- Uses `useCreateProject()` hook for mutation
- Uses `useNavigate()` to redirect after creation

### Files to Modify

**`src/components/main-sidebar.tsx`**

- Change "+" button from `<button>` to `<Link to="/projects/new">`

**`electron/ipc/handlers.ts`**

- Add `dialog:openDirectory` handler using Electron's `dialog.showOpenDialog()`
- Add `fs:readPackageJson` handler to read and parse package.json from a path

**`electron/preload.ts`**

- Expose `dialog.openDirectory()` method
- Expose `fs.readPackageJson()` method

**`src/lib/api.ts`**

- Add `dialog` namespace with `openDirectory()` type
- Add `fs` namespace with `readPackageJson()` type

### IPC Handlers

```typescript
// dialog:openDirectory
// Returns: string | null (path or null if canceled)
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// fs:readPackageJson
// Returns: { name?: string } | null (parsed package.json or null if not found)
ipcMain.handle('fs:readPackageJson', async (_, dirPath: string) => {
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return { name: pkg.name };
  } catch {
    return null;
  }
});
```

### Name Inference Logic (in renderer)

```typescript
async function inferProjectName(folderPath: string): Promise<string> {
  const pkg = await window.api.fs.readPackageJson(folderPath);
  if (pkg?.name) {
    return pkg.name;
  }
  // Fallback: extract folder name from path
  return folderPath.split(/[/\\]/).pop() || 'Untitled';
}
```

### Form Submission

```typescript
const createProject = useCreateProject();

async function handleSubmit(name: string, path: string) {
  const project = await createProject.mutateAsync({
    name,
    path,
    type: 'local',
    color: getRandomColor(),
    updatedAt: new Date().toISOString(),
  });
  navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
}
```

## UI Components

### Source Selection Card

- 120x120px card with:
  - Folder icon (centered)
  - "Local Folder" label below
- Hover state: subtle border highlight
- Future: additional cards for ADO, GitHub, GitLab

### Form Layout

- Max-width container (~400px) centered
- Standard form styling consistent with app theme
- Color preview: small colored square next to path display
