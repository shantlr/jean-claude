import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import { app } from 'electron';

import type { AgentBackendType } from '@shared/agent-backend-types';
import { getImageMimeType } from '@shared/image-types';

import { ProjectRepository } from '../database/repositories/projects';
import { dbg } from '../lib/debug';

import { generateText } from './ai-generation-service';
import { resolveAiSkillSlot } from './ai-skill-slot-resolver';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TIMEOUT_MS = 10 * 60 * 1000;

const LOGO_SCHEMA = {
  type: 'object',
  properties: {
    svg: { type: 'string' },
  },
  required: ['svg'],
} as const;

function buildLogoPrompt(project: {
  name: string;
  path: string;
  color: string;
}): string {
  return `Create a square SVG logo for this software project. The logo should feel like a distinctive app mascot/avatar, not a generic product mark.\n\nProject name: ${project.name}\nRepository path: ${project.path}\nBrand color: ${project.color}\n\nVisual direction:\n- Modern app mascot avatar: friendly character head or bust, simple vector shapes, memorable silhouette.\n- Readable at 24px: avoid tiny details, dense linework, and text-heavy marks.\n- Use the brand color as the primary color, with 2-4 supporting colors maximum.\n- Add 1-2 contextual accessories inferred from project name/path, but keep them subtle.\n- Prefer developer-tool personality: robot, helper, builder, explorer, terminal companion, or tiny app creature.\n- Do not copy Reddit, GitHub, Android, Apple, or any existing mascot. Make an original character.\n\nExample concepts to emulate in spirit, not copy:\n- A rounded robot head wearing tiny terminal goggles, with a small command prompt badge.\n- A helpful builder mascot with hard-hat-like top shape and small pipeline nodes around the head.\n- A browser-app avatar with a visor shaped like a tab bar and small sparkle pixels.\n- A mobile-app companion with soft antenna-like ears and a phone-screen chest badge.\n- An AI tooling mascot with a simple face, orbit dots, and one geometric neural accent.\n\nSVG requirements:\n- Return only JSON matching schema.\n- svg must be a complete standalone <svg>...</svg> string.\n- Use viewBox="0 0 512 512".\n- No scripts, external URLs, raster images, animation, or event handlers.\n- No text unless it is a tiny 1-2 letter badge derived from project initials.\n- Use accessible, clean SVG structure with basic shapes and paths.\n- Avoid generic initials-only monograms unless no better mascot idea fits.`;
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

function extractSvg(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('svg' in value)) return null;
  const svg = (value as { svg: unknown }).svg;
  if (typeof svg !== 'string') return null;
  const trimmed = svg.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;
  if (/<script\b/i.test(trimmed) || /\bon\w+=/i.test(trimmed)) return null;
  return trimmed;
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
  const project = await ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');

  const slotConfig = await resolveAiSkillSlot(
    'logo-generation',
    project.aiSkillSlots,
  );
  const backend: AgentBackendType =
    slotConfig?.backend ??
    (project.defaultAgentBackend === 'opencode' ? 'opencode' : 'claude-code');
  const model =
    slotConfig?.model ??
    (project.defaultAgentModelPreference &&
    project.defaultAgentModelPreference !== 'default'
      ? project.defaultAgentModelPreference
      : 'haiku');
  const skillName = slotConfig?.skillName ?? undefined;
  const result = await generateText({
    backend,
    model,
    skillName,
    outputSchema: LOGO_SCHEMA,
    timeoutMs: LOGO_TIMEOUT_MS,
    prompt: buildLogoPrompt(project),
  });

  const svg = extractSvg(result);
  if (!svg) {
    dbg.agent('Failed to generate project logo: invalid SVG result');
    throw new Error('Failed to generate logo');
  }

  const logoPath = await writeLogoFile({
    projectId,
    extension: '.svg',
    content: svg,
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
