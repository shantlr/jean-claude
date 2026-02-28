# Image Attachments in Prompts

## Overview

Add support for attaching images to prompts sent to agent backends. Users can paste from clipboard, drag-and-drop, or use a file picker to attach images. Both the OpenCode and Claude Code backends support image input through their respective SDKs.

## Data Types

### Parts-Based Prompt Abstraction

Replace the `prompt: string` parameter with a `PromptPart[]` array throughout the pipeline. This is backend-agnostic and extensible to future content types.

```typescript
// shared/agent-backend-types.ts

type PromptTextPart = {
  type: 'text';
  text: string;
};

type PromptImagePart = {
  type: 'image';
  data: string; // base64-encoded image data (no data URI prefix)
  mimeType: string; // "image/png" | "image/jpeg" | "image/gif" | "image/webp"
  filename?: string; // optional original filename
};

type PromptPart = PromptTextPart | PromptImagePart;
```

Convenience helpers in `shared/prompt-utils.ts`:

```typescript
function textPrompt(text: string): PromptPart[] {
  return [{ type: 'text', text }];
}

function getPromptText(parts: PromptPart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}
```

### AgentBackend Interface Change

```typescript
interface AgentBackend {
  start(config: AgentBackendConfig, parts: PromptPart[]): Promise<AgentSession>;
  // ... other methods unchanged
}
```

## Image Compression

Images are compressed client-side (renderer process) using Canvas API before entering the pipeline. Two compression targets:

1. **WebP for agent backends** — sent to the LLM. WebP is widely supported by vision models and offers good size/quality trade-off (~100-200KB for a 1080p screenshot).
2. **AVIF for stored user-prompt messages** — inlined as base64 in the `agent_messages` entry for timeline display. AVIF is ~30-50% smaller than WebP at equivalent quality. Electron 33+ (Chromium 130+) supports AVIF encoding and decoding.

```typescript
// src/lib/image-compression.ts

async function compressImageForAgent(
  file: File,
  maxDim = 1920,
  quality = 0.75,
): Promise<{ data: string; mimeType: string }> {
  const { canvas } = await loadAndResize(file, maxDim);
  const webpUrl = canvas.toDataURL('image/webp', quality);
  return { data: stripDataUriPrefix(webpUrl), mimeType: 'image/webp' };
}

async function compressImageForStorage(
  file: File,
  maxDim = 1920,
  quality = 0.65,
): Promise<{ data: string; mimeType: string }> {
  const { canvas } = await loadAndResize(file, maxDim);

  // Try AVIF first, fall back to WebP
  const avifUrl = canvas.toDataURL('image/avif', quality);
  if (avifUrl.startsWith('data:image/avif')) {
    return { data: stripDataUriPrefix(avifUrl), mimeType: 'image/avif' };
  }
  const webpUrl = canvas.toDataURL('image/webp', quality);
  return { data: stripDataUriPrefix(webpUrl), mimeType: 'image/webp' };
}

async function loadAndResize(file: File, maxDim: number) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((r) => (img.onload = r));

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(img.src);
  return { canvas, width: canvas.width, height: canvas.height };
}
```

When the user attaches an image, both compressions run in parallel. The WebP version goes into `PromptImagePart` for the backend. The AVIF version is used when constructing the stored `user-prompt` markdown entry.

## Backend Adapters

Each backend maps `PromptPart[]` to its SDK-specific format.

### OpenCode Backend

The OpenCode SDK natively supports `FilePartInput` in the `parts` array of `session.prompt()`.

```typescript
// opencode-backend.ts

function toOpenCodeParts(
  parts: PromptPart[],
): Array<TextPartInput | FilePartInput> {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }
    return {
      type: 'file' as const,
      mime: part.mimeType,
      url: `data:${part.mimeType};base64,${part.data}`,
      ...(part.filename ? { filename: part.filename } : {}),
    };
  });
}

// In createEventStream():
client.session.prompt({
  sessionID: sessionId,
  directory: state.cwd,
  parts: toOpenCodeParts(parts), // was: [{ type: 'text', text: prompt }]
  ...(model ? { model } : {}),
  agent: this.getPrimaryAgentName(config.interactionMode),
});
```

### Claude Code Backend

The Claude Code Agent SDK accepts `SDKUserMessage` objects with Anthropic `MessageParam` content blocks. When images are present, switch from the plain string prompt form to structured `SDKUserMessage`.

