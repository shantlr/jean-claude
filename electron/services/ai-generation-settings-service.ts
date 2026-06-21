import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';


import { app } from 'electron';

import {
  DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
  isOpenAiLogoBaseImageId,
  OPENAI_LOGO_BASE_IMAGES,
  type OpenAiLogoBaseImageId,
} from '@shared/openai-logo-bases';
import {
  getImageMimeType,
  getImageMimeTypeFromBytes,
} from '@shared/image-types';


import { SettingsRepository } from '../database/repositories/settings';

const OPENAI_BASE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function getBundledBaseImagePath(resourceName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', resourceName)
    : path.join(process.cwd(), 'resources', 'assets', resourceName);
}

export function getOpenAiBuiltinBaseImagePath(
  id: OpenAiLogoBaseImageId | undefined,
): string {
  const baseImage =
    OPENAI_LOGO_BASE_IMAGES.find((item) => item.id === id) ??
    OPENAI_LOGO_BASE_IMAGES.find(
      (item) => item.id === DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
    )!;
  return getBundledBaseImagePath(baseImage.resourceName);
}

function getAiGenerationDir(): string {
  return path.join(app.getPath('userData'), 'ai-generation');
}

async function removeManagedBaseImage(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    if (path.dirname(filePath) !== getAiGenerationDir()) return;
    await fs.unlink(filePath);
  } catch {
    // Best effort cleanup; stale reference images are harmless.
  }
}

async function readOpenAiBaseImage(sourcePath: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const extensionMimeType = getImageMimeType(sourcePath);
  if (
    !extensionMimeType ||
    !OPENAI_BASE_IMAGE_MIME_TYPES.has(extensionMimeType)
  ) {
    throw new Error('OpenAI base image must be a PNG, JPEG, or WebP file');
  }

  const buffer = await fs.readFile(sourcePath);
  const detectedMimeType = getImageMimeTypeFromBytes(buffer);
  if (
    !detectedMimeType ||
    !OPENAI_BASE_IMAGE_MIME_TYPES.has(detectedMimeType) ||
    detectedMimeType !== extensionMimeType
  ) {
    throw new Error(
      'OpenAI base image must be a valid PNG, JPEG, or WebP file',
    );
  }

  return { buffer, mimeType: detectedMimeType };
}

export async function saveOpenAiBaseImage(sourcePath: string) {
  const { buffer } = await readOpenAiBaseImage(sourcePath);

  const aiGenerationDir = getAiGenerationDir();
  await fs.mkdir(aiGenerationDir, { recursive: true });

  const extension = path.extname(sourcePath).toLowerCase();
  const baseImagePath = path.join(
    aiGenerationDir,
    `openai-base-${randomUUID()}${extension}`,
  );
  await fs.writeFile(baseImagePath, buffer);

  const existing = await SettingsRepository.get('aiGeneration');
  await SettingsRepository.set('aiGeneration', {
    ...existing,
    openAiBaseImageMode: 'custom',
    openAiBaseImagePath: baseImagePath,
    openAiBaseImageName: path.basename(sourcePath),
  });
  await removeManagedBaseImage(existing.openAiBaseImagePath);

  return SettingsRepository.get('aiGeneration');
}

export async function setOpenAiBaseImageSelection({
  mode,
  builtinId,
}: {
  mode: 'builtin' | 'custom';
  builtinId?: string;
}) {
  const existing = await SettingsRepository.get('aiGeneration');
  if (mode === 'custom') {
    if (!existing.openAiBaseImagePath) {
      throw new Error('Choose a custom base image before selecting it');
    }
    await SettingsRepository.set('aiGeneration', {
      ...existing,
      openAiBaseImageMode: 'custom',
    });
    return SettingsRepository.get('aiGeneration');
  }

  if (builtinId !== undefined && !isOpenAiLogoBaseImageId(builtinId)) {
    throw new Error('Unknown OpenAI base image');
  }

  await SettingsRepository.set('aiGeneration', {
    ...existing,
    openAiBaseImageMode: 'builtin',
    openAiBaseImageBuiltin: builtinId ?? DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
  });
  return SettingsRepository.get('aiGeneration');
}

export async function listOpenAiBaseImageOptions() {
  const setting = await SettingsRepository.get('aiGeneration');
  const builtin = await Promise.all(
    OPENAI_LOGO_BASE_IMAGES.map(async (baseImage) => {
      const filePath = getBundledBaseImagePath(baseImage.resourceName);
      const buffer = await fs.readFile(filePath);
      return {
        id: baseImage.id,
        name: baseImage.name,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      };
    }),
  );

  return {
    mode:
      setting.openAiBaseImageMode ??
      (setting.openAiBaseImagePath ? 'custom' : 'builtin'),
    builtinId:
      setting.openAiBaseImageBuiltin ?? DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
    custom: setting.openAiBaseImagePath
      ? {
          name: setting.openAiBaseImageName ?? 'Custom base image',
          dataUrl: await readImageAsDataUrl(setting.openAiBaseImagePath),
        }
      : null,
    builtin,
  };
}

async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    const mimeType =
      getImageMimeTypeFromBytes(buffer) ?? getImageMimeType(filePath);
    if (!mimeType) return null;
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function removeOpenAiBaseImage() {
  const existing = await SettingsRepository.get('aiGeneration');
  await SettingsRepository.set('aiGeneration', {
    ...existing,
    openAiBaseImageMode: 'builtin',
    openAiBaseImagePath: null,
    openAiBaseImageName: null,
  });
  await removeManagedBaseImage(existing.openAiBaseImagePath);
  return SettingsRepository.get('aiGeneration');
}
