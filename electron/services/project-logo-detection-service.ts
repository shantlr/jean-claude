import * as fs from 'fs/promises';
import * as path from 'path';

import type { DetectedProjectLogo } from '@shared/types';
import { getImageMimeType } from '@shared/image-types';


const LOGO_CANDIDATES: {
  relativePath: string;
  label: string;
  source: DetectedProjectLogo['source'];
}[] = [
  { relativePath: 'public/favicon.ico', label: 'Web favicon', source: 'web' },
  { relativePath: 'public/favicon.png', label: 'Web favicon', source: 'web' },
  {
    relativePath: 'public/apple-touch-icon.png',
    label: 'Apple touch icon',
    source: 'web',
  },
  { relativePath: 'public/icon.png', label: 'Public icon', source: 'web' },
  { relativePath: 'public/logo.png', label: 'Public logo', source: 'web' },
  { relativePath: 'app/icon.png', label: 'App icon', source: 'asset' },
  { relativePath: 'assets/icon.png', label: 'Asset icon', source: 'asset' },
  { relativePath: 'assets/logo.png', label: 'Asset logo', source: 'asset' },
];

const WORKSPACE_CONTAINER_DIRS = new Set([
  'apps',
  'packages',
  'examples',
  'clients',
  'mobile',
  'frontend',
  'web',
]);

const SKIP_WORKSPACE_DIRS = new Set([
  '.git',
  '.jean-claude',
  '.next',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const MAX_WORKSPACE_ROOTS = 80;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && !!getImageMimeType(filePath);
  } catch {
    return false;
  }
}

function getRelativeLabel(projectPath: string, rootPath: string): string {
  const relative = path.relative(projectPath, rootPath);
  return relative ? relative.split(path.sep).join('/') : '';
}

function withRootLabel(
  label: string,
  projectPath: string,
  rootPath: string,
): string {
  const relative = getRelativeLabel(projectPath, rootPath);
  return relative ? `${relative}: ${label}` : label;
}

async function collectWorkspaceRoots(projectPath: string): Promise<string[]> {
  const roots = [projectPath];

  async function addChildren(parentPath: string, depth: number): Promise<void> {
    if (depth > 2 || roots.length >= MAX_WORKSPACE_ROOTS) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(parentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (roots.length >= MAX_WORKSPACE_ROOTS) return;
      if (!entry.isDirectory() || SKIP_WORKSPACE_DIRS.has(entry.name)) continue;

      const childPath = path.join(parentPath, entry.name);
      const parentName = path.basename(parentPath);
      const isWorkspaceContainer = WORKSPACE_CONTAINER_DIRS.has(entry.name);
      const isInsideWorkspaceContainer =
        WORKSPACE_CONTAINER_DIRS.has(parentName);
      const shouldAddRoot = depth > 0 || !isWorkspaceContainer;

      if (shouldAddRoot) roots.push(childPath);
      if (isWorkspaceContainer || isInsideWorkspaceContainer) {
        await addChildren(childPath, depth + 1);
      }
    }
  }

  await addChildren(projectPath, 0);
  return roots;
}

async function collectDirectIcons(
  projectPath: string,
  rootPath: string,
): Promise<DetectedProjectLogo[]> {
  const icons = await Promise.all(
    LOGO_CANDIDATES.map(async (candidate) => {
      const candidatePath = path.join(rootPath, candidate.relativePath);
      if (!(await fileExists(candidatePath))) return null;
      return {
        path: candidatePath,
        label: withRootLabel(candidate.label, projectPath, rootPath),
        source: candidate.source,
      };
    }),
  );

  return icons.filter((logo): logo is DetectedProjectLogo => logo !== null);
}

async function collectAndroidIcons(
  projectPath: string,
  rootPath: string,
): Promise<DetectedProjectLogo[]> {
  const resDir = path.join(rootPath, 'android', 'app', 'src', 'main', 'res');
  try {
    const entries = await fs.readdir(resDir, { withFileTypes: true });
    const icons: DetectedProjectLogo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('mipmap')) continue;
      const iconPath = path.join(resDir, entry.name, 'ic_launcher.png');
      if (await fileExists(iconPath)) {
        icons.push({
          path: iconPath,
          label: withRootLabel(`Android ${entry.name}`, projectPath, rootPath),
          source: 'android',
        });
      }
    }
    return icons;
  } catch {
    return [];
  }
}

async function collectIosIcons(
  projectPath: string,
  rootPath: string,
): Promise<DetectedProjectLogo[]> {
  const iosDir = path.join(rootPath, 'ios');
  const icons: DetectedProjectLogo[] = [];

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > 5 || icons.length >= 20) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const isAppIconSet = dirPath.endsWith('AppIcon.appiconset');
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
      } else if (isAppIconSet && entry.name.toLowerCase().endsWith('.png')) {
        icons.push({
          path: entryPath,
          label: withRootLabel(`iOS ${entry.name}`, projectPath, rootPath),
          source: 'ios',
        });
      }
    }
  }

  await walk(iosDir, 0);
  return icons;
}

export async function detectProjectLogos(
  projectPath: string,
): Promise<DetectedProjectLogo[]> {
  const roots = await collectWorkspaceRoots(projectPath);
  const logosByRoot = await Promise.all(
    roots.map(async (rootPath) => [
      ...(await collectDirectIcons(projectPath, rootPath)),
      ...(await collectAndroidIcons(projectPath, rootPath)),
      ...(await collectIosIcons(projectPath, rootPath)),
    ]),
  );

  const seen = new Set<string>();
  return logosByRoot.flat().filter((logo) => {
    if (seen.has(logo.path)) return false;
    seen.add(logo.path);
    return true;
  });
}
