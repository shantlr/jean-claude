import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import { app } from 'electron';

import {
  getImageMimeType,
  getImageMimeTypeFromBytes,
} from '@shared/image-types';
import {
  DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
  isOpenAiLogoBaseImageId,
} from '@shared/openai-logo-bases';
import { isOpenAiImageModel } from '@shared/types';

import { ProjectRepository } from '../database/repositories/projects';
import { SettingsRepository } from '../database/repositories/settings';
import { dbg } from '../lib/debug';

import { getOpenAiBuiltinBaseImagePath } from './ai-generation-settings-service';
import { encryptionService } from './encryption-service';
import { generateProjectSummary } from './project-summary-generation-service';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

function normalizeOpenAiImageModel(model: string | undefined): string {
  const trimmed = model?.trim() || DEFAULT_IMAGE_MODEL;
  if (!isOpenAiImageModel(trimmed)) {
    throw new Error('OpenAI image model must be a GPT-image model');
  }
  return trimmed;
}

function buildLogoImagePrompt(project: {
  name: string;
  path: string;
  color: string;
  logoPromptContext?: string | null;
}): string {
  const extraContext = project.logoPromptContext?.trim()
    ? `\nAdditional user context:\n${project.logoPromptContext.trim()}\n`
    : '';

  return `Create one polished square app icon for this software project. Use the provided reference direction: friendly geometric adventurer mascot, cute project avatar, soft vector-like rendering, consistent dark outline, simple face, tiny contextual accessory.

Project name: ${project.name}
Repository path: ${project.path}
Brand color: ${project.color}
${extraContext}

Style requirements:
- Single centered mascot on transparent background.
- Large geometric base body: rounded triangle, squircle, capsule, bean, circle, shield, or hexagon.
- Two simple dark eyes, tiny warm smile, optional subtle cheek dots.
- Use project brand color as main body color with 2-4 soft supporting pastel colors.
- Add exactly 1-2 small role accessories inferred from project name/path: hard hat, goggles, cap, backpack, badge, wrench, chart, magnifier, terminal prompt, envelope, compass, antenna, rocket, or similar.
- Consistent dark navy rounded outline. Soft gentle shading, small highlights, and optional soft oval ground shadow.
- Body fills 65-80% of canvas. Clear and recognizable at 24px.
- Cute, memorable, polished, cohesive icon-family look.

Avoid:
- Text, letters, corporate marks, monograms, abstract logos, complex scenes, tiny clutter, photorealism, sharp aggressive shapes, existing brand mascots, brand parody.`;
}

function getProjectShortSummary(project: {
  name: string;
  path: string;
  summary?: string | null;
}): string {
  const summary = project.summary?.trim();
  if (summary) return summary.slice(0, 600);
  return `${project.name} (${project.path})`;
}

function buildLogoImageEditPrompt(project: {
  name: string;
  path: string;
  color: string;
  summary?: string | null;
  logoPromptContext?: string | null;
}): string {
  const extraContext = project.logoPromptContext?.trim()
    ? `\nAdditional user context: ${project.logoPromptContext.trim()}\n`
    : '';

  return `Create one polished square app icon for this software project.

Project name: ${project.name}
Brand color: ${project.color}
Project summary: ${getProjectShortSummary(project)}
${extraContext}

Follow the original image's visual instructions and art direction. Use it as a style, composition, and quality reference for a new original app icon. Do not copy any exact identity, text, or trademarked elements from the reference image.`;
}

