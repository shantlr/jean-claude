import { mkdir, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ProjectRepository } from '../database/repositories/projects';
import { TaskRepository } from '../database/repositories/tasks';
import { dbg } from '../lib/debug';

const SYSTEM_PROJECT_DIR = path.join(
  os.homedir(),
  '.jean-claude',
  'system-project',
);

const WORKSPACES_DIR = path.join(SYSTEM_PROJECT_DIR, 'workspaces');

/**
 * Returns the system project, creating it lazily on first use.
 * The system project is a hidden internal project used for utility tasks
 * like agent-driven skill creation.
 *
 * Uses a module-level promise lock to prevent duplicate creation from
 * concurrent calls (TOCTOU race).
 */
type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof ProjectRepository.findByType>>
>;

let systemProjectPromise: Promise<ProjectRow> | null = null;

export function getOrCreateSystemProject(): Promise<ProjectRow> {
  if (!systemProjectPromise) {
    systemProjectPromise = (async () => {
      const existing = await ProjectRepository.findByType('system');
      if (existing) return existing;

      // Ensure directory exists
      await mkdir(SYSTEM_PROJECT_DIR, { recursive: true });

      return ProjectRepository.create({
        name: '@builtin/skills',
        path: SYSTEM_PROJECT_DIR,
        type: 'system',
        color: '#6b7280',
        updatedAt: new Date().toISOString(),
      });
    })().catch((err) => {
      // Reset on failure so subsequent calls retry
      systemProjectPromise = null;
      throw err;
    });
  }
  return systemProjectPromise;
}

/**
 * Returns the workspace path for a skill-creation task.
 * Creates the directory if it doesn't exist.
 */
export async function getSkillWorkspacePath(taskId: string): Promise<string> {
  const workspacePath = path.join(WORKSPACES_DIR, taskId);
  await mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

/**
 * Validates that a workspace path is within the expected workspaces directory.
 * Prevents path traversal attacks from renderer-supplied paths.
 * Uses realpath to resolve symlinks, preventing symlink-based escapes.
 */
export async function assertValidWorkspacePath(
  workspacePath: string,
): Promise<void> {
  let resolved: string;
  try {
    resolved = await realpath(workspacePath);
  } catch {
    // Path doesn't exist yet — fall back to lexical check
    resolved = path.resolve(workspacePath);
  }
  const expectedBase = path.resolve(WORKSPACES_DIR);
  if (
    !resolved.startsWith(expectedBase + path.sep) &&
    resolved !== expectedBase
  ) {
    throw new Error(`Invalid workspace path: must be under ${expectedBase}`);
  }
}

/**
 * Validates that a source skill path is under a known skill directory.
 * Uses realpath to resolve symlinks, preventing symlink-based escapes.
 */
export async function assertValidSourceSkillPath(
  skillPath: string,
): Promise<void> {
  let resolved: string;
  try {
    resolved = await realpath(skillPath);
  } catch {
    resolved = path.resolve(skillPath);
  }
  const configBase = path.resolve(
    path.join(os.homedir(), '.config', 'jean-claude', 'skills'),
  );
  const claudeBase = path.resolve(path.join(os.homedir(), '.claude', 'skills'));
  if (
    !resolved.startsWith(configBase + path.sep) &&
    !resolved.startsWith(claudeBase + path.sep)
  ) {
    throw new Error(
      'Invalid sourceSkillPath: must be under a known skill directory',
    );
  }
}

/**
 * Cleans up a skill workspace directory.
 * Validates the path is within the expected workspaces directory before deletion.
 */
export async function cleanupSkillWorkspace(
  workspacePath: string,
): Promise<void> {
  await assertValidWorkspacePath(workspacePath);
  await rm(workspacePath, { recursive: true, force: true });
}

/**
 * Cleans up orphaned workspace directories that no longer have corresponding tasks.
 * Should be called on app startup.
 */
export async function cleanupOrphanedWorkspaces(): Promise<void> {
  try {
    const entries = await readdir(WORKSPACES_DIR, {
      withFileTypes: true,
    }).catch(() => []);
    if (entries.length === 0) return;

    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (dirNames.length === 0) return;

    // Single batch query instead of one per directory
    const existingIds = await TaskRepository.findExistingIds(dirNames);

    await Promise.all(
      dirNames
        .filter((taskId) => !existingIds.has(taskId))
        .map((taskId) => {
          const orphanPath = path.join(WORKSPACES_DIR, taskId);
          dbg.db('Cleaning up orphaned skill workspace: %s', orphanPath);
          return rm(orphanPath, { recursive: true, force: true }).catch(
            () => {},
          );
        }),
    );
  } catch {
    // Non-critical — workspaces dir may not exist yet
  }
}
