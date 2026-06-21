import * as fs from 'fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';


const {
  appGetPathMock,
  findProjectByIdMock,
  generateTextMock,
  getSettingMock,
  decryptMock,
  resolveAiSkillSlotMock,
  updateProjectMock,
  updateSummaryIfBlankMock,
} = vi.hoisted(() => ({
  appGetPathMock: vi.fn(),
  decryptMock: vi.fn(),
  findProjectByIdMock: vi.fn(),
  generateTextMock: vi.fn(),
  getSettingMock: vi.fn(),
  resolveAiSkillSlotMock: vi.fn(),
  updateProjectMock: vi.fn(),
  updateSummaryIfBlankMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: appGetPathMock,
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../database/repositories/projects', () => ({
  ProjectRepository: {
    findById: findProjectByIdMock,
    update: updateProjectMock,
    updateSummaryIfBlank: updateSummaryIfBlankMock,
  },
}));

vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: getSettingMock,
  },
}));

vi.mock('./encryption-service', () => ({
  encryptionService: {
    decrypt: decryptMock,
  },
}));

vi.mock('./ai-generation-service', () => ({
  generateText: generateTextMock,
}));

vi.mock('./ai-skill-slot-resolver', () => ({
  resolveAiSkillSlot: resolveAiSkillSlotMock,
}));