async function getOpenAiLogoConfig(): Promise<{
  apiKey: string;
  model: string;
  baseImagePath: string | null;
  baseImageName: string | null;
  logoPromptContext: string | null;
}> {
  const setting = await SettingsRepository.get('aiGeneration');
  if (!setting.openAiImageGenerationEnabled) {
    throw new Error('OpenAI image generation is disabled');
  }
  const model = normalizeOpenAiImageModel(setting.openAiImageModel);

  if (setting.openAiApiKey) {
    try {
      const decrypted = encryptionService.decrypt(setting.openAiApiKey).trim();
      if (decrypted) {
        return {
          apiKey: decrypted,
          model,
          ...(await getSelectedBaseImage(setting)),
          logoPromptContext: setting.openAiLogoPromptContext ?? null,
        };
      }
    } catch (error) {
      dbg.agent('Failed to decrypt OpenAI API key setting: %O', error);
      throw new Error('Failed to read saved OpenAI API key');
    }
  }

  throw new Error('OpenAI API key is required to generate project logos');
}

async function getSelectedBaseImage(setting: {
  openAiBaseImageMode?: 'builtin' | 'custom';
  openAiBaseImageBuiltin?: string;
  openAiBaseImagePath?: string | null;
  openAiBaseImageName?: string | null;
}): Promise<{ baseImagePath: string | null; baseImageName: string | null }> {
  if (
    (setting.openAiBaseImageMode ??
      (setting.openAiBaseImagePath ? 'custom' : 'builtin')) === 'custom' &&
    setting.openAiBaseImagePath
  ) {
    return {
      baseImagePath: setting.openAiBaseImagePath,
      baseImageName: setting.openAiBaseImageName ?? 'Custom base image',
    };
  }

  const builtinId = isOpenAiLogoBaseImageId(setting.openAiBaseImageBuiltin)
    ? setting.openAiBaseImageBuiltin
    : DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID;
  const filePath = getOpenAiBuiltinBaseImagePath(builtinId);

  try {
    await fs.access(filePath);
    return { baseImagePath: filePath, baseImageName: 'Base image reference' };
  } catch {
    return { baseImagePath: null, baseImageName: null };
  }
}

async function buildOpenAiImageEditBody({
  config,
  project,
}: {
  config: {
    model: string;
    baseImagePath: string;
    baseImageName: string | null;
  };
  project: {
    name: string;
    path: string;
    color: string;
    summary?: string | null;
    logoPromptContext?: string | null;
  };
}): Promise<FormData> {
  const buffer = await fs.readFile(config.baseImagePath);
  const mimeType =
    getImageMimeTypeFromBytes(buffer) ?? getImageMimeType(config.baseImagePath);
  if (!mimeType) throw new Error('Unsupported OpenAI base image file type');
  const formData = new FormData();
  formData.append('model', config.model);
  formData.append('prompt', buildLogoImageEditPrompt(project));
  formData.append(
    'image',
    new Blob([buffer], { type: mimeType }),
    config.baseImageName ?? path.basename(config.baseImagePath),
  );
  return formData;
}

function extractGeneratedImage(value: unknown): Buffer | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== 'object') return null;
  const b64Json = (first as { b64_json?: unknown }).b64_json;
  if (typeof b64Json !== 'string' || b64Json.length === 0) return null;
  return Buffer.from(b64Json, 'base64');
}

async function readOpenAiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = (body as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    return JSON.stringify(body);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
}

async function generateLogoImage({
  config,
  project,
}: {
  config: Awaited<ReturnType<typeof getOpenAiLogoConfig>>;
  project: {
    name: string;
    path: string;
    color: string;
    summary?: string | null;
    logoPromptContext?: string | null;
  };
}): Promise<Buffer> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), LOGO_TIMEOUT_MS);

  try {
    const request: {
      url: string;
      headers: Record<string, string>;
      body: string | FormData;
    } = config.baseImagePath
      ? {
          url: 'https://api.openai.com/v1/images/edits',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: await buildOpenAiImageEditBody({
            config: {
              model: config.model,
              baseImagePath: config.baseImagePath,
              baseImageName: config.baseImageName,
            },
            project: {
              ...project,
              logoPromptContext: config.logoPromptContext,
            },
          }),
        }
      : {
          url: 'https://api.openai.com/v1/images/generations',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            prompt: buildLogoImagePrompt({
              ...project,
              logoPromptContext: config.logoPromptContext,
            }),
          }),
        };

    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorMessage = await readOpenAiError(response);
      dbg.agent(
        'OpenAI logo image generation failed: %d %s: %s',
        response.status,
        response.statusText,
        errorMessage,
      );
      throw new Error(
        `OpenAI image generation failed (${response.status} ${response.statusText}): ${errorMessage}`,
      );
    }

    const image = extractGeneratedImage(await response.json());
    if (!image) {
      throw new Error('OpenAI image generation returned no image');
    }
    if (getImageMimeTypeFromBytes(image) !== 'image/png') {
      throw new Error('OpenAI image generation did not return a PNG image');
    }
    return image;
  } catch (error) {
    dbg.agent('OpenAI logo image generation failed: %O', error);
    if (error instanceof Error) throw error;
    throw new Error('OpenAI image generation failed');
  } finally {
    clearTimeout(timeout);
  }
}