```typescript
// claude-code-backend.ts

function toClaudeContentBlocks(parts: PromptPart[]): ContentBlockParam[] {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: part.data,
      },
    };
  });
}

// In runSdkGenerator():
const hasImages = parts.some((p) => p.type === 'image');

if (hasImages) {
  // Use SDKUserMessage form for multimodal content
  const userMessage: SDKUserMessage = {
    type: 'user',
    session_id: '',
    message: { role: 'user', content: toClaudeContentBlocks(parts) },
    parent_tool_use_id: null,
  };
  // Use V2 session.send(userMessage) or AsyncIterable<SDKUserMessage>
} else {
  // Plain string prompt (backward compatible)
  query({ prompt: getPromptText(parts), options: queryOptions });
}
```

## Message Pipeline

The full data flow:

```
PromptTextarea (text + images state)
  -> MessageInput.handleSubmit() constructs PromptPart[]
    -> useAgentControls().sendMessage(parts: PromptPart[])
      -> api.agent.sendMessage(taskId, parts)
        -> ipcRenderer.invoke('agent:sendMessage', taskId, parts)
          -> agentService.sendMessage(taskId, parts)
            -> agentService.runBackend(taskId, parts, session)
              -> backend.start(config, parts)
```

### Agent Service Changes

```typescript
// agent-service.ts

async runBackend(
  taskId: string,
  parts: PromptPart[],
  session: InternalSession,
): Promise<void> {
  const promptText = getPromptText(parts);
  const imageParts = parts.filter((p) => p.type === 'image') as PromptImagePart[];

  // Build markdown with AVIF-compressed images inlined
  const markdownParts: string[] = [promptText];
  for (const img of imageParts) {
    const filename = img.filename || 'image';
    // img.storageData/img.storageMimeType contain the AVIF version
    // (set by the caller when constructing parts from UI state)
    const storageData = img.storageData ?? img.data;
    const storageMime = img.storageMimeType ?? img.mimeType;
    markdownParts.push(`![${filename}](data:${storageMime};base64,${storageData})`);
  }

  // Emit single user-prompt entry with markdown-inlined images
  session.eventChannel.push({
    type: 'entry',
    entry: {
      id: nanoid(),
      date: new Date().toISOString(),
      isSynthetic: true,
      type: 'user-prompt',
      value: markdownParts.join('\n\n'),
    },
  });

  // Start backend with WebP-compressed parts (for the LLM)
  await session.backend.start(config, parts);
}
```

### IPC Layer Changes

```typescript
// preload.ts
sendMessage: ((taskId: string, parts: PromptPart[]) =>
  ipcRenderer.invoke(AGENT_CHANNELS.SEND_MESSAGE, taskId, parts),
  // handlers.ts
  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, taskId: string, parts: PromptPart[]) => {
      return agentService.sendMessage(taskId, parts);
    },
  ));

// api.ts
sendMessage: (taskId: string, parts: PromptPart[]) => Promise<void>;
```

### Task Creation

`NewTask.prompt` stays as `string` (for the DB `tasks.prompt` column — used for display, search, task name generation). When creating a task with images:

1. `NewTask` gets an optional `imageAttachments` field (transient, not persisted on the task row)
2. When `agent-service.ts` starts the task, it constructs `PromptPart[]` from `task.prompt` + the image attachments
3. The user-prompt message entry stores the full markdown with inlined images

## Storage

Images are stored inline as base64 in the `user-prompt` entry's `value` field within the `agent_messages` table. The format is standard markdown image syntax:

```markdown
Describe what's wrong with this UI

![screenshot.png](data:image/avif;base64,AAAAIGZ0eXBh...)
```

AVIF compression keeps the base64 payload small (~30-80KB for a typical screenshot). No additional database tables or schema changes are needed.

The `tasks.prompt` column stores only the text portion (no images) for search and display in task lists.

## UI Changes

### PromptTextarea Component

New props:

```typescript
interface PromptTextareaProps {
  // ... existing props ...
  images?: PromptImagePart[];
  onImageAttach?: (image: PromptImagePart) => void;
  onImageRemove?: (index: number) => void;
}
```

### Image Input Methods

**1. Clipboard paste (Cmd+V / Ctrl+V):**

