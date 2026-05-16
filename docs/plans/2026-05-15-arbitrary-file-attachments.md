# Arbitrary File Attachments in Prompt Composer

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to attach arbitrary files (not just images) to prompts — either by dropping/picking existing files or writing new file content inline — stored in `.jean-claude/tmp/` and injected as file paths in the prompt.

**Architecture:** New `PromptFilePart` type alongside existing `PromptImagePart`. Files are stored to `<projectPath>/.jean-claude/tmp/<uuid>-<filename>` via a new IPC method. The prompt composer gets a file attachment bar showing thumbnails/chips for attached files. At task creation time, file paths are prepended to the prompt text. A small inline editor overlay lets users write new file content from scratch.

**Tech Stack:** Electron IPC (fs write), React (UI components), Zustand (draft state), uuid for unique filenames.

---

### Task 1: Add `PromptFilePart` type and IPC for writing files to `.jean-claude/tmp/`

**Files:**
- Modify: `shared/agent-backend-types.ts` — add `PromptFilePart` type
- Modify: `electron/preload.ts` — add `fs.writeAttachmentFile` bridge method
- Modify: `electron/ipc/handlers.ts` — add `fs:writeAttachmentFile` handler
- Modify: `src/lib/api.ts` — add type for the new API

**Step 1: Add PromptFilePart type**

In `shared/agent-backend-types.ts`, after `PromptImagePart`:

```ts
export type PromptFilePart = {
  type: 'file';
  /** Absolute path where the file was written */
  filePath: string;
  /** Original filename for display */
  filename: string;
  /** File content (for inline-created files, not stored in draft persistence) */
  content?: string;
};
```

Update the `PromptPart` union:

```ts
export type PromptPart = PromptTextPart | PromptImagePart | PromptFilePart;
```

**Step 2: Add IPC handler for writing attachment files**

In `electron/ipc/handlers.ts`, add a new handler:

```ts
ipcMain.handle(
  'fs:writeAttachmentFile',
  async (
    _event: IpcMainInvokeEvent,
    projectPath: string,
    filename: string,
    content: string,
  ): Promise<string> => {
    const tmpDir = path.join(projectPath, '.jean-claude', 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const safeFilename = `${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(tmpDir, safeFilename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  },
);
```

**Step 3: Add preload bridge**

In `electron/preload.ts`, inside the `fs` object:

```ts
writeAttachmentFile: (projectPath: string, filename: string, content: string) =>
  ipcRenderer.invoke('fs:writeAttachmentFile', projectPath, filename, content),