function getLogosDir(): string {
  return path.join(app.getPath('userData'), 'project-logos');
}

async function writeLogoFile({
  projectId,
  extension,
  content,
}: {
  projectId: string;
  extension: string;
  content: Buffer | string;
}): Promise<string> {
  const logosDir = getLogosDir();
  await fs.mkdir(logosDir, { recursive: true });
  const filePath = path.join(
    logosDir,
    `${projectId}-${randomUUID()}${extension}`,
  );
  await fs.writeFile(filePath, content);
  return filePath;
}

async function removeOldLogo(logoPath: string | null | undefined) {
  if (!logoPath) return;
  try {
    if (path.dirname(logoPath) !== getLogosDir()) return;
    await fs.unlink(logoPath);
  } catch {
    // Best effort cleanup; stale logo files are harmless.
  }
}

export async function uploadProjectLogo({
  projectId,
  sourcePath,
}: {
  projectId: string;
  sourcePath: string;
}) {
  const project = await ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');

  const mimeType = getImageMimeType(sourcePath);
  if (!mimeType) throw new Error('Unsupported logo file type');

  const stat = await fs.stat(sourcePath);
  if (stat.size > MAX_LOGO_BYTES) {
    throw new Error('Logo must be 5 MB or smaller');
  }

  const ext = path.extname(sourcePath).toLowerCase();
  const buffer = await fs.readFile(sourcePath);
  const logoPath = await writeLogoFile({
    projectId,
    extension: ext,
    content: buffer,
  });
  try {
    const updatedProject = await ProjectRepository.update(projectId, {
      logoPath,
      logoSource: 'uploaded',
    });
    await removeOldLogo(project.logoPath);
    return updatedProject;
  } catch (error) {
    await removeOldLogo(logoPath);
    throw error;
  }
}

export async function generateProjectLogo(projectId: string) {
  let project = await ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');
  const config = await getOpenAiLogoConfig();

  if (!project.summary?.trim()) {
    const summary = await generateProjectSummary({ project });
    if (!summary) {
      throw new Error('Project summary is required to generate project logos');
    }
    project = await ProjectRepository.update(projectId, { summary });
  }

  const image = await generateLogoImage({ config, project });
  const logoPath = await writeLogoFile({
    projectId,
    extension: '.png',
    content: image,
  });
  try {
    const updatedProject = await ProjectRepository.update(projectId, {
      logoPath,
      logoSource: 'generated',
    });
    await removeOldLogo(project.logoPath);
    return updatedProject;
  } catch (error) {
    await removeOldLogo(logoPath);
    throw error;
  }
}

export async function removeProjectLogo(projectId: string) {
  const project = await ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');
  const updatedProject = await ProjectRepository.update(projectId, {
    logoPath: null,
    logoSource: null,
  });
  await removeOldLogo(project.logoPath);
  return updatedProject;
}

export async function cleanupProjectLogoPath(
  logoPath: string | null | undefined,
): Promise<void> {
  await removeOldLogo(logoPath);
}
