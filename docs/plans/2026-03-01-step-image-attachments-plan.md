# Step Image Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add image attachment support to workflow steps so users can paste/drag/drop images when creating steps via the add-step dialog, with images persisted in the database and sent to the agent backend at step start.

**Architecture:** Add a nullable `images` text column (JSON-stringified `PromptImagePart[]`) to the `task_steps` table. The add-step dialog replaces its plain `<textarea>` with the existing `PromptTextarea` component. The agent service reads step images from the DB when starting a step and includes them in the `PromptPart[]` sent to the backend.

**Tech Stack:** SQLite/Kysely migration, TypeScript shared types, React (PromptTextarea), Electron IPC

---

### Task 1: Database Migration — Add `images` Column

**Files:**
- Create: `electron/database/migrations/033_step_images.ts`
- Modify: `electron/database/migrator.ts:3-33` (register migration)

**Step 1: Create migration file**

Create `electron/database/migrations/033_step_images.ts`:

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('task_steps')
    .addColumn('images', 'text', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('task_steps').dropColumn('images').execute();
}
```

**Step 2: Register migration in migrator.ts**

Add import and entry:

```typescript
import * as m033 from './migrations/033_step_images';
```

Add to `migrations` object:

```typescript
'033_step_images': m033,
```

**Step 3: Commit**

```
feat(db): add images column to task_steps
```

---

### Task 2: Schema & Type Updates

**Files:**
- Modify: `electron/database/schema.ts:145-163` (TaskStepTable)
- Modify: `shared/types.ts` (TaskStep, NewTaskStep, UpdateTaskStep)

**Step 1: Update TaskStepTable in schema.ts**

Add `images: string | null` to the `TaskStepTable` interface, after the `output` field:

```typescript
output: string | null;
images: string | null; // JSON stringified PromptImagePart[]
meta: string | null;
```

**Step 2: Update shared types**

In `shared/types.ts`, add to `TaskStep`:

```typescript
images: PromptImagePart[] | null;
```

Add to `NewTaskStep`:

```typescript
images?: PromptImagePart[] | null;
```

Add to `UpdateTaskStep`:

```typescript
images?: PromptImagePart[] | null;
```

Import `PromptImagePart` from `@shared/agent-backend-types` at the top of the file (or from wherever it's already exported).

**Step 3: Commit**

```
feat(types): add images field to TaskStep schema and types
```

---

### Task 3: Repository — Serialize/Deserialize Images

**Files:**
- Modify: `electron/database/repositories/task-steps.ts:17-37` (toStep function)
- Modify: `electron/database/repositories/task-steps.ts:68-110` (create method)

**Step 1: Update `toStep()` to parse images**

Add after the `output` field mapping:

```typescript
images: row.images ? JSON.parse(row.images) : null,
```

**Step 2: Update `create()` to accept and serialize images**

Add `images?: PromptImagePart[] | null` to the `create` method's `data` parameter type.

Add to the `.values()` call:

```typescript
images: data.images ? JSON.stringify(data.images) : null,
```

**Step 3: Commit**

```
feat(repo): serialize/deserialize step images in task-steps repository
```

---

### Task 4: Step Service — Pass Images Through

**Files:**
- Modify: `electron/services/step-service.ts` (create method)

**Step 1: Update `create()` in StepService**

The `StepService.create()` method calls `TaskStepRepository.create()`. Ensure the `images` field is passed through from the input data to the repository call. Check the method signature and add `images` to the data it forwards.

**Step 2: Commit**

```
feat(step-service): forward images field in step creation
```

---

### Task 5: Agent Service — Read Step Images at Start

**Files:**
- Modify: `electron/services/agent-service.ts:652-659` (start method, PromptPart building)

**Step 1: Include step images in PromptPart array**

In the `start(stepId)` method, after retrieving the step via `resolveAndValidate`, the step object now has an `images` field. Merge step images with pending images:

Replace:

```typescript
const pendingImages = this.pendingImageAttachments.get(session.taskId);
this.pendingImageAttachments.delete(session.taskId);

const parts: PromptPart[] = textPrompt(resolvedPrompt);
if (pendingImages && pendingImages.length > 0) {
  parts.push(...pendingImages);
}
```

With:

```typescript
const pendingImages = this.pendingImageAttachments.get(session.taskId);
this.pendingImageAttachments.delete(session.taskId);

