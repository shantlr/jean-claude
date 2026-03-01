# Step Image Attachments Design

Add image attachment support to workflow steps, reusing the existing `PromptTextarea` component in the add-step dialog. Images are persisted in the database and sent to the agent backend when the step starts.

## Decisions

- **Persistence**: Images stored in DB (survive restarts, re-sent on step re-run)
- **Storage**: New `images` text column on `task_steps` (JSON-stringified `PromptImagePart[]`)
- **Template resolution**: Images are literal only — template variables (`{{task.prompt}}`, `{{step.X.output}}`) only apply to the text portion
- **UI**: Keep existing modal layout, swap plain textarea for `PromptTextarea`

## Changes

### 1. Database & Schema

**Migration** (`electron/database/migrations/NNN_add_step_images.ts`):
- `ALTER TABLE task_steps ADD COLUMN images TEXT DEFAULT NULL`
- Simple column addition, no table recreation needed

**Schema** (`electron/database/schema.ts`):
- Add `images: string | null` to `TaskStepTable`

**Shared types** (`shared/types.ts`):
- Add `images?: PromptImagePart[] | null` to `TaskStep`, `NewTaskStep`, `UpdateTaskStep`

**Repository** (`electron/database/repositories/task-steps.ts`):
- Serialize `images` to JSON on write (`JSON.stringify`)
- Parse from JSON on read (`JSON.parse`), same pattern as `dependsOn`

**Step service** (`electron/services/step-service.ts`):
- Accept `images` in `create()`, pass through to repository
- No changes to `resolveAndValidate()` (images are literal)

### 2. Agent Service Integration

**Agent service** (`electron/services/agent-service.ts`):
- In `start(stepId)`, read `step.images` from the loaded step data
- Include step images in the `PromptPart[]` array alongside the resolved text prompt
- Existing `setPendingImages` path remains for initial task creation flow
- Both paths merge: `[...textParts, ...stepImages, ...pendingImages]`

### 3. IPC & Hooks

**IPC handlers** (`electron/ipc/handlers.ts`):
- `tasks:create` and `tasks:createWithWorktree`: pass `images` from task creation payload through to `StepService.create()` for the auto-created first step

**Hooks** (`src/hooks/use-steps.ts`):
- `useCreateStep` mutation already passes `NewTaskStep` — gains `images` field from type change

### 4. UI — Add Step Dialog

**Add step dialog** (`src/features/task/ui-task-panel/add-step-dialog.tsx`):
- Replace plain `<textarea>` with `PromptTextarea` component
- Add local `images: PromptImagePart[]` state with `onImageAttach`/`onImageRemove` callbacks
- Update `onConfirm` signature to include `images: PromptImagePart[]`
- Wire Cmd+Enter through `PromptTextarea`'s `onEnterKey` prop
- Add `<Kbd shortcut="cmd+enter" />` hint on the "Add Step" button

**Task panel** (`src/features/task/ui-task-panel/index.tsx`):
- Update `handleAddStep` to pass `images` through to `createStep.mutateAsync()`