import { generateProjectLogo } from './project-logo-service';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe('generateProjectLogo', () => {
  let userDataDir: string;

  const project = {
    id: 'project-1',
    name: 'Jean Claude',
    path: '/workspace/jean-claude',
    color: '#7c3aed',
    logoPath: null,
    logoSource: null,
    defaultAgentBackend: 'claude-code',
    defaultAgentModelPreference: 'default',
    aiSkillSlots: null,
    summary: 'Desktop app for managing coding agents across projects.',
  };

  beforeEach(async () => {
    userDataDir = '/tmp/jc-logo-test';
    vol.mkdirSync(userDataDir, { recursive: true });
    appGetPathMock.mockReturnValue(userDataDir);
    findProjectByIdMock.mockResolvedValue(project);
    updateProjectMock.mockReset();
    updateProjectMock.mockImplementation(
      async (_id: string, update: Record<string, unknown>) => ({
        ...project,
        ...update,
      }),
    );
    updateSummaryIfBlankMock.mockReset();
    updateSummaryIfBlankMock.mockImplementation(
      async (_id: string, summary: string) => ({
        ...project,
        summary,
      }),
    );
    getSettingMock.mockReset();
    getSettingMock.mockResolvedValue({
      openAiApiKey: '',
      openAiImageGenerationEnabled: false,
      openAiImageModel: 'gpt-image-2',
    });
    decryptMock.mockReset();
    generateTextMock.mockReset();
    resolveAiSkillSlotMock.mockReset();
    resolveAiSkillSlotMock.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (userDataDir) {
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  it('generates and stores a PNG logo with OpenAI image generation when configured', async () => {
    const imageBytes = PNG_BYTES;
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
    });
    decryptMock.mockReturnValue('test-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    const result = await generateProjectLogo({ projectId: 'project-1' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: expect.stringContaining('friendly geometric adventurer mascot'),
      }),
    );
    expect(result.logoPath).toMatch(/\.png$/);
    expect(result.logoPath).not.toBeNull();
    expect(result.logoPath).toContain('/project-logos/project-1/generated-');
    await expect(fs.readFile(result.logoPath!)).resolves.toEqual(imageBytes);
  });

  it('uses the configured OpenAI image model', async () => {
    const imageBytes = PNG_BYTES;
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-custom',
    });
    decryptMock.mockReturnValue('stored-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    await generateProjectLogo({ projectId: 'project-1' });

    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        model: 'gpt-image-custom',
      }),
    );
  });

  it('uses OpenAI image edits when a base image is configured', async () => {
    const imageBytes = PNG_BYTES;
    const baseImagePath = '/tmp/base-logo.png';
    vol.writeFileSync(baseImagePath, PNG_BYTES);
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
      openAiBaseImagePath: baseImagePath,
      openAiBaseImageName: 'base-logo.png',
    });
    decryptMock.mockReturnValue('stored-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    await generateProjectLogo({ projectId: 'project-1' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer stored-key',
        }),
        body: expect.any(FormData),
      }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = request?.body;
    expect(body).toBeInstanceOf(FormData);
    const prompt = (body as FormData).get('prompt');
    expect(prompt).toContain('Create one polished square app icon');
    expect(prompt).toContain('Follow the original image');
    expect(prompt).toContain(
      'Desktop app for managing coding agents across projects.',
    );
    expect(prompt).not.toContain('Style requirements');
  });

  it('adds custom prompt context to generated logo prompts', async () => {
    const imageBytes = PNG_BYTES;
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
      openAiLogoPromptContext: 'Use the cozy adventurer icon family.',
    });
    decryptMock.mockReturnValue('stored-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    await generateProjectLogo({
      projectId: 'project-1',
      customPrompt: 'Add a tiny terminal and purple backpack.',
    });

    const [, request] = vi.mocked(fetch).mock.calls[0];
    const prompt = JSON.parse(String(request?.body)).prompt;
    expect(prompt).toContain('Use the cozy adventurer icon family.');
    expect(prompt).toContain('Add a tiny terminal and purple backpack.');
  });

  it('adds custom prompt context to edited logo prompts', async () => {
    const imageBytes = PNG_BYTES;
    const baseImagePath = '/tmp/base-logo.png';
    vol.writeFileSync(baseImagePath, PNG_BYTES);
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
      openAiBaseImagePath: baseImagePath,
      openAiBaseImageName: 'base-logo.png',
    });
    decryptMock.mockReturnValue('stored-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    await generateProjectLogo({
      projectId: 'project-1',
      customPrompt: 'Make the mascot hold a map.',
    });

    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = request?.body;
    expect(body).toBeInstanceOf(FormData);
    const prompt = (body as FormData).get('prompt');
    expect(prompt).toContain('Make the mascot hold a map.');
  });

  it('generates and stores a project summary when missing', async () => {
    const imageBytes = PNG_BYTES;
    findProjectByIdMock.mockResolvedValue({
      ...project,
      summary: null,
    });
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
    });
    decryptMock.mockReturnValue('stored-key');
    generateTextMock.mockResolvedValue({
      summary: 'Desktop app for coordinating multiple coding agents.',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: imageBytes.toString('base64') }],
      }),
    } as Response);

    await generateProjectLogo({ projectId: 'project-1' });

    expect(resolveAiSkillSlotMock).toHaveBeenCalledWith(
      'project-summary',
      null,
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'claude-code',
        model: 'haiku',
        prompt: expect.stringContaining('Write one short product summary'),
      }),
    );
    expect(updateSummaryIfBlankMock).toHaveBeenCalledWith(
      'project-1',
      'Desktop app for coordinating multiple coding agents.',
    );
    expect(updateProjectMock).toHaveBeenCalledOnce();
    expect(updateProjectMock).toHaveBeenCalledWith('project-1', {
      logoPath: expect.any(String),
      logoSource: 'generated',
    });
  });

  it('requires a saved OpenAI API key', async () => {
    findProjectByIdMock.mockResolvedValue({
      ...project,
      summary: null,
    });
    getSettingMock.mockResolvedValue({
      openAiApiKey: '',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
    });

    await expect(
      generateProjectLogo({ projectId: 'project-1' }),
    ).rejects.toThrow('OpenAI API key is required to generate project logos');

    expect(fetch).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('aborts when a missing project summary cannot be generated', async () => {
    findProjectByIdMock.mockResolvedValue({
      ...project,
      summary: null,
    });
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
    });
    decryptMock.mockReturnValue('stored-key');
    generateTextMock.mockResolvedValue(null);

    await expect(
      generateProjectLogo({ projectId: 'project-1' }),
    ).rejects.toThrow('Project summary is required to generate project logos');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces OpenAI generation failures', async () => {
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-image-2',
    });
    decryptMock.mockReturnValue('stored-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: { message: 'Invalid API key' },
      }),
    } as Response);

    await expect(
      generateProjectLogo({ projectId: 'project-1' }),
    ).rejects.toThrow(
      'OpenAI image generation failed (401 Unauthorized): Invalid API key',
    );
  });

  it('rejects non-GPT-image OpenAI image models', async () => {
    getSettingMock.mockResolvedValue({
      openAiApiKey: 'encrypted-key',
      openAiImageGenerationEnabled: true,
      openAiImageModel: 'gpt-4.1',
    });
    decryptMock.mockReturnValue('stored-key');

    await expect(
      generateProjectLogo({ projectId: 'project-1' }),
    ).rejects.toThrow('OpenAI image model must be a GPT-image model');

    expect(fetch).not.toHaveBeenCalled();
  });
});