const parts: PromptPart[] = textPrompt(resolvedPrompt);
// Include images persisted on the step
if (step.images && step.images.length > 0) {
  parts.push(...step.images);
}
// Include transient pending images (from initial task creation)
if (pendingImages && pendingImages.length > 0) {
  parts.push(...pendingImages);
}
```

**Step 2: Commit**

```
feat(agent): include step images in prompt parts at start
```

---

### Task 6: IPC Handlers — Pass Images to Auto-Created Steps

**Files:**
- Modify: `electron/ipc/handlers.ts:248-256` (tasks:create handler)
- Modify: `electron/ipc/handlers.ts:356-368` (tasks:createWithWorktree auto-create step)

**Step 1: Update `tasks:create` handler**

The auto-created step should receive images from the task creation payload. The `data` parameter already has `images` from the `NewTask` type. Pass it through:

```typescript
await StepService.create({
  taskId: task.id,
  name: 'Step 1',
  promptTemplate: data.prompt,
  interactionMode: data.interactionMode ?? null,
  modelPreference: data.modelPreference ?? null,
  agentBackend: data.agentBackend ?? null,
  images: data.images ?? null,
});
```

**Step 2: Update `tasks:createWithWorktree` handler**

Same change — pass `data.images` to the auto-created step:

```typescript
const step = await StepService.create({
  taskId: task.id,
  name: 'Step 1',
  promptTemplate: data.prompt,
  interactionMode: data.interactionMode ?? null,
  modelPreference: data.modelPreference ?? null,
  agentBackend: data.agentBackend ?? null,
  images: data.images ?? null,
});
```

**Step 3: Commit**

```
feat(ipc): pass images to auto-created steps on task creation
```

---

### Task 7: UI — Refactor Add Step Dialog

**Files:**
- Modify: `src/features/task/ui-task-panel/add-step-dialog.tsx` (full refactor)
- Modify: `src/features/task/ui-task-panel/index.tsx:450-477` (handleAddStep callback)

**Step 1: Refactor add-step-dialog.tsx**

Replace the component to use `PromptTextarea` instead of plain `<textarea>`:

1. Import `PromptTextarea` from `@/features/common/ui-prompt-textarea`
2. Import `Kbd` from `@/common/ui/kbd`
3. Import `PromptImagePart` from `@shared/agent-backend-types`
4. Add `images` state: `const [images, setImages] = useState<PromptImagePart[]>([])`
5. Add `handleImageAttach` and `handleImageRemove` callbacks
6. Replace `<textarea>` with `<PromptTextarea>`:
   - `value={promptTemplate}`
   - `onChange={setPromptTemplate}`
   - `images={images}`
   - `onImageAttach={handleImageAttach}`
   - `onImageRemove={handleImageRemove}`
   - `onEnterKey` wired to submit (return `true` when cmd+enter to prevent default)
   - `maxHeight={200}`
   - `placeholder="Describe what this step should do..."`
7. Update `onConfirm` prop type to include `images: PromptImagePart[]`
8. Update `handleSubmit` to pass `images`
9. Add `<Kbd shortcut="cmd+enter" />` to the "Add Step" button
10. Reset `images` to `[]` when dialog opens (in the useEffect)

**Step 2: Update handleAddStep in index.tsx**

Update the callback's data type and pass images to `createStep.mutateAsync()`:

```typescript
const handleAddStep = useCallback(
  async (data: {
    promptTemplate: string;
    images: PromptImagePart[];
    agentBackend: AgentBackendType;
    modelPreference: ModelPreference;
  }) => {
    const name = data.promptTemplate.split('\n')[0]?.slice(0, 40) ?? 'Step';
    try {
      const step = await createStep.mutateAsync({
        taskId,
        name,
        promptTemplate: data.promptTemplate,
        images: data.images.length > 0 ? data.images : null,
        agentBackend: data.agentBackend,
        modelPreference: data.modelPreference,
        dependsOn: [],
      });
      setIsAddStepDialogOpen(false);
      setActiveStepId(step.id);
    } catch (error) {
      addToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to create step',
      });
    }
  },
  [taskId, createStep, setActiveStepId, addToast],
);
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 4: Commit**

```
feat(ui): refactor add-step dialog to use PromptTextarea with image support
```

---

### Task 8: Final Verification

**Step 1: Run full lint and type checks**

```bash
pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 2: Commit any remaining fixes**

```
chore: fix lint/type issues from step image attachments
```
