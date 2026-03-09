# Work Item Image Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically extract images from Azure DevOps work item HTML (description/reproSteps) and inject them as `PromptImagePart[]` into the task prompt when creating tasks from work items.

**Architecture:** Work item HTML contains `<img>` tags pointing to Azure DevOps attachment URLs that require PAT authentication. We add a new IPC endpoint to download these images as base64 in the main process (which has PAT access). The renderer extracts image URLs from work item HTML, calls the IPC endpoint to fetch them, compresses them, and merges them into the draft images before task creation.

**Tech Stack:** Electron IPC, Azure DevOps REST API (authenticated image fetch), Canvas-based image compression, TurndownService (HTML→Markdown)

---

### Task 1: Add IPC endpoint to fetch Azure DevOps images as base64

The main process already has `fetchAuthenticatedImageStream` in `azure-image-proxy-service.ts` for the protocol handler. We need a new function that returns the image as a base64 string + MIME type, and wire it up via IPC.

**Files:**
- Modify: `electron/services/azure-image-proxy-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add `fetchImageAsBase64` function to `azure-image-proxy-service.ts`**

Add this function after the existing `fetchAuthenticatedImageStream` function (around line 97):

```typescript
/**
 * Fetches an image from Azure DevOps with PAT authentication and returns
 * it as a base64-encoded string with its MIME type.
 */
export async function fetchImageAsBase64(params: {
  providerId: string;
  imageUrl: string;
}): Promise<{ data: string; mimeType: string } | null> {
  const { providerId, imageUrl } = params;

  // Validate the URL is an Azure DevOps URL
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    dbg.azureImageProxy('Invalid URL: %s', imageUrl);
    return null;
  }

  if (
    !url.hostname.endsWith('dev.azure.com') &&
    !url.hostname.endsWith('visualstudio.com')
  ) {
    dbg.azureImageProxy('Rejected non-Azure DevOps URL: %s', imageUrl);
    return null;
  }

  // Get provider and token
  const provider = await ProviderRepository.findById(providerId);
  if (!provider?.tokenId) {
    dbg.azureImageProxy('Provider or token not found: %s', providerId);
    return null;
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    dbg.azureImageProxy('Token not found for provider: %s', providerId);
    return null;
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        Authorization: createAuthHeader(token),
      },
    });

    if (!response.ok) {
      dbg.azureImageProxy(
        'Failed to fetch image: %d %s',
        response.status,
        response.statusText,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = buffer.toString('base64');
    const mimeType =
      response.headers.get('content-type') || 'application/octet-stream';

    return { data, mimeType };
  } catch (error) {
    dbg.azureImageProxy('Error fetching image: %O', error);
    return null;
  }
}
```

**Step 2: Add IPC handler in `handlers.ts`**

Add this after the existing `azureDevOps:addPullRequestFileComment` handler (look for the end of the azureDevOps handlers block). Import `fetchImageAsBase64` from the service.

Add to imports at top of file:
```typescript
import { fetchImageAsBase64 } from '../services/azure-image-proxy-service';
```

Add handler:
```typescript
ipcMain.handle(
  'azureDevOps:fetchImageAsBase64',
  (
    _,
    params: {
      providerId: string;
      imageUrl: string;
    },
  ) => fetchImageAsBase64(params),
);
```

**Step 3: Add preload bridge method in `preload.ts`**

Add inside the `azureDevOps` object (after `addPullRequestFileComment`):

```typescript
fetchImageAsBase64: (params: { providerId: string; imageUrl: string }) =>
  ipcRenderer.invoke('azureDevOps:fetchImageAsBase64', params),
```

**Step 4: Add type to `Api` interface in `src/lib/api.ts`**

Add inside the `azureDevOps` section of the `Api` interface (after `addPullRequestFileComment`):

```typescript
fetchImageAsBase64: (params: {
  providerId: string;
  imageUrl: string;
}) => Promise<{ data: string; mimeType: string } | null>;
```

**Step 5: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 6: Commit**

```bash
git add electron/services/azure-image-proxy-service.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add IPC endpoint to fetch Azure DevOps images as base64"
```

---

### Task 2: Add image URL extraction utility to prompt composer

Extract Azure DevOps image URLs from work item HTML before Turndown strips them. This utility parses the raw HTML and returns unique image URLs.

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx`

**Step 1: Add `extractImageUrls` function**

Add this function after the `escapeXml` helper (line 19) and before `generateInitialTemplate`:

```typescript
/**
 * Azure DevOps attachment URL pattern.
 * Matches URLs like:
 *   https://dev.azure.com/Org/ProjectGuid/_apis/wit/attachments/AttachmentGuid?fileName=image.png
 *   https://org.visualstudio.com/Project/_apis/wit/attachments/...
 */
const AZURE_IMAGE_URL_PATTERN =
  /https:\/\/(?:dev\.azure\.com|[^\s"'<>]+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\/[^"'\s<>]*/gi;

/**
 * Extracts unique Azure DevOps image URLs from work item HTML fields.
 * Looks at both description and reproSteps.
 */
export function extractWorkItemImageUrls(
  workItems: AzureDevOpsWorkItem[],
): string[] {
  const urls = new Set<string>();

  for (const workItem of workItems) {
    const { description, reproSteps } = workItem.fields;

    for (const html of [description, reproSteps]) {
      if (!html) continue;
      const matches = html.matchAll(AZURE_IMAGE_URL_PATTERN);
      for (const match of matches) {
        urls.add(match[0]);
      }
    }
  }

  return [...urls];
}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/new-task/ui-prompt-composer/index.tsx
git commit -m "feat: add utility to extract image URLs from work item HTML"
```

---

### Task 3: Fetch and inject work item images when advancing to compose step

When the user selects work items and advances to the compose step, extract image URLs, fetch them via the new IPC endpoint, compress them, and add them to the draft images.

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Import the extraction utility and compression**

Add to the imports at the top of the file:

```typescript
import {
  PromptComposer,
  generateInitialTemplate,
  expandTemplate,
  extractWorkItemImageUrls,
} from '../ui-prompt-composer';
```

Also import `compressImage`:

```typescript
import { compressImage } from '@/lib/image-compression';
```

**Step 2: Modify `advanceToCompose` to extract and fetch images**

Replace the existing `advanceToCompose` callback (around line 415-420) with:

```typescript
// Advance to compose step and extract work item images
const advanceToCompose = useCallback(async () => {
  if (!canAdvanceToCompose) return;
  const template = generateInitialTemplate(draft?.workItemIds ?? []);
  setPromptTemplate(template);
  updateDraft({ searchStep: 'compose' });

  // Extract and fetch images from work item HTML in background
  const providerId = selectedProject?.workItemProviderId;
  if (!providerId) return;

  const imageUrls = extractWorkItemImageUrls(selectedWorkItems);
  if (imageUrls.length === 0) return;

  // Fetch images in parallel (limit to 5 max, matching the prompt textarea limit)
  const existingImages = draft?.images ?? [];
  const slotsAvailable = 5 - existingImages.length;
  if (slotsAvailable <= 0) return;

  const urlsToFetch = imageUrls.slice(0, slotsAvailable);

  const fetchedImages = await Promise.all(
    urlsToFetch.map(async (imageUrl) => {
      try {
        const result =
          await window.api.azureDevOps.fetchImageAsBase64({
            providerId,
            imageUrl,
          });
        if (!result) return null;

        // Convert base64 to Blob for compression
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: result.mimeType });

        // Compress using existing image compression utility
        const compressed = await compressImage(blob);

        // Extract filename from URL
        const urlObj = new URL(imageUrl);
        const fileName =
          urlObj.searchParams.get('fileName') ?? 'work-item-image';

        return {
          type: 'image' as const,
          data: compressed.agent.data,
          mimeType: compressed.agent.mimeType,
          filename: fileName,
          storageData: compressed.storage.data,
          storageMimeType: compressed.storage.mimeType,
        };
      } catch (error) {
        console.error('Failed to fetch work item image:', imageUrl, error);
        return null;
      }
    }),
  );

  const validImages = fetchedImages.filter(
    (img): img is PromptImagePart => img !== null,
  );

  if (validImages.length > 0) {
    updateDraft({
      images: [...existingImages, ...validImages],
    });
  }
}, [
  canAdvanceToCompose,
  draft?.workItemIds,
  draft?.images,
  selectedWorkItems,
  selectedProject?.workItemProviderId,
  updateDraft,
]);
```

**Step 3: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 4: Run lint**

Run: `pnpm lint --fix`
Expected: No errors (or auto-fixed)

**Step 5: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx
git commit -m "feat: auto-extract and attach images from work items when composing prompt"
```

---

### Task 4: Strip image markdown from expanded prompt text

When images are extracted and attached as `PromptImagePart`, the markdown `![](url)` references in the expanded prompt are redundant (the agent can't fetch them anyway since they need PAT auth). Remove them from the expanded text to avoid confusion.

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx`

**Step 1: Configure Turndown to strip images**

The `turndown` instance is created at module level (line 7-10). We need to add a rule that replaces `<img>` tags pointing to Azure DevOps attachment URLs with empty strings. Add this rule after the turndown instance creation:

```typescript
// Strip Azure DevOps attachment images from the markdown output.
// These images are extracted separately and attached as PromptImagePart[].
turndown.addRule('strip-azure-images', {
  filter: (node) => {
    if (node.nodeName !== 'IMG') return false;
    const src = node.getAttribute('src') ?? '';
    return AZURE_IMAGE_URL_PATTERN.test(src);
  },
  replacement: () => '',
});
```

**Important:** The `AZURE_IMAGE_URL_PATTERN` regex uses the `g` flag, so we need to reset `lastIndex` or use a fresh test. Actually, since `filter` is called per-node and `.test()` on a global regex advances `lastIndex`, we should either:
- Use a non-global regex for filtering, OR
- Reset `lastIndex` before each test

Better approach — use a separate non-global regex for the filter:

```typescript
const AZURE_ATTACHMENT_URL_TEST =
  /https:\/\/(?:dev\.azure\.com|[^\s"'<>]+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\//i;

// Strip Azure DevOps attachment images from the markdown output.
// These images are extracted separately and attached as PromptImagePart[].
turndown.addRule('strip-azure-images', {
  filter: (node) => {
    if (node.nodeName !== 'IMG') return false;
    const src = node.getAttribute('src') ?? '';
    return AZURE_ATTACHMENT_URL_TEST.test(src);
  },
  replacement: () => '',
});
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm lint --fix`
Expected: No errors

**Step 4: Commit**

```bash
git add src/features/new-task/ui-prompt-composer/index.tsx
git commit -m "feat: strip Azure DevOps attachment images from work item markdown (extracted separately)"
```

---

### Task 5: Show image thumbnails in the compose step

Currently the compose step (`PromptComposer` component) only shows the template editor and preview. If images were extracted, users should see them. The new task overlay already renders image thumbnails from `draft.images` in prompt mode — we need to ensure they're also visible in the compose step.

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (JSX section for the compose step)

**Step 1: Check current compose step rendering**

Look for where `searchStep === 'compose'` renders `<PromptComposer>` in the JSX. We need to add image thumbnails below or alongside the composer. Find the section in the JSX where the compose step is rendered — it should show the `PromptComposer` component.

The image thumbnail grid is already rendered for prompt mode via the `PromptTextarea` component's built-in image support. For the compose step, we need to add a similar thumbnail strip. Look at how `draft?.images` are rendered in the existing prompt mode section and replicate that pattern in the compose step area.

Add a thumbnail strip below the `PromptComposer` component when images exist:

```tsx
{/* Image thumbnails from work item extraction */}
{draft?.images && draft.images.length > 0 && (
  <div className="flex shrink-0 gap-2 px-1 pb-2">
    {draft.images.map((image, index) => (
      <div
        key={index}
        className="group relative h-12 w-12 shrink-0 overflow-hidden rounded border border-neutral-700"
      >
        <img
          src={`data:${image.mimeType};base64,${image.data}`}
          alt={image.filename ?? 'Work item image'}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={() => handleImageRemove(index)}
          className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <span className="text-xs text-white">✕</span>
        </button>
      </div>
    ))}
  </div>
)}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm lint --fix`
Expected: No errors

**Step 4: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx
git commit -m "feat: show extracted work item image thumbnails in compose step"
```

---

### Task 6: Final verification

**Step 1: Run full lint check**

Run: `pnpm lint --fix && pnpm lint`
Expected: No errors

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Install dependencies (in case any new ones needed)**

Run: `pnpm install`
Expected: No errors

---

## Summary of Changes

1. **Main process** (`azure-image-proxy-service.ts`): New `fetchImageAsBase64()` function that downloads Azure DevOps images with PAT auth and returns base64 + MIME type
2. **IPC layer** (`handlers.ts`, `preload.ts`, `api.ts`): New `azureDevOps:fetchImageAsBase64` channel
3. **Prompt composer** (`ui-prompt-composer/index.tsx`): `extractWorkItemImageUrls()` utility + Turndown rule to strip Azure attachment `<img>` tags
4. **New task overlay** (`ui-new-task-overlay/index.tsx`): `advanceToCompose` now extracts image URLs, fetches them via IPC, compresses them, and adds to draft images. Image thumbnails shown in compose step.

## Data flow

```
Work Item HTML (description/reproSteps)
  ├── extractWorkItemImageUrls() → image URLs
  │     └── fetchImageAsBase64 (IPC) → base64 data
  │           └── compressImage() → PromptImagePart[]
  │                 └── draft.images → sent with task creation
  │
  └── Turndown (strip Azure imgs) → clean markdown text
        └── expandTemplate() → prompt text (no broken image refs)
```