```typescript
const handlePaste = (e: React.ClipboardEvent) => {
  const items = Array.from(e.clipboardData.items);
  const imageItems = items.filter((item) => item.type.startsWith('image/'));

  if (imageItems.length > 0) {
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) processImageFile(file);
    }
  }
  // If no images, default text paste proceeds
};
```

**2. Drag and drop:**

Drop zone handlers on the textarea wrapper. Visual feedback (border highlight) on drag-over.

```typescript
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  for (const file of imageFiles) processImageFile(file);
};
```

**3. File picker button:**

A small image/paperclip icon button near the send button. Opens `<input type="file" accept="image/*" multiple />`.

### Image Processing

```typescript
async function processImageFile(file: File): Promise<void> {
  const [agentVersion, storageVersion] = await Promise.all([
    compressImageForAgent(file),
    compressImageForStorage(file),
  ]);

  onImageAttach?.({
    type: 'image',
    data: agentVersion.data,
    mimeType: agentVersion.mimeType,
    filename: file.name,
    // Extended fields for dual-compression
    storageData: storageVersion.data,
    storageMimeType: storageVersion.mimeType,
  });
}
```

### Image Preview

Attached images render as small thumbnails (64x64px or similar) below the textarea, each with an X button to remove. The preview uses the AVIF storage version (already compressed, smaller to render).

### MessageInput Changes

```typescript
// ui-message-input/index.tsx

interface MessageInputProps {
  onSend: (parts: PromptPart[]) => void; // was: (message: string) => void
  // ... other props unchanged
}

const handleSubmit = useCallback(() => {
  const parts: PromptPart[] = [];
  const trimmed = value.trim();
  if (trimmed) parts.push({ type: 'text', text: trimmed });
  parts.push(...images);

  if (parts.length === 0) return;

  if (isRunning && onQueue) {
    // Queue only supports text for now
    onQueue(trimmed);
  } else {
    onSend(parts);
  }

  setValue('');
  setImages([]);
}, [value, images, ...]);
```

### Model Capability Check

Before showing image attachment UI, check if the model supports images:

- **OpenCode**: Use `Model.capabilities.input.image` from the backend models service
- **Claude Code**: All Claude vision models support images (hardcoded or inferred)
- If the model does not support images, hide the attachment button and show a tooltip on paste/drop attempts

## Normalization

### User Messages (Input Direction)

No normalizer changes needed. The `agent-service.ts` constructs the `user-prompt` entry directly with markdown-inlined images before passing parts to the backend.

### Assistant Messages (Output Direction)

The OpenCode normalizer (`normalize-opencode-message-v2.ts`) currently skips `FilePart` entries in responses. If the agent ever returns image file parts, we should handle them — either rendering inline or as downloadable attachments. This is a follow-up concern and not required for the initial implementation.

## Timeline Rendering

The message stream already renders markdown for `user-prompt` entries. Markdown image syntax `![name](data:...)` produces `<img>` tags via the markdown renderer.

Requirements:

- Ensure the markdown renderer allows `data:` URIs in `<img src>` (check sanitizer config)
- Style images with `max-width: 100%; border-radius; cursor: pointer` for click-to-expand
- Consider lazy loading for images in long timelines

## Implementation Order

1. **Types**: Add `PromptPart`, `PromptTextPart`, `PromptImagePart` to `shared/agent-backend-types.ts` and `textPrompt`/`getPromptText` helpers
2. **Image compression**: Create `src/lib/image-compression.ts` with `compressImageForAgent` and `compressImageForStorage`
3. **Backend interface**: Change `AgentBackend.start()` to accept `PromptPart[]`
4. **OpenCode adapter**: Map `PromptPart[]` to SDK `FilePartInput`
5. **Claude Code adapter**: Map `PromptPart[]` to `SDKUserMessage` content blocks
6. **Agent service**: Update `runBackend()` and `sendMessage()` to handle `PromptPart[]`, emit markdown with inlined images
7. **IPC layer**: Update `sendMessage`, `queuePrompt`, and task creation to carry `PromptPart[]`
8. **PromptTextarea**: Add paste, drag-drop, file picker, and image preview
9. **MessageInput**: Update `onSend` signature and compose `PromptPart[]` on submit
10. **NewTaskOverlay**: Handle image attachments in task creation flow
11. **Timeline rendering**: Verify markdown image rendering, add styling
12. **Model capability gating**: Show/hide image UI based on model capabilities