```

**Step 4: Add type declaration**

In `src/lib/api.ts`, ensure the window.api.fs type includes:

```ts
writeAttachmentFile: (projectPath: string, filename: string, content: string) => Promise<string>;
```

**Step 5: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 6: Commit**

```
feat: add PromptFilePart type and IPC for writing attachment files
```

---

### Task 2: Add IPC for copying dropped/picked files to `.jean-claude/tmp/`

**Files:**
- Modify: `electron/ipc/handlers.ts` — add `fs:copyAttachmentFile` handler
- Modify: `electron/preload.ts` — add bridge method
- Modify: `src/lib/api.ts` — add type

**Step 1: Add IPC handler**

In `electron/ipc/handlers.ts`:

```ts
ipcMain.handle(
  'fs:copyAttachmentFile',
  async (
    _event: IpcMainInvokeEvent,
    projectPath: string,
    sourcePath: string,
  ): Promise<{ filePath: string; filename: string }> => {
    const tmpDir = path.join(projectPath, '.jean-claude', 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const originalFilename = path.basename(sourcePath);
    const safeFilename = `${crypto.randomUUID()}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destPath = path.join(tmpDir, safeFilename);
    await fs.copyFile(sourcePath, destPath);
    return { filePath: destPath, filename: originalFilename };
  },
);
```

**Step 2: Add preload bridge**

```ts
copyAttachmentFile: (projectPath: string, sourcePath: string) =>
  ipcRenderer.invoke('fs:copyAttachmentFile', projectPath, sourcePath),
```

**Step 3: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 4: Commit**

```
feat: add IPC for copying dropped files to .jean-claude/tmp
```

---

### Task 3: Add file attachment state to draft store and PromptTextarea props

**Files:**
- Modify: `src/stores/new-task-draft.ts` — add `files: PromptFilePart[]` to draft
- Modify: `src/features/common/ui-prompt-textarea/index.tsx` — add file-related props

**Step 1: Update draft store**

In `src/stores/new-task-draft.ts`, add to `NewTaskDraft`:

```ts
/** File attachments for the initial prompt (transient, not persisted) */
files: PromptFilePart[];
```

In the `partialize` function, strip files alongside images:

```ts
draft ? { ...draft, images: undefined, files: undefined } : draft,
```

**Step 2: Add file props to PromptTextarea**

In `src/features/common/ui-prompt-textarea/index.tsx`, add to `PromptTextareaProps`:

```ts
/** Attached files */
files?: PromptFilePart[];
/** Called when user attaches a file (drop or file picker) */
onFileAttach?: (file: PromptFilePart) => void;
/** Called when user removes an attached file */
onFileRemove?: (index: number) => void;
/** Called when user wants to create a new file inline */
onFileCreate?: () => void;
```

Destructure them in the component (don't wire anything yet — that's next task).

**Step 3: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 4: Commit**

```
feat: add file attachment state to draft store and textarea props
```

---

### Task 4: Handle file drop/pick in PromptTextarea (non-image files)

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx` — update drag/drop/pick handlers to handle non-image files
- Create: `src/lib/file-attachment-utils.ts` — utility for processing dropped files

**Step 1: Create file attachment utility**

Create `src/lib/file-attachment-utils.ts`:

```ts
import type { PromptFilePart } from '@shared/agent-backend-types';

export const MAX_FILES = 10;
export const MAX_FILE_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Process a dropped/picked file by copying it to .jean-claude/tmp/ via IPC.
 * Returns a PromptFilePart with the destination path.
 */
export async function processAttachmentFile(
  file: File,
  projectPath: string,
  onAttach: (file: PromptFilePart) => void,
  onError?: (message: string) => void,
): Promise<void> {
  if (file.size > MAX_FILE_ATTACHMENT_SIZE) {
    onError?.(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_ATTACHMENT_SIZE / 1024 / 1024} MB)`,
    );
    return;
  }

  // Use the Electron file path if available (dropped from filesystem)
  const electronPath = (file as File & { path?: string }).path;
  if (electronPath) {
    try {
      const result = await window.api.fs.copyAttachmentFile(projectPath, electronPath);
      onAttach({
        type: 'file',
        filePath: result.filePath,
        filename: result.filename,
      });
    } catch (err) {
      onError?.(`Failed to copy file: ${file.name}`);
      console.error('Failed to copy attachment file:', err);
    }
    return;
  }

  // Fallback: read file content and write it
  try {
    const content = await file.text();
    const filePath = await window.api.fs.writeAttachmentFile(
      projectPath,
      file.name,
      content,
    );
    onAttach({
      type: 'file',
      filePath,
      filename: file.name,
    });
  } catch (err) {
    onError?.(`Failed to process file: ${file.name}`);
    console.error('Failed to process attachment file:', err);
  }
}
```

**Step 2: Update PromptTextarea drag/drop handlers**

In `src/features/common/ui-prompt-textarea/index.tsx`:

1. Import `processAttachmentFile` and `MAX_FILES` from `@/lib/file-attachment-utils`
2. Add `projectRoot` (already exists as a prop) usage — this is the project path for writing files

Update `handleDrop` to handle non-image files:

```ts
const handleDrop = useCallback(
  (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);

    // Handle image files (existing behavior)
    if (onImageAttach) {
      const currentImageCount = images?.length ?? 0;
      const allowedImages = MAX_IMAGES - currentImageCount;
      const imageFiles = droppedFiles.filter((f) => f.type.startsWith('image/'));
      for (const file of imageFiles.slice(0, allowedImages)) {
        void processImageFile(file, onImageAttach, showImageError).catch((err) => {
          showImageError('Failed to process image');
          console.error('Failed to process dropped image:', err);
        });
      }
    }

    // Handle non-image files
    if (onFileAttach && projectRoot) {
      const currentFileCount = files?.length ?? 0;
      const allowedFiles = MAX_FILES - currentFileCount;
      const nonImageFiles = droppedFiles.filter((f) => !f.type.startsWith('image/'));
      for (const file of nonImageFiles.slice(0, allowedFiles)) {
        void processAttachmentFile(file, projectRoot, onFileAttach, showImageError);
      }
    }
  },
  [onImageAttach, onFileAttach, images, files, projectRoot, showImageError],
);
```

3. Update the drag overlay text to say "Drop files here" instead of "Drop image here" when file attachments are supported.

4. Update `handleDragOver` to also activate when `onFileAttach` is set (not just `onImageAttach`).

5. Update the file picker button: add a second button (paperclip icon) for non-image files that uses `accept="*"` instead of `accept="image/*"`. Place it next to the image button.

6. Update `handleTextareaDragOver` to also prevent default when `onFileAttach` is set.

**Step 3: Add FileThumbnails component below ImageThumbnails**

After the `ImageThumbnails` render, add:

```tsx
{files && files.length > 0 && (
  <FileThumbnails files={files} onFileRemove={onFileRemove} />
)}
```

Create `FileThumbnails` component at the bottom of the file:

```tsx
function FileThumbnails({
  files,
  onFileRemove,
}: {
  files: PromptFilePart[];
  onFileRemove?: (index: number) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <div
          key={`${file.filename}-${index}`}
          className="group relative flex items-center gap-1.5 rounded border border-glass-border px-2 py-1"
        >
          <Paperclip className="text-ink-3 h-3 w-3 shrink-0" />
          <span className="text-ink-2 max-w-[120px] truncate text-xs">
            {file.filename}
          </span>
          <button
            type="button"
            onClick={() => onFileRemove?.(index)}
            className="text-ink-3 hover:text-ink-1 ml-0.5 hidden group-hover:block"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 5: Commit**

```
feat: handle arbitrary file drop/pick in prompt textarea
```

---

### Task 5: Wire file attachments in new-task overlay and message input

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` — add file handlers, pass to PromptTextarea
- Modify: `src/features/agent/ui-message-input/index.tsx` — add file handlers, pass to PromptTextarea

**Step 1: Update new-task overlay**

Add file attach/remove handlers (mirror image pattern):

```ts
const handleFileAttach = useCallback(
  (file: PromptFilePart) => {
    updateDraft({
      files: [...(draft?.files ?? []), file],
    });
  },
  [draft?.files, updateDraft],
);

const handleFileRemove = useCallback(
  (index: number) => {
    updateDraft({
      files: (draft?.files ?? []).filter((_, i) => i !== index),
    });
  },
  [draft?.files, updateDraft],
);
```

Pass `files`, `onFileAttach`, `onFileRemove` to both `<PromptTextarea>` instances in the overlay.

**Step 2: Update message input**

Add file state and handlers (mirror image pattern):

```ts
const [files, setFiles] = useState<PromptFilePart[]>([]);

const handleFileAttach = useCallback((file: PromptFilePart) => {
  setFiles((prev) => [...prev, file]);
}, []);

const handleFileRemove = useCallback((index: number) => {
  setFiles((prev) => prev.filter((_, i) => i !== index));
}, []);
```

Pass to `<PromptTextarea>`. Clear files on submit alongside images.

Also add `projectRoot` to the `MessageInput` props (it already receives it) — ensure it's passed down for the IPC copy call.

**Step 3: Update handleSubmit in message input to include file parts**

In `handleSubmit`, after building text + image parts, inject file references into the text:

```ts
// Build file context string
if (files.length > 0) {
  const fileRefs = files
    .map((f) => `[Attached file: ${f.filePath}]`)
    .join('\n');
  const textPartIndex = parts.findIndex((p) => p.type === 'text');
  if (textPartIndex >= 0) {
    (parts[textPartIndex] as PromptTextPart).text =
      fileRefs + '\n\n' + (parts[textPartIndex] as PromptTextPart).text;
  } else {
    parts.unshift({ type: 'text', text: fileRefs });
  }
}
```

**Step 4: Update task creation in new-task overlay**

Similarly, in the `handleCmdEnter` flow where `finalPrompt` is built, prepend file references:

```ts
const draftFiles = draft?.files ?? [];
if (draftFiles.length > 0) {
  const fileRefs = draftFiles
    .map((f) => `[Attached file: ${f.filePath}]`)
    .join('\n');
  finalPrompt = fileRefs + '\n\n' + finalPrompt;
}
```

**Step 5: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 6: Commit**

```
feat: wire file attachments through new-task overlay and message input
```

---

### Task 6: Add inline file editor overlay

**Files:**
- Create: `src/features/common/ui-file-editor-dialog/index.tsx` — modal dialog for writing new file content
- Modify: `src/features/common/ui-prompt-textarea/index.tsx` — add "New file" button that opens the editor

**Step 1: Create the file editor dialog component**

Create directory `src/features/common/ui-file-editor-dialog/` with `index.tsx`:

```tsx
import { FilePlus, X } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export function FileEditorDialog({
  onSave,
  onClose,
}: {
  onSave: (filename: string, content: string) => void;
  onClose: () => void;
}) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const filenameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    filenameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filename, content]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    const trimmedFilename = filename.trim();
    if (!trimmedFilename || !content) return;
    onSave(trimmedFilename, content);
  }, [filename, content, onSave]);

  return createPortal(
    <div
      className="bg-bg-0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border-glass-border flex w-[560px] max-w-[90vw] flex-col rounded-lg border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-glass-border px-4 py-3">
          <FilePlus className="text-ink-2 h-4 w-4" />
          <span className="text-ink-1 text-sm font-medium">Create file</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filename input */}
        <div className="border-b border-glass-border px-4 py-2">
          <input
            ref={filenameRef}
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="filename.ext"
            className="text-ink-1 placeholder-ink-3 w-full bg-transparent font-mono text-sm outline-none"
          />
        </div>

        {/* Content editor */}
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="File content..."
            className="text-ink-1 placeholder-ink-3 h-[300px] w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-relaxed outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-glass-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-2 hover:text-ink-1 rounded px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!filename.trim() || !content}
            className="bg-acc hover:bg-acc/90 disabled:bg-glass-medium disabled:text-ink-3 rounded px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed"
          >
            Attach file
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

**Step 2: Add "New file" button to PromptTextarea**

In `src/features/common/ui-prompt-textarea/index.tsx`:

1. Import `FileEditorDialog` and `FilePlus`, `Paperclip` from lucide
2. Add state: `const [showFileEditor, setShowFileEditor] = useState(false);`
3. Add a file input ref for non-image files: `const nonImageFileInputRef = useRef<HTMLInputElement>(null);`
4. In the button area (next to image button), add paperclip button for file picker and a plus button to open editor:

```tsx
{onFileAttach && (
  <>
    <input
      ref={nonImageFileInputRef}
      type="file"
      multiple
      className="hidden"
      onChange={handleNonImageFileSelect}
    />
    <button
      type="button"
      onClick={() => nonImageFileInputRef.current?.click()}
      className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
      title="Attach file"
    >
      <Paperclip className="h-4 w-4" />
    </button>
    {onFileCreate && (
      <button
        type="button"
        onClick={() => setShowFileEditor(true)}
        className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
        title="Create new file"
      >
        <FilePlus className="h-4 w-4" />
      </button>
    )}
  </>
)}
```

5. Add the dialog render at the end of the component (before closing `</div>`):

```tsx
{showFileEditor && onFileCreate && (
  <FileEditorDialog
    onSave={(filename, content) => {
      onFileCreate();  // Unused — actually we need a different approach
      setShowFileEditor(false);
    }}
    onClose={() => setShowFileEditor(false)}
  />
)}
```

**Actually — revise the callback approach.** Instead of `onFileCreate`, the `FileEditorDialog` should call a handler that writes the file via IPC and calls `onFileAttach`. This means the PromptTextarea needs `projectRoot` (already has it) to call the IPC.

Updated approach — add `handleFileCreate` inside PromptTextarea:

```ts
const handleFileCreate = useCallback(
  async (filename: string, content: string) => {
    if (!onFileAttach || !projectRoot) return;
    try {
      const filePath = await window.api.fs.writeAttachmentFile(
        projectRoot,
        filename,
        content,
      );
      onFileAttach({
        type: 'file',
        filePath,
        filename,
      });
    } catch (err) {
      showImageError(`Failed to create file: ${filename}`);
      console.error('Failed to create attachment file:', err);
    }
  },
  [onFileAttach, projectRoot, showImageError],
);
```

Remove `onFileCreate` prop. Dialog calls `handleFileCreate` directly.

**Step 3: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 4: Commit**

```
feat: add inline file editor dialog for creating new file attachments
```

---

### Task 7: Wire file attachments in PromptComposer (work item compose mode)

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx` — add file attachment support mirroring image support

**Step 1: Add file props to PromptComposer**

Add to the component's props interface:

```ts
files?: PromptFilePart[];
onFileAttach?: (file: PromptFilePart) => void;
onFileRemove?: (index: number) => void;
projectRoot?: string | null;
```

**Step 2: Add file drop/pick handling**

Mirror the image drop/paste/pick pattern for non-image files. Update `handleDrop` to also handle non-image files (copy via IPC). Add a paperclip button next to the image button in the header.

**Step 3: Add file chips display**

After the image thumbnails section, add file chips:

```tsx
{files && files.length > 0 && (
  <div className="flex shrink-0 flex-wrap items-center gap-2 px-[18px] py-2"
    style={{ borderTop: '1px solid oklch(1 0 0 / 0.04)' }}
  >
    {files.map((file, index) => (
      <div key={`${file.filename}-${index}`} className="group relative flex items-center gap-1.5 rounded border px-2 py-1" style={{ borderColor: 'oklch(1 0 0 / 0.08)' }}>
        <Paperclip className="text-ink-3 h-3 w-3 shrink-0" />
        <span className="text-ink-2 max-w-[120px] truncate text-xs">{file.filename}</span>
        {onFileRemove && (
          <button type="button" onClick={() => onFileRemove(index)} className="text-ink-3 hover:text-ink-1 ml-0.5 hidden group-hover:block">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    ))}
  </div>
)}
```

**Step 4: Pass file props from new-task overlay**

In `ui-new-task-overlay/index.tsx`, pass `files`, `onFileAttach`, `onFileRemove`, and `projectRoot` to `<PromptComposer>`.

**Step 5: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 6: Commit**

```
feat: wire file attachments in work-item prompt composer
```

---

### Task 8: Update drag overlay text and consolidate attachment limits

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx` — update drag overlay text
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx` — update drag overlay text

**Step 1: Update drag overlay text**

Change "Drop image here" to "Drop files here" in both components when file attachments are supported. Keep "Drop image here" when only image attachments are active.

```tsx
{isDragOver && (
  <div className="border-acc bg-acc-soft absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed">
    <span className="text-acc-ink text-sm">
      {onFileAttach ? 'Drop files here' : 'Drop image here'}
    </span>
  </div>
)}
```

**Step 2: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 3: Commit**

```
fix: update drag overlay text to reflect file attachment support
```

---

### Task 9: Add .jean-claude/tmp/ to .gitignore pattern

**Files:**
- Modify: `electron/services/worktree-service.ts` — ensure `.jean-claude/tmp/` is in gitignore when creating worktrees (or document that users should add it)

**Step 1: Add tmp cleanup on task completion (optional)**

Consider adding cleanup of `.jean-claude/tmp/` files. For now, just ensure the directory is gitignored. Add a `.gitignore` file inside `.jean-claude/tmp/` when creating it:

In the `fs:writeAttachmentFile` handler, after `mkdir`, write a `.gitignore`:

```ts
const gitignorePath = path.join(tmpDir, '.gitignore');
try {
  await fs.access(gitignorePath);
} catch {
  await fs.writeFile(gitignorePath, '*\n!.gitignore\n', 'utf-8');
}
```

Do the same in `fs:copyAttachmentFile`.

**Step 2: Lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`

**Step 3: Commit**

```
chore: add .gitignore to .jean-claude/tmp/ for attachment files
```

---

## Summary of Changes

| Area | What changes |
|------|-------------|
| Types | New `PromptFilePart` in `shared/agent-backend-types.ts` |
| IPC | `fs:writeAttachmentFile`, `fs:copyAttachmentFile` handlers |
| Preload | Two new bridge methods on `window.api.fs` |
| Utils | New `src/lib/file-attachment-utils.ts` |
| Draft store | `files: PromptFilePart[]` field |
| PromptTextarea | File drop/pick/create support, `FileThumbnails` component |
| FileEditorDialog | New component at `src/features/common/ui-file-editor-dialog/` |
| New task overlay | File handlers + wiring to PromptTextarea and PromptComposer |
| Message input | File handlers + wiring to PromptTextarea |
| PromptComposer | File drop/pick/display support |
| Git | `.gitignore` inside `.jean-claude/tmp/` |

## Flow

1. **Drop/pick file** → Electron copies to `.jean-claude/tmp/<uuid>-<name>` → `PromptFilePart` added to state → chip shown in UI → on submit, `[Attached file: /path/to/file]` prepended to prompt text
2. **Create new file** → Editor dialog opens → user types filename + content → saved to `.jean-claude/tmp/<uuid>-<name>` via IPC → same flow as above
