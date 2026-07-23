// @vitest-environment happy-dom
/* eslint-disable sort-imports */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptImagePart } from '@shared/agent-backend-types';

const {
  createPullRequestSpy,
  getPullRequestSpy,
  processImageFileSpy,
  updatePullRequestDescriptionSpy,
  uploadPullRequestAttachmentSpy,
} = vi.hoisted(() => ({
  createPullRequestSpy: vi.fn(),
  getPullRequestSpy: vi.fn(),
  processImageFileSpy: vi.fn(),
  updatePullRequestDescriptionSpy: vi.fn(),
  uploadPullRequestAttachmentSpy: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/features/common/ui-video-gif-converter', () => ({
  isVideoFile: () => false,
  VideoGifConverter: () => null,
}));

vi.mock('@/hooks/use-create-pull-request', () => ({
  useAddPrFileComments: () => ({ mutateAsync: vi.fn() }),
  useCreatePullRequest: () => ({ mutateAsync: createPullRequestSpy }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    azureDevOps: {
      updatePullRequestDescription: updatePullRequestDescriptionSpy,
      uploadPullRequestAttachment: uploadPullRequestAttachmentSpy,
      getPullRequest: getPullRequestSpy,
    },
    preferenceMemory: { recordEvidence: vi.fn() },
  },
}));

vi.mock('@/hooks/use-task-summary', () => ({
  useGenerateSummary: () => ({
    data: undefined,
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useTaskSummary: () => ({ data: undefined }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useAiSkillSlotsSetting: () => ({ data: undefined }),
}));

vi.mock('@/hooks/use-projects', () => ({
  useProject: () => ({
    data: {
      defaultBranch: 'main',
      repoId: 'repo-id',
      repoProjectId: 'repo-project-id',
      repoProviderId: 'provider-id',
    },
  }),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useTask: () => ({
    data: {
      branchName: 'feature/media',
      name: 'Media previews',
      prompt: 'Add media previews',
      sourceBranch: 'main',
      workItemIds: [],
    },
  }),
}));

vi.mock('@/hooks/use-worktree-diff', () => ({
  useWorktreeStatus: () => ({ data: { hasUncommittedChanges: false } }),
}));

vi.mock('@/common/hooks/use-commands', () => ({ useCommands: vi.fn() }));

vi.mock('@/stores/navigation', () => ({
  usePrDraftState: () => ({ prDraft: undefined, setPrDraft: vi.fn() }),
}));

vi.mock('@/stores/background-jobs', () => ({
  useBackgroundJobsStore: (selector: (state: object) => unknown) =>
    selector({
      addRunningJob: vi.fn(() => 'job-id'),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
    }),
}));

vi.mock('@/stores/toasts', () => ({
  useToastStore: (selector: (state: object) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

vi.mock('@/lib/image-utils', () => ({
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  MAX_IMAGES: 5,
  processImageFile: processImageFileSpy,
}));

import { PrCreationForm } from './pr-creation-form';

const GIF_BYTES = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x80, 0xff, 0x21, 0xf9, 0x04,
]);
const BASE64_SENTINEL = btoa(String.fromCharCode(...GIF_BYTES));
const gifImage: PromptImagePart = {
  type: 'image',
  data: 'compressed-agent-data',
  mimeType: 'image/webp',
  filename: 'converted-demo.gif',
  storageData: 'compressed-storage-data',
  storageMimeType: 'image/avif',
};

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

describe('PrCreationForm image previews', () => {
  let container: HTMLDivElement;
  let root: Root;
  const createObjectUrl = vi.fn(
    (_blob: Blob) => 'blob:converted-gif-preview',
  );
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    processImageFileSpy.mockImplementation(
      async (
        _file: File,
        onAttach: (image: PromptImagePart) => void,
      ) => onAttach(gifImage),
    );
    createPullRequestSpy.mockResolvedValue({
      id: 42,
      url: 'https://dev.azure.com/pr/42',
    });
    uploadPullRequestAttachmentSpy.mockResolvedValue({
      url: 'https://dev.azure.com/attachments/converted-demo.gif',
    });
    updatePullRequestDescriptionSpy.mockResolvedValue(undefined);
    getPullRequestSpy.mockResolvedValue({
      description: 'Generated description',
    });
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => root.unmount());
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('wires ready and removed previews through the production form', async () => {
    await act(async () => {
      root.render(
        createElement(PrCreationForm, {
          taskId: 'task-id',
          projectId: 'project-id',
          onSuccess: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (!fileInput) throw new Error('Image input not found');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [
        new File([GIF_BYTES], 'converted-demo.gif', { type: 'image/gif' }),
      ],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const gifBlob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(gifBlob.type).toBe('image/gif');
    expect(new Uint8Array(await gifBlob.arrayBuffer())).toEqual(GIF_BYTES);
    expect(
      container.querySelector<HTMLImageElement>('img[alt="converted-demo.gif"]')
        ?.src,
    ).toBe('blob:converted-gif-preview#jc-mime=image%2Fgif');
    expect(container.innerHTML).not.toContain(BASE64_SENTINEL);

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove converted-demo.gif"]',
    );
    if (!removeButton) throw new Error('Remove attachment button not found');
    await act(async () => removeButton.click());

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:converted-gif-preview');
    expect(container.textContent).not.toContain('converted-demo.gif');
    expect(container.querySelector('img[alt="converted-demo.gif"]')).toBeNull();
    expect(
      container.querySelector<HTMLTextAreaElement>('#pr-description')?.value,
    ).not.toContain('jc-image://');
  });

  it('uploads original GIF bytes when creating the pull request', async () => {
    await act(async () => {
      root.render(
        createElement(PrCreationForm, {
          taskId: 'task-id',
          projectId: 'project-id',
          onSuccess: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const titleInput = container.querySelector<HTMLInputElement>('#pr-title');
    if (!fileInput || !titleInput) throw new Error('PR form input not found');

    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [
        new File([GIF_BYTES], 'converted-demo.gif', { type: 'image/gif' }),
      ],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain('converted-demo.gif');

    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      valueSetter?.call(titleInput, 'Preserve GIF animation');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const createButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Create PR'),
    );
    if (!createButton) throw new Error('Create PR button not found');
    await act(async () => createButton.click());

    await vi.waitFor(() => {
      expect(uploadPullRequestAttachmentSpy).toHaveBeenCalledWith({
        providerId: 'provider-id',
        projectId: 'repo-project-id',
        repoId: 'repo-id',
        pullRequestId: 42,
        fileName: 'converted-demo.gif',
        mimeType: 'image/gif',
        dataBase64: BASE64_SENTINEL,
      });
    });
    expect(createPullRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Preserve GIF animation',
        description: expect.not.stringContaining('jc-image://'),
      }),
    );
    expect(updatePullRequestDescriptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringMatching(
          /Generated description[\s\S]*https:\/\/dev\.azure\.com\/attachments\/converted-demo\.gif/,
        ),
      }),
    );
  });
});
